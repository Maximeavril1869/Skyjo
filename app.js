/* Skyjo — interface. Moteur : engine.js (window.Engine). Sauvegarde : localStorage. */
(function () {
  'use strict';
  var E = window.Engine;
  var KEY = 'skyjo_partie_v1', PKEY = 'skyjo_prefs_v1';
  var BOTS = ['Luna', 'Orion', 'Nova', 'Zéphyr', 'Iris', 'Atlas', 'Mila'];
  var LEVELS = { 1: 'débutant', 2: 'normal', 3: 'fort' };
  var P = { mode: 'solo', bots: 1, level: 2, n1: 'Joueur 1', n2: 'Joueur 2' };
  var G = null, botTimer = null, screen = 'home';
  var BOT_DELAY = window.SKYJO_BOT_DELAY != null ? window.SKYJO_BOT_DELAY : 1000;

  function $(id) { return document.getElementById(id); }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- Préférences et accueil ---------- */
  (function () {
    var p = load(PKEY);
    if (p) for (var k in P) if (p[k] != null) P[k] = p[k];
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
    $('n2').hidden = P.mode === 'solo';
    $('namesTitle').textContent = P.mode === 'solo' ? 'Ton prénom' : 'Prénoms des deux joueurs';
    $('n1').value = P.n1; $('n2').value = P.n2;
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
    ['home', 'game', 'duo'].forEach(function (s) { $(s).hidden = s !== name; });
    layout();
  }
  function goHome() {
    clearTimeout(botTimer);
    $('veil').hidden = true; $('roundOver').hidden = true;
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
    var seats = [], hum = P.mode === 'solo' ? 1 : 2, i;
    seats.push({ name: (P.n1 || '').trim() || 'Joueur 1', bot: 0 });
    if (hum === 2) seats.push({ name: (P.n2 || '').trim() || 'Joueur 2', bot: 0 });
    for (i = 0; i < P.bots; i++) seats.push({ name: BOTS[i], bot: P.level });
    beginGame(P.mode, seats);
  }
  function beginGame(mode, seats) {
    var z = seats.map(function () { return 0; });
    G = { mode: mode, seats: seats, n: seats.length, totals: z, rounds: [], R: null, nextStarter: -1, view: 0, veil: null, roundNo: 0, over: false, note: '' };
    newRound();
  }
  function newRound() {
    G.roundNo++;
    var R = E.newRound(G.n);
    R.counted = false;
    G.R = R; G.view = 0; G.veil = null; G.note = '';
    G.seats.forEach(function (s, p) {
      if (s.bot) E.aiInit(s.bot, R, p).forEach(function (i) { E.initFlip(R, p, i); });
    });
    show(G.mode === 'duo' ? 'duo' : 'game');
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
    if (G.mode === 'passe' && R.phase !== 'over') {
      var target = null;
      if (R.phase === 'init') { var pend = pendingInit(); if (pend.length) target = pend[0]; }
      else if (isHuman(R.turn)) target = R.turn;
      if (target != null && target !== G.view && !G.veil) G.veil = { who: target };
    }
    save(KEY, G);
    render();
    if (R.phase === 'over' || G.veil) return;
    if (R.phase !== 'init' && !isHuman(R.turn)) botTimer = setTimeout(botMove, BOT_DELAY);
  }
  function botMove() {
    var R = G && G.R;
    if (!R || R.phase === 'init' || R.phase === 'over' || isHuman(R.turn)) return;
    E.aiTurn(G.seats[R.turn].bot, R);
    G.note = describe(R.prevEvents);
    step();
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
  function humanTurn() { var R = G.R; return !G.veil && R.phase !== 'init' && R.phase !== 'over' && isHuman(R.turn); }
  function onCell(p, i) {
    var R = G.R;
    if (G.veil || R.phase === 'over') return;
    if (R.phase === 'init') {
      if (!isHuman(p)) return;
      if (G.mode !== 'duo' && p !== G.view) return;
      if (E.initFlip(R, p, i)) { G.note = ''; step(); }
      return;
    }
    if (!humanTurn() || p !== R.turn) return;
    var ok = R.phase === 'place' ? E.place(R, i) : R.phase === 'flip' ? E.flip(R, i) : false;
    if (ok) { G.note = describe(R.prevEvents); step(); }
  }
  function onDeck() {
    if (!humanTurn() || G.R.phase !== 'draw') return;
    E.drawDeck(G.R); step();
  }
  function onDiscard() {
    if (!humanTurn()) return;
    var R = G.R;
    if (R.phase === 'draw') { E.takeDiscard(R); step(); }
    else if (E.canDiscardDrawn(R)) { E.discardDrawn(R); step(); }
  }
  function onDiscardDrawn() {
    if (humanTurn() && E.discardDrawn(G.R)) step();
  }

  /* ---------- Dessin ---------- */
  function canFnFor(v) {
    var R = G.R;
    if (R.phase === 'init') {
      if (!isHuman(v)) return null;
      if (G.mode !== 'duo' && v !== G.view) return null;
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
      else out.t = G.mode === 'duo' ? 'En attente de l\'autre joueur…' : 'On y va…';
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
    $('veil').hidden = !G.veil;
    if (G.veil) {
      $('veilTitle').textContent = 'À ' + name(G.veil.who) + ' de jouer';
      $('veilText').textContent = 'Passe l\'iPad à ' + name(G.veil.who) + ', puis touche le bouton.';
      $('btnVeil').textContent = 'C\'est moi';
    }
    if (G.mode === 'duo') renderDuo(R, lm, pc); else renderSolo(R, lm, pc);
    layout();
    if (R.phase === 'over') showOver(); else $('roundOver').hidden = true;
  }

  function renderSolo(R, lm, pc) {
    var v = G.view, ins = instruction(v), h = '', p;
    $('roundTitle').textContent = 'Manche ' + G.roundNo;
    $('roundSub').textContent = R.endedBy >= 0 && R.phase !== 'over' ? 'Dernier tour' : 'Fin de partie à 100 points';
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

  function renderDuo(R, lm, pc) {
    var s, h = '', p;
    for (s = 0; s < 2; s++) {
      var el = $('seat' + s), ins = instruction(s), sn = smallNote();
      el.classList.toggle('turn', R.phase !== 'over' && R.phase !== 'init' && R.turn === s);
      var hand = (R.turn === s && R.hand != null) ? faceHTML(R.hand, ' last') + '<span class="lbl">' + (R.src === 'discard' ? 'Prise dans la défausse' : 'Piochée') + '</span>' : '';
      el.querySelector('.seathead').innerHTML = '<div class="who"><b>' + esc(name(s)) + '</b><span>Total ' + G.totals[s] + ' pts · visibles ' + E.visibleSum(R, s) + '</span></div><div class="handslot">' + hand + '</div>';
      el.querySelector('.mine').innerHTML = board(s, canFnFor(s), lm[s], false);
      var sm = el.querySelector('.seatmsg'); sm.className = 'seatmsg' + (ins.alert ? ' alert' : '');
      sm.innerHTML = '<span>' + esc(ins.t) + '</span>' + (sn ? '<small>' + esc(sn) + '</small>' : '');
      var canD = humanTurn() && R.turn === s && E.canDiscardDrawn(R);
      el.querySelector('.seatbtn').innerHTML = canD ? '<button class="btn sun" data-act="discardDrawn">Défausser et retourner une carte</button>' : '';
    }
    for (p = 2; p < G.n; p++) h += oppHTML(p, lm);
    $('botsRow').innerHTML = h;
    $('duoDeckVisual').innerHTML = pc.deck; $('duoDiscardVisual').innerHTML = pc.discard;
    pileState($('duoPileDeck'), $('duoPileDiscard'));
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
    var ro = $('roundOver'), duo = G.mode === 'duo';
    ro.hidden = false; ro.classList.toggle('duo', duo);
    ro.querySelector('.half.top').hidden = !duo;
    $('roBottom').innerHTML = overHTML();
    if (duo) $('roTop').innerHTML = overHTML();
  }

  /* ---------- Mise en page ---------- */
  function layout() {
    if (!G || screen === 'home') return;
    var W = window.innerWidth, H = window.innerHeight - 8, root = document.documentElement.style, k, cw, mw;
    if (G.mode === 'duo') {
      k = Math.max(0, G.n - 2);
      mw = k ? Math.max(10, Math.min(18, Math.floor((W * 0.5 / Math.min(k, 3) - 20) / 4.3))) : 18;
      var rows = Math.ceil(k / 3), botsH = k ? rows * (4.55 * mw + 34) : 0, mid = Math.max(112, botsH + 8);
      var avail = (H - mid) / 2 - 12 - 62 - 40 - 46 - 24;
      cw = Math.min((W - 56) / 4.3, avail / 4.55, 104);
    } else {
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
      else if (act === 'next') { $('roundOver').hidden = true; newRound(); }
      else if (act === 'again') { $('roundOver').hidden = true; beginGame(G.mode, G.seats.map(function (s) { return { name: s.name, bot: s.bot }; })); }
      else if (act === 'home') { G = null; try { localStorage.removeItem(KEY); } catch (e) { /* rien */ } goHome(); }
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
  $('n2').addEventListener('input', function () { P.n2 = this.value; save(PKEY, P); });
  $('btnNew').addEventListener('click', function () { P.n1 = $('n1').value; P.n2 = $('n2').value; save(PKEY, P); newGame(); });
  $('btnResume').addEventListener('click', function () { show(G.mode === 'duo' ? 'duo' : 'game'); step(); });
  $('btnRules').addEventListener('click', function () { $('dlgRules').showModal(); });
  $('btnMenuRules').addEventListener('click', function () { $('dlgMenu').close(); $('dlgRules').showModal(); });
  function openScores() {
    if (!G) return;
    $('scoresBody').innerHTML = G.rounds.length ? scoresTable('all') : '<p>Aucune manche terminée pour l\'instant.</p>';
    $('dlgScores').showModal();
  }
  $('btnScores').addEventListener('click', openScores); $('btnScoresD').addEventListener('click', openScores);
  function openMenu() { $('dlgMenu').showModal(); }
  $('btnMenu').addEventListener('click', openMenu); $('btnMenuD').addEventListener('click', openMenu);
  $('btnQuit').addEventListener('click', function () { $('dlgMenu').close(); goHome(); });
  $('btnVeil').addEventListener('click', function () { if (G && G.veil) { G.view = G.veil.who; G.veil = null; step(); } });
  $('btnAction').addEventListener('click', onDiscardDrawn);
  $('pileDeck').addEventListener('click', onDeck); $('duoPileDeck').addEventListener('click', onDeck);
  $('pileDiscard').addEventListener('click', onDiscard); $('duoPileDiscard').addEventListener('click', onDiscard);

  /* ---------- Démarrage ---------- */
  (function () {
    var s = load(KEY);
    if (s && s.R && s.seats && s.seats.length === s.n && !s.over) G = s;
    renderHome();
    show('home');
  })();
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    try { navigator.serviceWorker.register('sw.js'); } catch (e) { /* hors ligne non disponible */ }
  }
})();
