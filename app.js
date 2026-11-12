/* Skyjo — interface. Moteur : engine.js (window.Engine). Sauvegarde : localStorage. */
(function () {
  'use strict';
  var E = window.Engine;
  var KEY = 'skyjo_partie_v1', PKEY = 'skyjo_prefs_v1';
  var BOTS = ['Luna', 'Orion', 'Nova', 'Zéphyr', 'Iris', 'Atlas', 'Mila'];
  var LEVELS = { 1: 'débutant', 2: 'normal', 3: 'fort' };
  var P = { mode: 'solo', bots: 1, level: 2, n1: 'Joueur 1' };
  var G = null, botTimer = null, screen = 'home';
  var BOT_DELAY = window.SKYJO_BOT_DELAY != null ? window.SKYJO_BOT_DELAY : 1000;
  var EL = window.EnLigne, APP_VERSION = '4', OKEY = 'skyjo_online_v1';
  var PL = null;       // plateau (affichage seul) : { id, version, watch }
  var ONL = null;      // partie en ligne en cours : { id, me, version, pending[], pushing, status, watch, retry }

  function $(id) { return document.getElementById(id); }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- Préférences et accueil ---------- */
  (function () {
    var p = load(PKEY);
    if (p) for (var k in P) if (p[k] != null) P[k] = p[k];
    if (P.mode !== 'solo' && P.mode !== 'online') P.mode = 'online';
  })();
  function botRange() { return P.mode === 'solo' ? [1, 7] : [0, 6]; }
  function clampBots() { var r = botRange(); P.bots = Math.max(r[0], Math.min(r[1], P.bots | 0)); }

  function renderHome() {
    clampBots();
    var r = botRange(), i, h = '';
    Array.prototype.forEach.call($('segMode').children, function (b) { b.classList.toggle('on', b.getAttribute('data-m') === P.mode); });
    for (i = r[0]; i <= r[1]; i++) h += '<button data-b="' + i + '"' + (i === P.bots ? ' class="on"' : '') + '>' + i + '</button>';
    $('segBots').innerHTML = h;
    $('botsTitle').textContent = P.mode === 'solo' ? 'Adversaires ordinateur (1 à 7)' : 'Joueurs ordinateur en plus (0 à 6)';
    Array.prototype.forEach.call($('segLevel').children, function (b) { b.classList.toggle('on', +b.getAttribute('data-l') === P.level); });
    $('optLevel').hidden = P.bots === 0;
    $('onlinePanel').hidden = P.mode !== 'online';
    $('btnNew').textContent = P.mode === 'online' ? 'Créer une partie en ligne' : 'Nouvelle partie';
    $('ver').textContent = 'Version ' + APP_VERSION;
    if (P.mode === 'online') olRender(); else $('btnNew').disabled = false;
    $('n1').value = P.n1;
    $('btnResume').hidden = !(G && G.R && !G.over);
    save(PKEY, P);
  }
  (function hero() {
    var h = '', vals = [-2, 0, 4, 8, 12];
    vals.forEach(function (v) { h += faceHTML(v, ''); });
    $('hero').innerHTML = h;
  })();

  function show(name) {
    screen = name;
    ['home', 'game', 'plateau'].forEach(function (s) { $(s).hidden = s !== name; });
    layout();
  }
  function goHome() {
    clearTimeout(botTimer);
    $('roundOver').hidden = true;
    if (PL) { plStop(); G = null; var s0 = load(KEY); if (s0 && s0.R && s0.seats && s0.seats.length === s0.n && !s0.over) G = s0; }
    if (ONL) {      // on quitte la partie en ligne (elle reste ouverte sur le serveur) : retour à la partie locale éventuelle
      onlineStop();
      G = null;
      var sv = load(KEY);
      if (sv && sv.R && sv.seats && sv.seats.length === sv.n && !sv.over) G = sv;
    }
    show('home'); renderHome();
  }

  /* ---------- Cartes ---------- */
  function vcls(v) { return v <= -1 ? 'neg' : v === 0 ? 'zero' : v <= 4 ? 'low' : v <= 8 ? 'mid' : 'high'; }
  function faceHTML(v, extra, attrs) {
    return '<div class="card ' + vcls(v) + (extra || '') + '"' + (attrs || '') + '><span class="ci">' + v + '</span>' + v + '<span class="ci br">' + v + '</span></div>';
  }
  function cellHTML(c, extra, attrs) {
    if (c.gone) return '<div class="card gone"></div>';
    if (!c.up) return '<div class="card back' + extra + '"' + attrs + '></div>';
    return faceHTML(c.v, extra, attrs);
  }
  function board(p, canFn, lastSet, mini) {
    var h = '<div class="board' + (mini ? ' mini' : '') + '">';
    G.R.grids[p].forEach(function (c, i) {
      var can = canFn && canFn(c, i);
      var ex = (can ? ' can' : '') + (lastSet && lastSet[i] ? ' last' : '');
      h += cellHTML(c, ex, can ? ' data-p="' + p + '" data-i="' + i + '"' : '');
    });
    return h + '</div>';
  }

  /* ---------- Mise en route ---------- */
  function newGame() {
    if (P.mode === 'online') { onlineCreate(); return; }
    var seats = [], i;
    seats.push({ name: (P.n1 || '').trim() || 'Joueur 1', bot: 0 });
    for (i = 0; i < P.bots; i++) seats.push({ name: BOTS[i], bot: P.level });
    beginGame(P.mode, seats);
  }
  function beginGame(mode, seats) {
    var z = seats.map(function () { return 0; });
    G = { mode: mode, seats: seats, n: seats.length, totals: z, rounds: [], R: null, nextStarter: -1, view: 0, roundNo: 0, over: false, note: '' };
    newRound();
  }
  function initRoundState() {      // état seulement (sans écran) : rejouable en ligne
    G.roundNo++;
    var R = E.newRound(G.n);
    R.counted = false;
    G.R = R; G.view = 0; G.note = '';
    G.seats.forEach(function (s, p) {
      if (s.bot) E.aiInit(s.bot, R, p).forEach(function (i) { E.initFlip(R, p, i); });
    });
  }
  function newRound() {
    initRoundState();
    show('game');
    step();
  }
  function isHuman(p) { return G.seats[p].bot === 0; }
  function pendingInit() {
    var out = [];
    G.seats.forEach(function (s, p) { if (!s.bot && E.upCount(G.R, p) < 2) out.push(p); });
    return out;
  }
  function name(p) { return G.seats[p].name; }

  /* ---------- Boucle ---------- */
  function step() {
    var R = G.R;
    if (!R) return;      // partie en ligne en attente du deuxième joueur
    clearTimeout(botTimer);
    if (R.phase === 'init' && E.initDone(R)) {
      E.startRound(R, G.nextStarter);
      G.note = name(R.starter) + ' commence.';
    }
    if (R.phase === 'over' && !R.counted) {
      R.counted = true;
      G.totals = E.addScores(G.totals, R);
      G.rounds.push({ s: R.scores.slice(), d: R.doubled ? R.endedBy : -1 });
      G.nextStarter = R.endedBy;
      G.over = E.gameOver(G.totals);
    }
    if (G.mode === 'solo') G.view = 0;
    if (G.mode === 'online') G.view = ME();
    if (G.mode !== 'online') save(KEY, G);      // une partie en ligne vit sur le serveur
    render();
    if (R.phase === 'over') return;
    if (R.phase !== 'init' && !isHuman(R.turn) && (!ONL || ONL.me === 0)) botTimer = setTimeout(botMove, BOT_DELAY);   // en ligne : seul l'appareil qui a créé la partie joue les ordinateurs
  }
  function botMove() {
    var R = G && G.R;
    if (!R || R.phase === 'init' || R.phase === 'over' || isHuman(R.turn)) return;
    jouer({ t: 'bot', turn: R.turn });
  }
  function ME() { return ONL ? ONL.me : 0; }
  /* Un coup = une action rejouable sur un état plus récent (nécessaire en ligne quand deux appareils écrivent presque en même temps). */
  function applyAction(a) {
    var R = G && G.R, ok = false;
    if (a.t === 'join') {
      if (!G.online || G.online.joined) return false;
      G.seats[1].name = a.name || 'Joueur 2'; G.seats[1].wait = 0; G.online.uids[1] = a.uid || null; G.online.joined = true;
      initRoundState(); return true;
    }
    if (!R) return false;
    switch (a.t) {
      case 'init': ok = R.phase === 'init' && E.initFlip(R, a.p, a.i); if (ok) G.note = ''; return ok;
      case 'deck': return R.phase === 'draw' && R.turn === a.p && E.drawDeck(R);
      case 'take': return R.phase === 'draw' && R.turn === a.p && E.takeDiscard(R);
      case 'place': ok = R.phase === 'place' && R.turn === a.p && E.place(R, a.i); if (ok) G.note = describe(R.prevEvents); return ok;
      case 'flip': ok = R.phase === 'flip' && R.turn === a.p && E.flip(R, a.i); if (ok) G.note = describe(R.prevEvents); return ok;
      case 'discard': return R.turn === a.p && E.discardDrawn(R);
      case 'bot':
        if (R.phase === 'init' || R.phase === 'over' || isHuman(R.turn) || R.turn !== a.turn) return false;
        E.aiTurn(G.seats[R.turn].bot, R); G.note = describe(R.prevEvents); return true;
      case 'next':
        if (R.phase !== 'over' || G.over || a.round !== G.roundNo) return false;
        initRoundState(); return true;
      case 'again':
        if (!G.over || a.round !== G.roundNo) return false;
        G.totals = G.seats.map(function () { return 0; }); G.rounds = []; G.nextStarter = -1; G.over = false; G.roundNo = 0;
        initRoundState(); return true;
    }
    return false;
  }
  function jouer(a) {
    if (!applyAction(a)) return false;
    step();
    if (ONL) { ONL.pending.push(a); flush(); }
    return true;
  }
  function describe(evs) {
    if (!evs || !evs.length) return '';
    var parts = [], who = name(evs[0].p);
    evs.forEach(function (e) {
      if (e.act === 'take') parts.push('a pris le ' + e.v + ' de la défausse');
      else if (e.act === 'draw') parts.push('a pioché un ' + e.v);
      else if (e.act === 'place') parts.push('l\'a posé sur ' + (e.hidden ? 'une carte cachée (un ' + e.old + ')' : 'un ' + e.old));
      else if (e.act === 'discard') parts.push('l\'a défaussé');
      else if (e.act === 'flip') parts.push('a retourné un ' + e.v);
      else if (e.act === 'columns') parts.push('a retiré une colonne de ' + e.vals.join(' et '));
      else if (e.act === 'finish') parts.push('n\'a plus de carte cachée : dernier tour !');
    });
    return who + ' ' + parts.join(', ') + '.';
  }
  function lastMap() {
    var m = {};
    (G.R.prevEvents || []).forEach(function (e) {
      if (e.idx != null && (e.act === 'place' || e.act === 'flip')) { (m[e.p] = m[e.p] || {})[e.idx] = true; }
    });
    return m;
  }

  /* ---------- Actions de l'utilisateur ---------- */
  function humanTurn() { var R = G.R; return R.phase !== 'init' && R.phase !== 'over' && isHuman(R.turn) && (G.mode !== 'online' || R.turn === ME()); }
  function mineP(p) { return G.mode === 'online' ? p === ME() : p === G.view; }   // cette grille est-elle la mienne sur cet appareil ?
  function onCell(p, i) {
    var R = G.R;
    if (R.phase === 'over') return;
    if (R.phase === 'init') {
      if (!isHuman(p) || !mineP(p)) return;
      jouer({ t: 'init', p: p, i: i });
      return;
    }
    if (!humanTurn() || p !== R.turn) return;
    if (R.phase === 'place') jouer({ t: 'place', p: p, i: i });
    else if (R.phase === 'flip') jouer({ t: 'flip', p: p, i: i });
  }
  function onDeck() {
    if (!humanTurn() || G.R.phase !== 'draw') return;
    jouer({ t: 'deck', p: G.R.turn });
  }
  function onDiscard() {
    if (!humanTurn()) return;
    var R = G.R;
    if (R.phase === 'draw') jouer({ t: 'take', p: R.turn });
    else if (E.canDiscardDrawn(R)) jouer({ t: 'discard', p: R.turn });
  }
  function onDiscardDrawn() {
    if (humanTurn() && E.canDiscardDrawn(G.R)) jouer({ t: 'discard', p: G.R.turn });
  }

  /* ---------- Dessin ---------- */
  function canFnFor(v) {
    var R = G.R;
    if (R.phase === 'init') {
      if (!isHuman(v) || !mineP(v)) return null;
      if (E.upCount(R, v) >= 2) return null;
      return function (c) { return !c.up && !c.gone; };
    }
    if (!humanTurn() || R.turn !== v) return null;
    if (R.phase === 'place') return function (c) { return !c.gone; };
    if (R.phase === 'flip') return function (c) { return !c.up && !c.gone; };
    return null;
  }
  function instruction(v) {
    var R = G.R, out = { t: '', alert: false };
    if (R.phase === 'init') {
      if (isHuman(v) && E.upCount(R, v) < 2) { out.t = 'Retourne 2 cartes (' + E.upCount(R, v) + '/2)'; out.alert = true; }
      else out.t = G.mode === 'online' ? 'En attente des autres joueurs…' : 'On y va…';
    } else if (R.turn === v && isHuman(v)) {
      out.alert = true;
      if (R.phase === 'draw') out.t = 'À toi : pioche ou prends la défausse';
      else if (R.phase === 'place') out.t = R.src === 'discard' ? 'Pose cette carte sur une de tes cartes' : 'Pose-la sur une de tes cartes, ou défausse-la';
      else if (R.phase === 'flip') out.t = 'Retourne une de tes cartes cachées';
    } else out.t = 'Au tour de ' + name(R.turn) + '…';
    return out;
  }
  function smallNote() {
    var R = G.R, s = '';
    if (R.phase === 'draw' || R.phase === 'place' || R.phase === 'flip') {
      if (G.note) s = G.note;
    } else if (G.note) s = G.note;
    if (R.endedBy >= 0 && R.phase !== 'over') s += (s ? ' ' : '') + name(R.endedBy) + ' a fini : dernier tour pour les autres.';
    return s;
  }
  function pileHTML() {
    var R = G.R, top = R.discard.length ? R.discard[R.discard.length - 1] : null;
    var dk = '<div class="card back"></div><span class="count">' + R.deck.length + '</span>';
    var dc = top == null ? '<div class="card gone"></div>' : faceHTML(top, '');
    return { deck: dk, discard: dc };
  }
  function pileState(deckBtn, discBtn, discLbl) {
    var R = G.R, ht = humanTurn();
    deckBtn.classList.toggle('can', ht && R.phase === 'draw');
    discBtn.classList.toggle('can', ht && (R.phase === 'draw' || E.canDiscardDrawn(R)));
    var l = discBtn.querySelector('.lbl');
    l.textContent = ht && R.phase === 'place' && E.canDiscardDrawn(R) ? 'Défausser ici' : 'Défausse';
  }
  function oppHTML(p, lastM) {
    var R = G.R, s = G.seats[p];
    return '<div class="opp' + (R.turn === p && R.phase !== 'over' && R.phase !== 'init' ? ' turn' : '') + '">' +
      '<div class="nm"><span>' + esc(s.name) + (R.endedBy === p ? '<span class="tag">Fini</span>' : '') + '</span><em>' + G.totals[p] + ' pts</em></div>' +
      board(p, null, lastM[p], true) + '</div>';
  }

  function render() {
    if (!G || !G.R) return;
    var R = G.R, lm = lastMap(), pc = pileHTML();
    renderSolo(R, lm, pc);
    layout();
    if (R.phase === 'over') showOver(); else $('roundOver').hidden = true;
  }

  function renderSolo(R, lm, pc) {
    var v = G.view, ins = instruction(v), h = '', p;
    $('roundTitle').textContent = 'Manche ' + G.roundNo;
    $('roundSub').textContent = (ONL ? 'En ligne · ' + ONL.id + ' · ' : '') + (R.endedBy >= 0 && R.phase !== 'over' ? 'Dernier tour' : 'Fin de partie à 100 points');
    for (p = 0; p < G.n; p++) if (p !== v) h += oppHTML(p, lm);
    $('opps').innerHTML = h;
    $('opps').style.display = G.n > 1 ? '' : 'none';
    $('deckVisual').innerHTML = pc.deck; $('discardVisual').innerHTML = pc.discard;
    $('handVisual').innerHTML = R.hand != null ? faceHTML(R.hand, ' last') : '<div class="card gone"></div>';
    $('handLbl').textContent = R.hand != null ? (R.src === 'discard' ? 'Prise dans la défausse' : 'Piochée') : 'En main';
    pileState($('pileDeck'), $('pileDiscard'));
    var sn = smallNote();
    var m = $('msg'); m.className = 'msg' + (ins.alert ? ' alert' : '');
    m.innerHTML = '<span>' + esc(ins.t) + '</span>' + (sn ? '<small>' + esc(sn) + '</small>' : '');
    $('mine').innerHTML = '<div class="who"><b>' + esc(name(v)) + '</b><span>Total ' + G.totals[v] + ' pts · cartes visibles ' + E.visibleSum(R, v) + '</span></div>' + board(v, canFnFor(v), lm[v], false);
    var b = $('btnAction'), canD = humanTurn() && R.turn === v && E.canDiscardDrawn(R);
    b.hidden = !canD; b.textContent = 'Défausser et retourner une carte';
  }

  /* ---------- Fin de manche / de partie ---------- */
  function scoresTable(withRound) {
    var h = '<table class="sc"><tr><th></th>', r;
    G.seats.forEach(function (s) { h += '<th>' + esc(s.name) + '</th>'; });
    h += '</tr>';
    G.rounds.forEach(function (rd, i) {
      if (withRound === 'last' && i !== G.rounds.length - 1) return;
      h += '<tr><td>M' + (i + 1) + '</td>';
      rd.s.forEach(function (x, p) { h += '<td' + (rd.d === p ? ' class="dbl"' : '') + '>' + x + (rd.d === p ? ' ×2' : '') + '</td>'; });
      h += '</tr>';
    });
    h += '<tr class="tot"><td>Total</td>';
    var w = E.winners(G.totals);
    G.totals.forEach(function (t, p) { h += '<td' + (G.over && w.indexOf(p) >= 0 ? ' class="win"' : '') + '>' + t + '</td>'; });
    return h + '</tr></table>';
  }
  function overHTML() {
    var R = G.R, h = '<h2 class="rnd">' + (G.over ? 'Partie terminée' : 'Manche ' + G.roundNo + ' terminée') + '</h2>';
    if (G.over) {
      var order = G.totals.map(function (t, p) { return p; }).sort(function (a, b) { return G.totals[a] - G.totals[b]; });
      var w = E.winners(G.totals);
      order.forEach(function (p, i) {
        var win = w.indexOf(p) >= 0;
        var pos = 1; for (var j = 0; j < order.length; j++) if (G.totals[order[j]] < G.totals[p]) pos++;
        h += '<div class="rank' + (win ? ' win' : '') + '"><span class="pos">' + (win ? '🏆' : pos) + '</span><span class="n">' + esc(name(p)) + '</span><b>' + G.totals[p] + ' pts</b></div>';
      });
    }
    h += scoresTable(G.over ? 'all' : 'all');
    if (R.doubled) h += '<p>' + esc(name(R.endedBy)) + ' a fini la manche sans avoir le score le plus bas : son score est doublé.</p>';
    if (G.over) h += '<button class="btn sun" data-act="again" style="max-width:none">Rejouer</button><button class="btn ghost" data-act="home" style="max-width:none">Accueil</button>';
    else h += '<button class="btn sun" data-act="next" style="max-width:none">Manche suivante</button>';
    return h;
  }
  function showOver() {
    $('roundOver').hidden = false;
    $('roBottom').innerHTML = overHTML();
  }

  /* ---------- Mise en page ---------- */
  function layout() {
    if (!G || screen === 'home') return;
    if (screen === 'plateau') { plLayout(); return; }
    var W = window.innerWidth, H = window.innerHeight - 8, root = document.documentElement.style, k, cw, mw;
    {
      k = G.n - 1;
      var oc = k <= 3 ? Math.max(1, k) : (W >= 1000 ? k : 4), rws = Math.ceil(k / oc);
      mw = Math.max(12, Math.min(26, Math.floor(((W - 24 - (oc - 1) * 8) / oc - 16) / 4.3)));
      $('opps').style.setProperty('--oc', oc);
      var oppH = k ? rws * (4.55 * mw + 36) + (rws - 1) * 8 + 8 : 0;
      var fixed = 54 + oppH + 110 + 50 + 30 + 68 + 16;
      cw = Math.min((W - 40) / 4.3, (H - fixed) / 4.55, 104);
    }
    cw = Math.max(30, Math.floor(cw));
    root.setProperty('--cw', cw + 'px'); root.setProperty('--mw', mw + 'px');
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 200); });

  /* ---------- Événements ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target, a;
    var cl = t.closest && t.closest('[data-close]');
    if (cl) { var d = cl.closest('dialog'); if (d) d.close(); return; }
    var cell = t.closest && t.closest('.card[data-p]');
    if (cell && G) { onCell(+cell.getAttribute('data-p'), +cell.getAttribute('data-i')); return; }
    a = t.closest && t.closest('[data-act]');
    if (a && G) {
      var act = a.getAttribute('data-act');
      if (act === 'discardDrawn') onDiscardDrawn();
      else if (act === 'next') { if (ONL) { jouer({ t: 'next', round: G.roundNo }); } else { $('roundOver').hidden = true; newRound(); } }
      else if (act === 'again') { if (ONL) jouer({ t: 'again', round: G.roundNo }); else { $('roundOver').hidden = true; beginGame(G.mode, G.seats.map(function (s) { return { name: s.name, bot: s.bot }; })); } }
      else if (act === 'home') { if (ONL) { goHome(); return; } G = null; try { localStorage.removeItem(KEY); } catch (e) { /* rien */ } goHome(); }
    }
  });
  $('segMode').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    P.mode = b.getAttribute('data-m');
    if (P.mode !== 'solo' && P.bots === 1) P.bots = 0;
    renderHome();
  });
  $('segBots').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) { P.bots = +b.getAttribute('data-b'); renderHome(); } });
  $('segLevel').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) { P.level = +b.getAttribute('data-l'); renderHome(); } });
  $('n1').addEventListener('input', function () { P.n1 = this.value; save(PKEY, P); });
  $('btnNew').addEventListener('click', function () { P.n1 = $('n1').value; save(PKEY, P); newGame(); });
  $('btnResume').addEventListener('click', function () { show('game'); step(); });
  $('btnRules').addEventListener('click', function () { $('dlgRules').showModal(); });
  $('btnMenuRules').addEventListener('click', function () { $('dlgMenu').close(); $('dlgRules').showModal(); });
  function openScores() {
    if (!G) return;
    $('scoresBody').innerHTML = G.rounds.length ? scoresTable('all') : '<p>Aucune manche terminée pour l\'instant.</p>';
    $('dlgScores').showModal();
  }
  $('btnScores').addEventListener('click', openScores);
  function openMenu() { $('dlgMenu').showModal(); }
  $('btnMenu').addEventListener('click', openMenu);
  $('btnQuit').addEventListener('click', function () { $('dlgMenu').close(); goHome(); });
  $('btnAction').addEventListener('click', onDiscardDrawn);
  $('pileDeck').addEventListener('click', onDeck);
  $('pileDiscard').addEventListener('click', onDiscard);

  /* ---------- En ligne ---------- */
  function olMsg(t) { var e = $('olErr'); e.hidden = !t; e.textContent = t || ''; }
  function olError(e) {
    if (e && e.kind === 'auth') { olMsg('Session expirée : reconnecte-toi.'); olRender(); }
    else if (e && e.kind === 'reseau') olMsg('Pas de réseau : impossible de joindre le service pour l\'instant.');
    else olMsg('Erreur : ' + (e && e.message ? e.message : 'inconnue'));
  }
  function olRender() {
    var inn = EL.connecte();
    $('olLogin').hidden = inn; $('olIn').hidden = !inn;
    $('btnNew').disabled = !inn;
    if (inn) { $('olWho').textContent = EL.email(); olList(); }
  }
  function olList() {
    EL.liste('skyjo').then(function (a) {
      var h = '';
      a.forEach(function (r) {
        h += '<div class="olitem"><div class="t"><b>' + esc(r.id) + '</b><small>' + esc(r.titre || '') + '</small></div>' +
          '<button data-ol="resume" data-id="' + esc(r.id) + '">Reprendre</button><button data-ol="del" data-id="' + esc(r.id) + '" aria-label="Supprimer la partie ' + esc(r.id) + '">✕</button></div>';
      });
      $('olList').innerHTML = h || '<p class="olwho" style="margin:0">Aucune pour l\'instant.</p>';
    }).catch(olError);
  }
  function getMap() { return load(OKEY) || {}; }
  function setMap(id, me) { var m = getMap(); m[id] = me; save(OKEY, m); }
  function titre() {
    return G.seats.filter(function (s) { return !s.bot && !s.wait; }).map(function (s) { return s.name; }).join(' et ') + ' · ' + (G.R ? 'manche ' + G.roundNo : 'en attente') + (G.over ? ' (terminée)' : '');
  }
  function onlineStart(id, me, version) {
    onlineStop();
    ONL = { id: id, me: me, version: version, pending: [], pushing: false, status: 'ok', watch: null, retry: null };
    setMap(id, me);
    ONL.watch = EL.surveiller(id, function () { return ONL ? ONL.version : 0; }, onRemote, onStatus);
  }
  function onlineStop() {
    if (ONL) { if (ONL.watch) ONL.watch.stop(); clearTimeout(ONL.retry); }
    ONL = null;
    $('offbar').hidden = true; $('wait').hidden = true;
  }
  function onStatus(st) {
    if (!ONL) return;
    ONL.status = st;
    $('offbar').hidden = st !== 'hors-ligne';
    if (st === 'supprimee') { var m = 'Cette partie a été supprimée.'; goHome(); olMsg(m); return; }
    if (st === 'auth') { goHome(); olError({ kind: 'auth' }); return; }
    if (st === 'ok' && ONL.pending.length && !ONL.pushing) flush();
  }
  function onlineShow() {       // affiche G selon son avancement : salle d'attente ou partie
    if (!G.R) { $('waitCode').textContent = ONL.id; $('wait').hidden = false; return; }
    $('wait').hidden = true;
    if (screen !== 'game') show('game');
    step();
  }
  function onRemote() {         // la version distante a changé : on la reprend, sauf si on a des coups pas encore envoyés
    var o = ONL;
    if (!o || o.pushing || o.pending.length) return;
    return EL.lire(o.id).then(function (row) {
      if (ONL !== o || !row || row.version <= o.version || o.pending.length || o.pushing) return;
      G = row.etat; o.version = row.version;
      onlineShow();
    });
  }
  function flush() {
    var o = ONL;
    if (!o || o.pushing || !o.pending.length) return;
    o.pushing = true;
    var n = o.pending.length, retry = false;
    EL.ecrire(o.id, o.version, G, titre()).then(function (nv) {
      if (ONL !== o) return;
      if (nv) { o.version = nv; o.pending = o.pending.slice(n); if (o.status === 'hors-ligne') onStatus('ok'); return; }
      // conflit : l'autre appareil a écrit avant nous. On reprend son état et on rejoue nos coups dessus.
      return EL.lire(o.id).then(function (row) {
        if (ONL !== o) return;
        if (!row) { o.pending = []; return; }
        var mine = o.pending, refused = false;
        o.pending = []; G = row.etat; o.version = row.version;
        mine.forEach(function (a) { if (jouerSans(a)) o.pending.push(a); else if (a.t === 'join') refused = true; });
        if (refused) { goHome(); olMsg('Cette partie a déjà ses deux joueurs.'); return; }
        if (G.R) step(); else onlineShow();
      });
    }).catch(function (e) {
      if (ONL !== o) return;
      retry = true;
      onStatus(e.kind === 'reseau' ? 'hors-ligne' : 'erreur');
      if (e.kind === 'auth') return;
      clearTimeout(o.retry);
      o.retry = setTimeout(function () { if (ONL === o) { o.pushing = false; flush(); } }, 2000);
    }).then(function () {
      if (ONL !== o || retry) return;
      o.pushing = false;
      if (o.pending.length) flush();
    });
  }
  function jouerSans(a) { return applyAction(a); }      // rejoue un coup sur l'état repris du serveur (l'écran est redessiné ensuite)
  function onlineCreate() {
    if (!EL.connecte()) { olMsg('Connecte-toi d\'abord.'); return; }
    olMsg('');
    var nm = (P.n1 || '').trim() || 'Joueur 1', seats = [{ name: nm, bot: 0 }, { name: '…', bot: 0, wait: 1 }], i;
    for (i = 0; i < P.bots; i++) seats.push({ name: BOTS[i], bot: P.level });
    var z = seats.map(function () { return 0; });
    var g = { mode: 'online', seats: seats, n: seats.length, totals: z, rounds: [], R: null, nextStarter: -1, view: 0, roundNo: 0, over: false, note: '', online: { uids: [EL.uid(), null], joined: false } };
    EL.creer('skyjo', g, nm + ' · en attente').then(function (r) {
      G = g; onlineStart(r.id, 0, r.version); show('game'); onlineShow();
    }).catch(olError);
  }
  function seatFor(id, g) {
    var m = getMap(), me = m[id];
    if (me == null && g.online) { var k = g.online.uids.indexOf(EL.uid()); if (k >= 0) me = k; }
    return me;
  }
  function onlineJoin(code) {
    code = (code || '').trim().toUpperCase();
    if (code.length !== 4) { olMsg('Le code a 4 lettres.'); return; }
    olMsg('');
    EL.lire(code).then(function (row) {
      if (!row || row.jeu !== 'skyjo') { olMsg('Code inconnu.'); return; }
      var g = row.etat, me = seatFor(code, g);
      if (me != null && (g.online.joined || me === 0)) { onlineResumeRow(row, me); return; }
      if (g.online.joined) { olMsg('Cette partie a déjà ses deux joueurs.'); return; }
      G = g; onlineStart(code, 1, row.version); show('game');
      jouer({ t: 'join', name: (P.n1 || '').trim() || 'Joueur 2', uid: EL.uid() });
    }).catch(olError);
  }
  function onlineResumeRow(row, me) {
    G = row.etat; onlineStart(row.id, me, row.version); show('game'); onlineShow();
  }
  function onlineResume(id) {
    olMsg('');
    EL.lire(id).then(function (row) {
      if (!row) { olMsg('Partie introuvable.'); olList(); return; }
      var me = seatFor(id, row.etat);
      onlineResumeRow(row, me != null ? me : 0);
    }).catch(olError);
  }
  window.addEventListener('offline', function () { if (ONL) onStatus('hors-ligne'); });
  window.addEventListener('online', function () { if (ONL && ONL.watch) ONL.watch.poke(); });
  $('btnOlLogin').addEventListener('click', function () {
    olMsg('');
    EL.login($('olEmail').value.trim(), $('olPwd').value).then(function () { $('olPwd').value = ''; olRender(); }).catch(function (e) {
      olMsg(e.kind === 'bad' ? 'E-mail ou mot de passe refusé.' : e.kind === 'reseau' ? 'Pas de réseau.' : 'Erreur : ' + e.message);
    });
  });
  $('btnOlLogout').addEventListener('click', function () { EL.logout(); olMsg(''); olRender(); });
  $('btnOlJoin').addEventListener('click', function () { onlineJoin($('olCode').value); });
  $('olList').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-ol]'); if (!b) return;
    var id = b.getAttribute('data-id');
    if (b.getAttribute('data-ol') === 'resume') onlineResume(id);
    else if (confirm('Supprimer la partie ' + id + ' pour les deux joueurs ?')) EL.supprimer(id).then(olList).catch(olError);
  });
  $('btnWaitCancel').addEventListener('click', function () {
    var id = ONL && ONL.id;
    goHome();
    if (id && confirm('Supprimer la partie ' + id + ' ?')) EL.supprimer(id).catch(function () { /* déjà partie */ });
  });
  $('btnWaitHome').addEventListener('click', goHome);

  /* ---------- Plateau : affichage seul ---------- */
  var OFF_TXT = $('offbar').textContent;
  function plStop() {
    if (PL && PL.watch) PL.watch.stop();
    PL = null; $('offbar').hidden = true; $('offbar').textContent = OFF_TXT;
  }
  function plLayout() {
    if (!G || !G.R) return;
    var W = window.innerWidth, H = window.innerHeight, n = G.n, cols = Math.min(n, W >= 900 ? 4 : 2), rows = Math.ceil(n / cols);
    var mw = Math.floor(Math.min(((W - 24 - (cols - 1) * 12) / cols - 24) / 4.3, ((H - 300) / rows - 56) / 4.55, 72));
    mw = Math.max(12, mw);
    $('plSeats').style.setProperty('--oc', cols);
    document.documentElement.style.setProperty('--mw', mw + 'px');
    document.documentElement.style.setProperty('--plcw', Math.max(44, Math.min(110, Math.round(mw * 1.7))) + 'px');
  }
  function plRender() {
    if (!G) return;
    var R = G.R, h = '', p;
    if (!R) {
      $('plTitle').textContent = 'Plateau · ' + PL.id; $('plSub').textContent = 'Skyjo en ligne';
      $('plSeats').innerHTML = ''; $('plTable').style.display = 'none'; $('plScores').innerHTML = '';
      $('plMsg').textContent = 'En attente des joueurs…';
      return;
    }
    var lm = lastMap(), pc = pileHTML(), t = '';
    $('plTable').style.display = '';
    $('plTitle').textContent = 'Manche ' + G.roundNo;
    $('plSub').textContent = 'Plateau · ' + PL.id + ' · ' + (R.endedBy >= 0 && R.phase !== 'over' ? 'Dernier tour' : 'Fin de partie à 100 points');
    for (p = 0; p < G.n; p++) h += oppHTML(p, lm);
    $('plSeats').innerHTML = h;
    $('plDeck').innerHTML = pc.deck; $('plDiscard').innerHTML = pc.discard;
    $('plHand').innerHTML = R.hand != null ? faceHTML(R.hand, ' last') : '<div class="card gone"></div>';
    $('plHandLbl').textContent = R.hand != null ? (R.src === 'discard' ? 'Prise dans la défausse' : 'Piochée') : 'En main';
    if (R.phase === 'over') t = G.over ? 'Partie terminée' : 'Manche ' + G.roundNo + ' terminée';
    else if (R.phase === 'init') t = 'Chacun retourne 2 cartes…';
    else t = 'Au tour de ' + name(R.turn) + ' · ' + (R.phase === 'draw' ? 'pioche ou prend la défausse' : R.phase === 'place' ? 'pose la carte' : 'retourne une carte');
    if (R.phase !== 'over' && G.note) t += ' — ' + G.note;
    $('plMsg').textContent = t;
    $('plScores').innerHTML = R.phase === 'over' ? scoresTable('all') + (R.doubled ? '<p>' + esc(name(R.endedBy)) + ' a fini sans avoir le score le plus bas : score doublé.</p>' : '') : '';
    plLayout();
  }
  function plRemote() {
    var o = PL; if (!o) return;
    return EL.lire(o.id).then(function (row) {
      if (PL !== o || !row || row.version <= o.version) return;
      G = row.etat; o.version = row.version; plRender();
    });
  }
  function plStatus(st) {
    if (!PL) return;
    if (st === 'supprimee') { goHome(); olMsg('Cette partie a été supprimée.'); return; }
    if (st === 'auth') { goHome(); olError({ kind: 'auth' }); return; }
    $('offbar').textContent = 'Hors ligne : le plateau se remettra à jour au retour du réseau';
    $('offbar').hidden = st !== 'hors-ligne';
  }
  function plateauStart(code) {
    code = (code || '').trim().toUpperCase();
    if (code.length !== 4) { olMsg('Le code a 4 lettres.'); return; }
    olMsg('');
    EL.lire(code).then(function (row) {
      if (!row || row.jeu !== 'skyjo') { olMsg('Code inconnu.'); return; }
      clearTimeout(botTimer); onlineStop(); plStop();
      G = row.etat; PL = { id: code, version: row.version, watch: null };
      show('plateau'); plRender();
      PL.watch = EL.surveiller(code, function () { return PL ? PL.version : 0; }, plRemote, plStatus);
    }).catch(olError);
  }
  $('btnOlPlateau').addEventListener('click', function () { plateauStart($('olCode').value); });
  $('btnPlQuit').addEventListener('click', goHome);

  /* ---------- Démarrage ---------- */
  (function () {
    var s = load(KEY);
    if (s && s.mode === 'solo' && s.R && s.seats && s.seats.length === s.n && !s.over) G = s;
    renderHome();
    show('home');
  })();
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    try { navigator.serviceWorker.register('sw.js'); } catch (e) { /* hors ligne non disponible */ }
  }
})();
