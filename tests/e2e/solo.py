"""Parcours solo : partie complète contre l'ordinateur (Chrome simulé). Lancer : python3 -m http.server 8123 puis ce script."""
import sys, random
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8123/index.html'
mode = sys.argv[1] if len(sys.argv) > 1 else 'solo'
bots = int(sys.argv[2]) if len(sys.argv) > 2 else 3
shot = sys.argv[3] if len(sys.argv) > 3 else None
vp = {'width': 834, 'height': 1194}

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_context(viewport=vp, device_scale_factor=1).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.add_init_script('window.SKYJO_BOT_DELAY=5')
    pg.goto(URL)
    pg.click('#segMode button[data-m="%s"]' % mode)
    pg.click('#segBots button[data-b="%d"]' % bots)
    pg.click('#btnNew')
    rounds = 0; steps = 0
    def js(s): return pg.evaluate(s)
    while steps < 4000:
        steps += 1
        st = js('''(()=>{const el=document.getElementById('seat0'); return 1})()''')
        pg.wait_for_timeout(10)
        if pg.is_visible('#roundOver:not([hidden])'):
            if shot and rounds == 0:
                pg.screenshot(path=shot + '_over.png')
            if pg.locator('#roBottom [data-act="again"]').count():
                print('Partie terminée, manches :', rounds + 1); break
            rounds += 1
            pg.locator('#roBottom [data-act="next"]').click(); continue
        # case cliquable la plus basse du joueur (siège du bas / zone principale)
        cells = pg.locator('#mine .card.can')
        if cells.count():
            if shot and steps == 6: pg.screenshot(path=shot + '_play.png')
            cells.nth(random.randrange(cells.count())).click(); continue
        pile = '#pileDeck'
        if pg.locator(pile + '.can').count():
            pg.click(pile); continue
    print('erreurs :', errs[:5], 'étapes :', steps)
    b.close()
