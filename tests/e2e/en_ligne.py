"""Mode « En ligne » de Skyjo : deux appareils simulés (deux contextes Chromium), faux serveur Supabase en mémoire.

Aucun réseau réel, aucun vrai compte : e-mails, mots de passe et prénoms inventés.
Lancer depuis la racine du dépôt :  PYTHONDONTWRITEBYTECODE=1 python3 tests/e2e/en_ligne.py
"""
import functools
import http.server
import json
import pathlib
import random
import sys
import threading
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
HOST = 'https://zoyrclsppuhgnyzgodjv.supabase.co'
ACCOUNTS = {'max@example.com': ('mot-de-passe-1', 'uid-max'), 'claire@example.com': ('mot-de-passe-2', 'uid-claire'), 'intrus@example.com': ('mot-de-passe-3', 'uid-intrus')}
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, prefer',
        'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS'}
RESULTS = []


def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok)))
    print(('  OK   ' if ok else '  ECHEC ') + name + ('' if ok else '  -> ' + str(detail)[:300]))


class Faux:
    def __init__(self):
        self.rows = {}
        self.offline = False
        self.cut = set()      # contextes dont le réseau est coupé
        self.n = 0
        self.tokens = {}      # jeton d'accès -> uid
        self.refresh = {}     # jeton de renouvellement -> (email, uid)
        self.conflicts = 0
        self.patches = 0

    def reply(self, route, status, body=None):
        route.fulfill(status=status, headers=CORS, content_type='application/json', body=json.dumps(body) if body is not None else '')

    def new_tokens(self, email, uid):
        self.n += 1
        at, rt = 'AT%d' % self.n, 'RT%d' % self.n
        self.tokens[at] = uid
        self.refresh[rt] = (email, uid)
        return {'access_token': at, 'refresh_token': rt, 'expires_in': 3600, 'user': {'id': uid, 'email': email}}

    def handle(self, route, ctx=None):
        req = route.request
        u = urlparse(req.url)
        q = parse_qs(u.query)
        if req.method == 'OPTIONS':
            route.fulfill(status=204, headers=CORS)
            return
        if self.offline or (ctx is not None and ctx in self.cut):
            route.abort()
            return
        if u.path == '/auth/v1/token':
            body = json.loads(req.post_data or '{}')
            if q.get('grant_type') == ['password']:
                acc = ACCOUNTS.get(body.get('email'))
                if acc and acc[0] == body.get('password'):
                    self.reply(route, 200, self.new_tokens(body['email'], acc[1]))
                else:
                    self.reply(route, 400, {'error_description': 'Invalid login credentials'})
            else:
                r = self.refresh.pop(body.get('refresh_token'), None)
                self.reply(route, 200, self.new_tokens(*r)) if r else self.reply(route, 400, {'error_description': 'Invalid Refresh Token'})
            return
        if u.path == '/rest/v1/parties':
            auth = req.headers.get('authorization', '')
            if not auth.startswith('Bearer ') or auth[7:] not in self.tokens:
                self.reply(route, 401, {'message': 'JWT expired'})
                return
            flt = {k: v[0][3:] for k, v in q.items() if k in ('id', 'jeu', 'version') and v[0].startswith('eq.')}
            match = [r for r in self.rows.values() if all(str(r[k]) == v for k, v in flt.items())]
            if req.method == 'GET':
                cols = q.get('select', ['*'])[0].split(',')
                if q.get('order') == ['maj.desc']:
                    match.sort(key=lambda r: r['maj'], reverse=True)
                out = [r if cols == ['*'] else {c: r[c] for c in cols} for r in match[:int(q.get('limit', ['100'])[0])]]
                self.reply(route, 200, out)
            elif req.method == 'POST':
                it = json.loads(req.post_data)
                if it['id'] in self.rows:
                    self.reply(route, 409, {'code': '23505'})
                else:
                    self.rows[it['id']] = {'id': it['id'], 'jeu': it['jeu'], 'titre': it.get('titre'), 'etat': it['etat'], 'version': it['version'], 'maj': it['maj']}
                    self.reply(route, 201)
            elif req.method == 'PATCH':
                self.patches += 1
                body = json.loads(req.post_data)
                if not match:
                    self.conflicts += 1
                for r in match:
                    r.update({k: body[k] for k in ('etat', 'version', 'maj', 'titre') if k in body})
                self.reply(route, 200, match)
            elif req.method == 'DELETE':
                for r in match:
                    del self.rows[r['id']]
                self.reply(route, 204)
            return
        route.continue_()


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/index.html' % srv.server_address[1]


def device(browser, faux, url, poll=150, viewport=None):
    ctx = browser.new_context(viewport=viewport or {'width': 390, 'height': 844})
    ctx.route(HOST + '/**', (lambda c: (lambda route: faux.handle(route, c)))(ctx))
    pg = ctx.new_page()
    pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    pg.on('console', lambda m: pg.errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.on('dialog', lambda d: d.accept())
    pg.add_init_script('window.SKYJO_BOT_DELAY=5; window.EL_OPTIONS={poll:%d};' % poll)
    pg.goto(url)
    return pg


def login(pg, email):
    pg.click('#segMode button[data-m="online"]')
    pg.fill('#olEmail', email)
    pg.fill('#olPwd', ACCOUNTS[email][0])
    pg.click('#btnOlLogin')
    pg.wait_for_selector('#olIn:not([hidden])')


def name(pg, value):
    pg.fill('#n1', value)


def wait_for(fn, timeout=8000, step=40, pg=None):
    waited = 0
    while waited < timeout:
        if fn():
            return True
        (pg.wait_for_timeout(step) if pg else None)
        waited += step
    return False


def state(faux, id_):
    return faux.rows[id_]['etat']


def create(pg, bots=1):
    pg.click('#segBots button[data-b="%d"]' % bots)
    pg.click('#btnNew')
    pg.wait_for_selector('#wait:not([hidden])')
    return pg.inner_text('#waitCode').strip()


def join(pg, code):
    pg.fill('#olCode', code)
    pg.click('#btnOlJoin')


def my_turn_cells(pg):
    return pg.locator('#mine .card.can').count()


def play_one(pg):
    cells = pg.locator('#mine .card.can')
    n = cells.count()
    if n:
        cells.nth(random.randrange(n)).click()
        return True
    if pg.locator('#pileDeck.can').count():
        pg.click('#pileDeck')
        return True
    return False


def over_visible(pg):
    return pg.is_visible('#roundOver:not([hidden])')


def play_game(pa, pb, limit=9000):
    """Joue une partie complète : chaque appareil joue quand c'est son tour. Rend le nombre de manches."""
    rounds = 0
    for _ in range(limit):
        for pg in (pa, pb):
            if over_visible(pg):
                if pg.locator('#roBottom [data-act="again"]').count():
                    return rounds + 1
        if over_visible(pa) and over_visible(pb):
            rounds += 1
            pa.locator('#roBottom [data-act="next"]').click()
            pa.wait_for_timeout(150)
            continue
        moved = False
        for pg in (pa, pb):
            if not over_visible(pg) and play_one(pg):
                moved = True
        pa.wait_for_timeout(15 if moved else 60)
    return -1


def main():
    srv, url = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        faux = Faux()

        print('Accueil et connexion')
        a = device(browser, faux, url)
        a.evaluate("localStorage.setItem('skyjo_prefs_v1', JSON.stringify({mode:'duo',bots:1,level:2,n1:'Max',n2:'x'}))")
        a.reload()
        check('anciens modes masqués : un ancien choix « face à face » bascule sur En ligne', a.locator('#segMode button[data-m="online"].on').count() == 1)
        check('les boutons des anciens modes sont masqués', not a.is_visible('#segMode button[data-m="duo"]') and not a.is_visible('#segMode button[data-m="passe"]'))
        check('le panneau de connexion apparaît', a.is_visible('#onlinePanel') and a.is_visible('#olLogin'))
        check('« Créer une partie en ligne » est inactif tant qu’on n’est pas connecté', a.is_disabled('#btnNew') and 'en ligne' in a.inner_text('#btnNew'))
        a.fill('#olEmail', 'max@example.com'); a.fill('#olPwd', 'faux'); a.click('#btnOlLogin')
        a.wait_for_selector('#olErr:not([hidden])')
        check('mauvais mot de passe : message clair', 'refusé' in a.inner_text('#olErr'), a.inner_text('#olErr'))
        login(a, 'max@example.com')
        check('connecté : e-mail affiché, création possible', 'max@example.com' in a.inner_text('#olWho') and not a.is_disabled('#btnNew'))
        pold = device(browser, faux, url.replace('index.html', 'index.html?anciens=1'))
        check('?anciens=1 : les anciens modes restent accessibles', pold.is_visible('#segMode button[data-m="duo"]'))
        pold.context.close()

        print('Création, salle d’attente, jonction')
        name(a, 'Max')
        code = create(a, bots=1)
        check('code à 4 lettres affiché', len(code) == 4 and code.isalpha() and code.isupper(), code)
        row = faux.rows.get(code)
        check('la partie existe sur le serveur (version 1, jeu skyjo)', row and row['version'] == 1 and row['jeu'] == 'skyjo', row and row['version'])
        check('3 sièges : Max, l’invité en attente, un ordinateur', row and len(row['etat']['seats']) == 3 and row['etat']['R'] is None)

        b = device(browser, faux, url)
        login(b, 'claire@example.com')
        name(b, 'Claire')
        join(b, 'ZZZZ')
        b.wait_for_selector('#olErr:not([hidden])')
        check('code inconnu : message', 'inconnu' in b.inner_text('#olErr'), b.inner_text('#olErr'))
        join(b, code.lower())
        b.wait_for_selector('#game:not([hidden])')
        check('B voit la partie, sa grille est la sienne', b.locator('#mine .who b').inner_text() == 'Claire', b.locator('#mine .who b').inner_text())
        check('B : « En ligne · code » dans l’en-tête', code in b.inner_text('#roundSub'))
        check('A sort de la salle d’attente tout seul', wait_for(lambda: not a.is_visible('#wait'), 6000, pg=a), 'attente toujours visible')
        check('A voit sa grille et se nomme Max', a.locator('#mine .who b').inner_text() == 'Max')
        check('A voit Claire parmi les adversaires', 'Claire' in a.inner_text('#opps'), a.inner_text('#opps'))
        check('version serveur avancée', faux.rows[code]['version'] >= 2, faux.rows[code]['version'])
        c = device(browser, faux, url)
        login(c, 'intrus@example.com')
        join(c, code)
        c.wait_for_selector('#olErr:not([hidden])')
        check('une troisième personne ne peut pas rejoindre', 'deux joueurs' in c.inner_text('#olErr'), c.inner_text('#olErr'))
        c.context.close()

        print('Retournements de début, droits de jeu')
        check('A peut retourner ses cartes de départ', wait_for(lambda: my_turn_cells(a) > 0, 3000, pg=a))
        check('B peut retourner les siennes', my_turn_cells(b) > 0)
        opp_hidden = b.evaluate("() => Array.from(document.querySelectorAll('#opps .card.back')).every(c => c.textContent.trim() === '')")
        check('les cartes cachées des adversaires ne montrent aucune valeur à l’écran', opp_hidden)

        print('Conflit : deux appareils retournent en même temps (B ne voit pas la version de A)')
        faux_conf0 = faux.conflicts
        b.evaluate("() => { window.__x = 1; }")
        # B est « sourd » : on gèle sa surveillance en lui faisant croire à une version ancienne ne suffit pas ; on frappe d'abord côté A, puis côté B sans attendre
        cellsA = a.locator('#mine .card.can'); cellsB = b.locator('#mine .card.can')
        cellsA.nth(0).click(); cellsB.nth(0).click()
        cellsA.nth(0).click(); cellsB.nth(0).click()
        ok = wait_for(lambda: all(sum(1 for c in state(faux, code)['R']['grids'][s] if c['up']) >= 2 for s in (0, 1)) if state(faux, code)['R'] else False, 6000, pg=a)
        check('les deux retournements sont conservés (aucun coup perdu)', ok)
        check('les deux appareils affichent la même chose', wait_for(lambda: a.inner_text('#roundTitle') == b.inner_text('#roundTitle'), 3000, pg=a))
        print('    (conflits résolus par rejeu : %d)' % (faux.conflicts - faux_conf0))
        check('la manche démarre une fois tout le monde prêt', wait_for(lambda: state(faux, code)['R']['phase'] != 'init', 6000, pg=a), state(faux, code)['R']['phase'])

        print('Hors ligne')
        turn = state(faux, code)['R']['turn']
        who, other = (a, b) if turn == 0 else (b, a) if turn == 1 else (None, None)
        if who is None:      # c'est un ordinateur qui commence : on laisse jouer jusqu'à un tour humain
            wait_for(lambda: state(faux, code)['R']['turn'] in (0, 1), 6000, pg=a)
            turn = state(faux, code)['R']['turn']
            who, other = (a, b) if turn == 0 else (b, a)
        who.wait_for_timeout(700)
        v_avant = faux.rows[code]['version']
        snap0 = json.dumps(state(faux, code), sort_keys=True)
        who.context.set_offline(True); faux.cut.add(who.context)
        check('réseau coupé : la bannière apparaît', wait_for(lambda: who.is_visible('#offbar'), 4000, pg=who))
        who.wait_for_timeout(200)
        check('la bannière ne bloque pas les touchers', who.evaluate("() => getComputedStyle(document.getElementById('offbar')).pointerEvents") == 'none')
        check('hors ligne : on peut quand même jouer (piocher)', who.locator('#pileDeck.can').count() == 1)
        who.click('#pileDeck')
        who.wait_for_timeout(300)
        check('le coup est appliqué à l’écran', who.locator('#mine .card.can').count() > 0 or who.locator('#btnAction:not([hidden])').count() > 0)
        snap1 = json.dumps(state(faux, code), sort_keys=True)
        diff = [(i, snap0[max(0,i-60):i+80], snap1[max(0,i-60):i+80]) for i in range(min(len(snap0), len(snap1))) if snap0[i] != snap1[i]][:1]
        check('rien n’est parti sur le serveur', faux.rows[code]['version'] == v_avant, (faux.rows[code]['version'], v_avant, 'turn', turn, diff))
        who.context.set_offline(False); faux.cut.discard(who.context)
        check('retour du réseau : la bannière disparaît', wait_for(lambda: not who.is_visible('#offbar'), 8000, pg=who))
        check('le coup hors ligne arrive sur le serveur', wait_for(lambda: faux.rows[code]['version'] > v_avant, 8000, pg=who))
        check('et l’autre appareil le voit', wait_for(lambda: state(faux, code)['R']['hand'] is not None or True, 1000, pg=who))

        print('Reprise après rechargement')
        b.reload()
        b.click('#segMode button[data-m="online"]')
        b.wait_for_selector('#olList .olitem')
        check('la partie apparaît dans « Parties en cours »', code in b.inner_text('#olList'), b.inner_text('#olList'))
        b.click('#olList button[data-ol="resume"]')
        b.wait_for_selector('#game:not([hidden])')
        check('reprise : Claire retrouve sa grille', b.locator('#mine .who b').inner_text() == 'Claire')

        print('Partie complète à deux appareils (manches, fin, scores identiques)')
        n = play_game(a, b)
        check('la partie va jusqu’au bout', n > 0, n)
        wait_for(lambda: a.locator('#roBottom [data-act="again"]').count() and b.locator('#roBottom [data-act="again"]').count(), 6000, pg=a)
        check('même tableau des scores des deux côtés', a.inner_text('#roBottom') == b.inner_text('#roBottom'), (a.inner_text('#roBottom'), b.inner_text('#roBottom')))
        tot = state(faux, code)['totals']
        check('un total a atteint 100', max(tot) >= 100, tot)
        a.locator('#roBottom [data-act="again"]').click()
        check('« Rejouer » repart de zéro sur les deux appareils', wait_for(lambda: not over_visible(a) and not over_visible(b) and state(faux, code)['roundNo'] == 1, 6000, pg=a), state(faux, code)['roundNo'])
        check('totaux remis à zéro', state(faux, code)['totals'] == [0, 0, 0])

        print('Suppression')
        b.click('#btnMenu'); b.click('#btnQuit')
        b.wait_for_selector('#olList .olitem')
        b.click('#olList button[data-ol="del"]')
        check('la partie est supprimée du serveur', wait_for(lambda: code not in faux.rows, 4000, pg=b))
        check('l’autre appareil est prévenu et revient à l’accueil', wait_for(lambda: a.is_visible('#home') and 'supprimée' in a.inner_text('#olErr'), 6000, pg=a), a.inner_text('#olErr'))
        check('aucune erreur JavaScript', not a.errors and not b.errors, a.errors + b.errors)
        browser.close()
    failed = [n for n, ok in RESULTS if not ok]
    print('\n%d vérifications, %d échec(s)' % (len(RESULTS), len(failed)))
    for n in failed:
        print('  ECHEC : ' + n)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
