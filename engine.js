/* Skyjo — moteur de jeu : cartes, déroulement d'une manche, scores, ordinateur (3 niveaux).
   Aucune dépendance. Fonctionne dans le navigateur (window.Engine) et sous Node (module.exports).

   Règles officielles : 150 cartes (−2 ×5, −1 ×10, 0 ×15, 1 à 12 ×10), 2 à 8 joueurs, 12 cartes chacun face cachée
   en 4 colonnes de 3. Au tour : on prend le dessus de la défausse (et on remplace une carte de sa grille), ou on pioche
   (on remplace une carte, ou on défausse et on retourne une carte cachée). Trois cartes identiques visibles dans une colonne
   sont défaussées. La manche s'arrête quand un joueur n'a plus de carte cachée ; les autres jouent un dernier tour.
   Qui a fini sans avoir le score strictement le plus bas voit son score doublé (s'il est positif). La partie s'arrête
   quand un joueur atteint 100 points ; le total le plus bas gagne.

   Manche : R = { n, grids, deck, discard, turn, phase, hand, src, endedBy, remaining, seen, starter, scores, doubled, events, prevEvents }
   - grids[p] : 12 cases { v, up, gone } rangées par colonne : indice = 3 × colonne + ligne
   - phase    : 'init' (chacun retourne 2 cartes) | 'draw' | 'place' | 'flip' | 'over'
   - hand/src : carte en main et son origine ('deck' ou 'discard')
   - seen     : nombre de cartes de chaque valeur déjà vues de tous (pour l'ordinateur)                      */
(function (root) {
  'use strict';

  var VMIN = -2, VMAX = 12, CELLS = 12, COLS = 4;
  var COUNTS = {};
  (function () { var v; COUNTS[-2] = 5; COUNTS[-1] = 10; COUNTS[0] = 15; for (v = 1; v <= 12; v++) COUNTS[v] = 10; })();

  function rngOf(r) { return r || Math.random; }
  function makeDeck() {
    var d = [], v, k;
    for (v = VMIN; v <= VMAX; v++) for (k = 0; k < COUNTS[v]; k++) d.push(v);
    return d;
  }
  function shuffle(a, rng) {
    rng = rngOf(rng);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function colOf(idx) { return Math.floor(idx / 3); }
  function colCells(c) { return [3 * c, 3 * c + 1, 3 * c + 2]; }

  /* ---------- Manche ---------- */
  function newRound(n, rng) {
    var deck = shuffle(makeDeck(), rng), grids = [], p, i, seen = [];
    for (i = 0; i < VMAX - VMIN + 1; i++) seen.push(0);
    for (p = 0; p < n; p++) {
      var g = [];
      for (i = 0; i < CELLS; i++) g.push({ v: deck.pop(), up: false, gone: false });
      grids.push(g);
    }
    var top = deck.pop();
    seen[top - VMIN]++;
    return { n: n, grids: grids, deck: deck, discard: [top], turn: -1, phase: 'init', hand: null, src: null,
             endedBy: -1, remaining: 0, seen: seen, starter: -1, scores: null, doubled: false, events: [], prevEvents: [] };
  }
  function see(R, v) { R.seen[v - VMIN]++; }

  function downIdx(R, p) {
    var res = [];
    R.grids[p].forEach(function (c, i) { if (!c.up && !c.gone) res.push(i); });
    return res;
  }
  function upCount(R, p) { var n = 0; R.grids[p].forEach(function (c) { if (c.up && !c.gone) n++; }); return n; }
  function allUp(R, p) { return R.grids[p].every(function (c) { return c.gone || c.up; }); }
  function visibleSum(R, p) { var s = 0; R.grids[p].forEach(function (c) { if (c.up && !c.gone) s += c.v; }); return s; }
  function fullSum(R, p) { var s = 0; R.grids[p].forEach(function (c) { if (!c.gone) s += c.v; }); return s; }

  /* ---------- Début de manche : chacun retourne deux cartes ---------- */
  function initFlip(R, p, idx) {
    var c = R.grids[p][idx];
    if (R.phase !== 'init' || !c || c.up || c.gone || upCount(R, p) >= 2) return false;
    c.up = true; see(R, c.v);
    return true;
  }
  function initDone(R) {
    for (var p = 0; p < R.n; p++) if (upCount(R, p) < 2) return false;
    return true;
  }
  // Premier joueur : celui qui a la plus grande somme de ses deux cartes (ou `forced`, pour les manches suivantes).
  function startRound(R, forced, rng) {
    var best = -999, cand = [], p;
    if (typeof forced === 'number' && forced >= 0) R.starter = forced;
    else {
      for (p = 0; p < R.n; p++) {
        var s = visibleSum(R, p);
        if (s > best) { best = s; cand = [p]; } else if (s === best) cand.push(p);
      }
      R.starter = cand[Math.floor(rngOf(rng)() * cand.length)];
    }
    R.turn = R.starter; R.phase = 'draw';
    return R.starter;
  }

  /* ---------- Un tour ---------- */
  function recycle(R, rng) {
    var top = R.discard.pop();
    R.deck = shuffle(R.discard, rng); R.discard = [top];
  }
  function takeDiscard(R) {
    if (R.phase !== 'draw' || !R.discard.length) return false;
    R.hand = R.discard.pop(); R.src = 'discard'; R.phase = 'place';
    R.events.push({ p: R.turn, act: 'take', v: R.hand });
    return true;
  }
  function drawDeck(R, rng) {
    if (R.phase !== 'draw') return false;
    if (!R.deck.length) recycle(R, rng);
    R.hand = R.deck.pop(); R.src = 'deck'; R.phase = 'place'; see(R, R.hand);
    R.events.push({ p: R.turn, act: 'draw', v: R.hand });
    return true;
  }
  function canDiscardDrawn(R) { return R.phase === 'place' && R.src === 'deck' && downIdx(R, R.turn).length > 0; }

  // Retire les colonnes de trois cartes identiques visibles ; renvoie la liste des valeurs retirées.
  function clearColumns(R, p) {
    var removed = [], c;
    for (c = 0; c < COLS; c++) {
      var cells = colCells(c).map(function (i) { return R.grids[p][i]; });
      if (cells.every(function (x) { return !x.gone && x.up && x.v === cells[0].v })) {
        cells.forEach(function (x) { R.discard.push(x.v); x.gone = true; });
        removed.push(cells[0].v);
      }
    }
    return removed;
  }
  function endAction(R) {
    var p = R.turn, removed = clearColumns(R, p);
    if (removed.length) R.events.push({ p: p, act: 'columns', vals: removed });
    if (R.endedBy < 0 && allUp(R, p)) { R.endedBy = p; R.remaining = R.n - 1; R.events.push({ p: p, act: 'finish' }); }
    else if (R.endedBy >= 0) R.remaining--;
    R.prevEvents = R.events; R.events = [];
    if (R.endedBy >= 0 && R.remaining <= 0) { finishRound(R); return; }
    R.turn = (p + 1) % R.n; R.phase = 'draw'; R.hand = null; R.src = null;
  }
  function place(R, idx) {
    var c = R.grids[R.turn][idx];
    if (R.phase !== 'place' || !c || c.gone) return false;
    var old = c.v, wasUp = c.up;
    if (!wasUp) see(R, old);
    R.discard.push(old);
    c.v = R.hand; c.up = true;
    R.events.push({ p: R.turn, act: 'place', v: R.hand, old: old, idx: idx, hidden: !wasUp });
    R.hand = null;
    endAction(R);
    return true;
  }
  function discardDrawn(R) {
    if (!canDiscardDrawn(R)) return false;
    R.discard.push(R.hand);
    R.events.push({ p: R.turn, act: 'discard', v: R.hand });
    R.hand = null; R.phase = 'flip';
    return true;
  }
  function flip(R, idx) {
    var c = R.grids[R.turn][idx];
    if (R.phase !== 'flip' || !c || c.up || c.gone) return false;
    c.up = true; see(R, c.v);
    R.events.push({ p: R.turn, act: 'flip', v: c.v, idx: idx });
    endAction(R);
    return true;
  }

  /* ---------- Fin de manche et scores ---------- */
  function finishRound(R) {
    var p, scores = [];
    for (p = 0; p < R.n; p++) { R.grids[p].forEach(function (c) { if (!c.gone) c.up = true; }); clearColumns(R, p); }
    for (p = 0; p < R.n; p++) scores.push(fullSum(R, p));
    R.doubled = false;
    if (R.endedBy >= 0 && scores[R.endedBy] > 0) {
      for (p = 0; p < R.n; p++) if (p !== R.endedBy && scores[p] <= scores[R.endedBy]) R.doubled = true;
      if (R.doubled) scores[R.endedBy] *= 2;
    }
    R.scores = scores; R.phase = 'over'; R.hand = null; R.src = null;
  }
  function addScores(totals, R) { return totals.map(function (t, i) { return t + R.scores[i]; }); }
  function gameOver(totals, limit) { return Math.max.apply(null, totals) >= (limit || 100); }
  function winners(totals) {
    var m = Math.min.apply(null, totals), w = [];
    totals.forEach(function (t, i) { if (t === m) w.push(i); });
    return w;
  }

  /* ================= Ordinateur ================= */
  function unseen(R) {
    var total = 0, sum = 0, left = [], v;
    for (v = VMIN; v <= VMAX; v++) {
      var l = Math.max(0, COUNTS[v] - R.seen[v - VMIN]);
      left.push(l); total += l; sum += l * v;
    }
    return { left: left, total: total, mu: total ? sum / total : 5 };
  }
  function pOf(U, v) { return U.total ? U.left[v - VMIN] / U.total : 0; }

  // Pour chaque case, le gain (points économisés) à y poser la carte v. `mu` : valeur attendue d'une carte cachée.
  // level >= 2 : on voit les colonnes qui se complètent ; level 3 : on prépare aussi les colonnes.
  function placements(R, p, v, mu, level, U) {
    var res = [];
    R.grids[p].forEach(function (c, i) {
      if (c.gone) return;
      var cur = c.up ? c.v : mu, g = cur - v, others = colCells(colOf(i)).filter(function (j) { return j !== i; }).map(function (j) { return R.grids[p][j]; });
      if (level >= 2 && others.every(function (o) { return !o.gone && o.up && o.v === v; })) g = cur + others[0].v + others[1].v;   // la colonne disparaît
      else if (level >= 3) {
        var same = others.filter(function (o) { return o.up && o.v === v; }).length;
        if (same === 1 && v > 0) g += 1.5;                         // une colonne en préparation
        if (same === 2) g += 0;
      }
      if (c.up && c.v === v) g -= 0.5;                             // inutile de remplacer une carte par la même
      res.push({ idx: i, gain: g, down: !c.up });
    });
    return res;
  }
  function bestOf(list, rng) {
    var best = -Infinity, b = [];
    list.forEach(function (x) { if (x.gain > best + 1e-9) { best = x.gain; b = [x]; } else if (Math.abs(x.gain - best) <= 1e-9) b.push(x); });
    return b[Math.floor(rngOf(rng)() * b.length)];
  }
  function pickRandom(list, rng) { return list[Math.floor(rngOf(rng)() * list.length)]; }

  // Niveau 3 : estimation du score final si l'on termine la manche avec cette action.
  function finishAdjust(R, p, S, mu) {
    var minOpp = Infinity, q;
    for (q = 0; q < R.n; q++) if (q !== p) minOpp = Math.min(minOpp, visibleSum(R, q) + mu * downIdx(R, q).length - 2);
    if (S > 0 && S >= minOpp) return S;     // score doublé : à éviter
    if (S < minOpp - 3) return -1.5;        // fin avantageuse
    return 0;
  }
  var L2_FINISH_MAX = 18;       // le niveau normal ne termine pas la manche au-dessus de ce score
  function finishing(R, p, extraDown) { return downIdx(R, p).length - extraDown <= 0; }

  function aiInit(level, R, p, rng) {
    var downs = downIdx(R, p), a = pickRandom(downs, rng), rest;
    if (level >= 2) rest = downs.filter(function (i) { return colOf(i) !== colOf(a); });
    else rest = downs.filter(function (i) { return i !== a; });
    return [a, pickRandom(rest, rng)];
  }

  function aiSource(level, R, p, rng) {
    var top = R.discard[R.discard.length - 1], U = unseen(R);
    rng = rngOf(rng);
    if (level === 1) return rng() < 0.25 ? (rng() < 0.5 ? 'take' : 'draw') : (top <= 2 ? 'take' : 'draw');   // le débutant joue au hasard une fois sur quatre
    var mu = level === 2 ? 5 : U.mu;
    var gd = bestOf(placements(R, p, top, mu, level, U), rng).gain;
    if (level === 2) return gd >= 3 ? 'take' : 'draw';
    // niveau 3 : on compare au gain attendu d'une pioche
    var ev = 0, v;
    for (v = VMIN; v <= VMAX; v++) {
      var pv = pOf(U, v); if (!pv) continue;
      ev += pv * Math.max(0, bestOf(placements(R, p, v, mu, level, U), rng).gain);
    }
    if (downIdx(R, p).length === 1) {            // un coup de fin : on regarde les conséquences
      var S = visibleSum(R, p) + top - (function () { var b = bestOf(placements(R, p, top, mu, level, U), rng); var c = R.grids[p][b.idx]; return c.up ? c.v : 0; })();
      if (finishing(R, p, bestOf(placements(R, p, top, mu, level, U), rng).down ? 1 : 0)) gd -= finishAdjust(R, p, S, mu);
    }
    return gd > ev + 0.15 ? 'take' : 'draw';
  }

  // Renvoie l'indice de la case où poser la carte en main, ou -1 pour la défausser et retourner une carte.
  function aiPlace(level, R, p, rng) {
    var v = R.hand, U = unseen(R), canDiscard = canDiscardDrawn(R), list, b, downs = downIdx(R, p);
    rng = rngOf(rng);
    if (level === 1) {
      if (rng() < 0.25) {                                          // coup au hasard
        var legal = []; R.grids[p].forEach(function (c, i) { if (!c.gone) legal.push(i); });
        var k = Math.floor(rng() * (legal.length + (canDiscard ? 1 : 0)));
        return k < legal.length ? legal[k] : -1;
      }
      var ups = [];
      R.grids[p].forEach(function (c, i) { if (c.up && !c.gone && c.v > v) ups.push({ idx: i, gain: c.v - v }); });
      if (R.src === 'discard' || v <= 4) {
        if (ups.length) return bestOf(ups, rng).idx;
        if (downs.length) return pickRandom(downs, rng);
        return bestOf(placements(R, p, v, 5, 1, U), rng).idx;
      }
      return canDiscard ? -1 : bestOf(placements(R, p, v, 5, 1, U), rng).idx;
    }
    var mu = level === 2 ? 5 : U.mu;
    function adjust(S) { return level === 2 ? (S > L2_FINISH_MAX ? S : 0) : finishAdjust(R, p, S, mu); }
    list = placements(R, p, v, mu, level, U);
    list.forEach(function (x) {
      if (finishing(R, p, x.down ? 1 : 0)) {
        var c = R.grids[p][x.idx];
        x.gain -= adjust(visibleSum(R, p) - (c.up ? c.v : 0) + v);
      }
    });
    b = bestOf(list, rng);
    if (!canDiscard) return b.idx;
    var flipValue = 0;
    if (downs.length === 1) flipValue -= adjust(visibleSum(R, p) + mu);
    return b.gain > flipValue + (level === 2 ? 0.5 : 0.4) ? b.idx : -1;
  }

  function aiFlip(level, R, p, rng) {
    var downs = downIdx(R, p), U = unseen(R);
    rng = rngOf(rng);
    if (level < 3) return pickRandom(downs, rng);
    var best = null, bs = -Infinity;
    downs.forEach(function (i) {
      var others = colCells(colOf(i)).filter(function (j) { return j !== i; }).map(function (j) { return R.grids[p][j]; });
      var s = rng() * 0.01;
      if (others.every(function (o) { return o.up && !o.gone && o.v === others[0].v; })) s += pOf(U, others[0].v) * 3 * others[0].v;   // chance de faire une colonne
      else s += 0.3 * others.filter(function (o) { return o.up; }).length;                                                            // révéler d'abord les colonnes déjà avancées
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }

  /* Joue un tour complet de l'ordinateur ; renvoie la liste des événements du tour. */
  function aiTurn(level, R, rng) {
    var p = R.turn;
    if (R.phase !== 'draw') return null;
    if (aiSource(level, R, p, rng) === 'take') takeDiscard(R); else drawDeck(R, rng);
    var idx = aiPlace(level, R, p, rng);
    if (idx >= 0) place(R, idx);
    else { discardDrawn(R); flip(R, aiFlip(level, R, p, rng)); }
    return R.prevEvents;
  }

  var Engine = {
    VMIN: VMIN, VMAX: VMAX, CELLS: CELLS, COLS: COLS, COUNTS: COUNTS,
    makeDeck: makeDeck, shuffle: shuffle, colOf: colOf, colCells: colCells,
    newRound: newRound, downIdx: downIdx, upCount: upCount, allUp: allUp, visibleSum: visibleSum, fullSum: fullSum,
    initFlip: initFlip, initDone: initDone, startRound: startRound,
    takeDiscard: takeDiscard, drawDeck: drawDeck, canDiscardDrawn: canDiscardDrawn, place: place, discardDrawn: discardDrawn, flip: flip,
    finishRound: finishRound, addScores: addScores, gameOver: gameOver, winners: winners,
    aiInit: aiInit, aiSource: aiSource, aiPlace: aiPlace, aiFlip: aiFlip, aiTurn: aiTurn
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : this);
