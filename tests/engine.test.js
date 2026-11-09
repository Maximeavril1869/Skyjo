'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../engine.js');

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Manche truquée : grilles imposées (valeurs, toutes cachées), le reste de la pioche au choix.
function rigged(grids, deck, discard) {
  const R = E.newRound(grids.length, seeded(1));
  R.grids = grids.map(g => g.map(v => ({ v, up: false, gone: false })));
  R.deck = deck.slice(); R.discard = [discard];
  R.seen = R.seen.map(() => 0);
  return R;
}
const twelve = (v) => new Array(12).fill(v);

test('le paquet fait 150 cartes avec la bonne répartition', () => {
  const d = E.makeDeck();
  assert.strictEqual(d.length, 150);
  const c = {}; d.forEach(v => { c[v] = (c[v] || 0) + 1; });
  assert.strictEqual(c[-2], 5); assert.strictEqual(c[-1], 10); assert.strictEqual(c[0], 15);
  for (let v = 1; v <= 12; v++) assert.strictEqual(c[v], 10);
});

test('distribution : 12 cartes cachées par joueur, 1 carte de défausse, rien ne se perd (2 à 8 joueurs)', () => {
  for (let n = 2; n <= 8; n++) {
    const R = E.newRound(n, seeded(n));
    assert.strictEqual(R.grids.length, n);
    R.grids.forEach(g => { assert.strictEqual(g.length, 12); g.forEach(c => assert.ok(!c.up && !c.gone)); });
    assert.strictEqual(R.discard.length, 1);
    assert.strictEqual(R.deck.length + R.grids.length * 12 + 1, 150);
  }
});

test('début : deux cartes retournées chacun, le plus fort total commence', () => {
  const R = rigged([twelve(1), twelve(5)], [3, 3, 3], 7);
  [0, 1].forEach(p => { assert.ok(E.initFlip(R, p, 0)); assert.ok(E.initFlip(R, p, 4)); assert.ok(!E.initFlip(R, p, 8)); });
  assert.ok(E.initDone(R));
  assert.strictEqual(E.startRound(R, -1, seeded(1)), 1);
  assert.strictEqual(R.phase, 'draw'); assert.strictEqual(R.turn, 1);
});

test('prendre la défausse oblige à poser ; piocher permet de défausser puis retourner', () => {
  const R = rigged([twelve(9), twelve(9)], [4, 6], 2);
  E.startRound(R, 0);
  assert.ok(E.takeDiscard(R)); assert.strictEqual(R.hand, 2);
  assert.ok(!E.discardDrawn(R));                         // pas de défausse de la carte prise sur la défausse
  assert.ok(E.place(R, 5));
  assert.strictEqual(R.grids[0][5].v, 2); assert.ok(R.grids[0][5].up);
  assert.strictEqual(R.discard[R.discard.length - 1], 9); // l'ancienne carte est défaussée face visible
  assert.strictEqual(R.turn, 1);
  assert.ok(E.drawDeck(R)); assert.strictEqual(R.hand, 6);
  assert.ok(E.discardDrawn(R)); assert.strictEqual(R.phase, 'flip');
  assert.ok(E.flip(R, 3)); assert.ok(R.grids[1][3].up);
  assert.strictEqual(R.turn, 0);
});

test('trois cartes identiques visibles dans une colonne sont défaussées', () => {
  const g = twelve(9); g[0] = 4; g[1] = 4; g[2] = 7;
  const R = rigged([g, twelve(9)], [4, 4, 4], 4);
  R.grids[0][0].up = true; R.grids[0][1].up = true;
  E.startRound(R, 0);
  assert.ok(E.takeDiscard(R)); assert.ok(E.place(R, 2));     // pose un 4 sur le 7 : colonne 0 = 4,4,4
  assert.ok(R.grids[0].slice(0, 3).every(c => c.gone));
  assert.strictEqual(R.discard.filter(v => v === 4).length, 3);
});

const col3 = (a, b, c) => [a, b, c, a, b, c, a, b, c, a, b, c];   // aucune colonne n'a trois cartes identiques

test('fin de manche : dernier tour des autres, puis score ; qui finit sans être le plus bas voit son score doublé', () => {
  const R = rigged([col3(5, 6, 7), col3(1, 2, 3), col3(2, 3, 4)], [0, 0, 0, 0, 0, 0], 0);
  R.grids.forEach((g, p) => g.forEach((c, i) => { if (p > 0 || i < 11) c.up = true; }));   // joueur 0 : une seule carte cachée
  E.startRound(R, 0);
  assert.ok(E.takeDiscard(R)); assert.ok(E.place(R, 11));    // le joueur 0 retourne sa dernière carte : il termine la manche
  assert.strictEqual(R.endedBy, 0); assert.strictEqual(R.phase, 'draw'); assert.strictEqual(R.turn, 1);
  assert.ok(E.drawDeck(R)); assert.ok(E.place(R, 0));        // dernier tour du joueur 1
  assert.ok(E.drawDeck(R)); assert.ok(E.place(R, 0));        // dernier tour du joueur 2
  assert.strictEqual(R.phase, 'over');
  // joueur 0 : 72 - 7 + 0 = 65, doublé : 130 ; joueur 1 : 24 - 1 = 23 ; joueur 2 : 36 - 2 = 34
  assert.deepStrictEqual(R.scores, [130, 23, 34]);
  assert.ok(R.doubled);
});

test('le finisseur au plus bas (strictement) ne double pas', () => {
  const R = rigged([col3(1, 2, 3), col3(5, 6, 7)], [9, 9, 9], 1);
  R.grids.forEach((g, p) => g.forEach((c, i) => { if (p > 0 || i < 11) c.up = true; }));
  E.startRound(R, 0);
  assert.ok(E.takeDiscard(R)); assert.ok(E.place(R, 11));    // 24 - 3 + 1 = 22
  assert.ok(E.drawDeck(R)); assert.ok(E.place(R, 0));        // 72 - 5 + 9 = 76
  assert.strictEqual(R.phase, 'over'); assert.ok(!R.doubled);
  assert.deepStrictEqual(R.scores, [22, 76]);
});

test('égalité avec le finisseur : il n\'est pas le plus bas, donc doublé ; un score nul ou négatif ne double jamais', () => {
  const A = rigged([col3(1, 2, 3), col3(1, 2, 3)], [3, 3, 3], 3);
  A.grids.forEach((g, p) => g.forEach((c, i) => { if (p > 0 || i < 11) c.up = true; }));
  E.startRound(A, 0);
  assert.ok(E.takeDiscard(A)); assert.ok(E.place(A, 11));    // 24 pour le joueur 0 (le 3 remplace le 3)
  assert.ok(E.drawDeck(A)); assert.ok(E.place(A, 0));        // le joueur 1 remplace 1 par 3 : 26 ; plus de doublement
  assert.deepStrictEqual(A.scores, [24, 26]);
  const B = rigged([col3(-2, -1, 0), col3(-2, -1, 0)], [0, 0, 0], 0);
  B.grids.forEach((g, p) => g.forEach((c, i) => { if (p > 0 || i < 11) c.up = true; }));
  E.startRound(B, 0);
  assert.ok(E.takeDiscard(B)); assert.ok(E.place(B, 11));    // -12 pour le joueur 0
  assert.ok(E.drawDeck(B)); assert.ok(E.place(B, 0));        // -2 -> 0 : -10
  assert.ok(!B.doubled); assert.deepStrictEqual(B.scores, [-12, -10]);
});

test('totaux, fin de partie à 100, vainqueur au total le plus bas', () => {
  assert.ok(!E.gameOver([40, 99])); assert.ok(E.gameOver([40, 100]));
  assert.deepStrictEqual(E.winners([40, 12, 12, 80]), [1, 2]);
  assert.deepStrictEqual(E.addScores([10, 20], { scores: [5, -3] }), [15, 17]);
});

test('pioche vide : la défausse (sauf son dessus) est remélangée', () => {
  const R = rigged([twelve(9), twelve(9)], [], 3);
  R.discard = [1, 2, 3, 4, 5]; E.startRound(R, 0);
  assert.ok(E.drawDeck(R, seeded(3)));
  assert.strictEqual(R.discard.length, 1); assert.strictEqual(R.discard[0], 5);
  assert.ok([1, 2, 3, 4].includes(R.hand));
});

// ---------- Ordinateur ----------
function playRound(levels, seed, start) {
  const rng = seeded(seed), n = levels.length, R = E.newRound(n, rng);
  for (let p = 0; p < n; p++) E.aiInit(levels[p], R, p, rng).forEach(i => assert.ok(E.initFlip(R, p, i)));
  assert.ok(E.initDone(R));
  E.startRound(R, start == null ? -1 : start, rng);
  for (let t = 0; t < 400 && R.phase !== 'over'; t++) E.aiTurn(levels[R.turn], R, rng);
  assert.strictEqual(R.phase, 'over', 'la manche se termine');
  return R;
}

test('ordinateur : les 3 niveaux terminent des manches valides (2 à 8 joueurs)', () => {
  for (let n = 2; n <= 8; n++) for (let s = 0; s < 40; s++) {
    const levels = []; for (let p = 0; p < n; p++) levels.push(1 + ((p + s) % 3));
    const R = playRound(levels, 100 * n + s);
    assert.strictEqual(R.scores.length, n);
    R.scores.forEach(x => assert.ok(Number.isFinite(x)));
  }
});

// Duel à deux joueurs entre deux niveaux, sièges alternés ; renvoie les points moyens et les manches gagnées par `a`.
function duel(a, b, N) {
  let sa = 0, sb = 0, wa = 0, wb = 0;
  for (let s = 0; s < N; s++) {
    const levels = s % 2 ? [a, b] : [b, a], R = playRound(levels, 9000 + s, s % 2);
    const ia = s % 2 ? 0 : 1, ib = 1 - ia;
    sa += R.scores[ia]; sb += R.scores[ib];
    if (R.scores[ia] < R.scores[ib]) wa++; else if (R.scores[ib] < R.scores[ia]) wb++;
  }
  return { a: sa / N, b: sb / N, wa: wa / N, wb: wb / N };
}

test('ordinateur : débutant < normal < fort (duels à deux joueurs, plus de points = moins bien)', () => {
  const r12 = duel(1, 2, 2500), r23 = duel(2, 3, 3500);
  console.log('Débutant %s pts / normal %s pts (normal gagne %s%% des manches)', r12.a.toFixed(1), r12.b.toFixed(1), (100 * r12.wb).toFixed(0));
  console.log('Normal %s pts / fort %s pts (fort gagne %s%% des manches)', r23.a.toFixed(1), r23.b.toFixed(1), (100 * r23.wb).toFixed(0));
  assert.ok(r12.wb > 0.75, 'le normal domine nettement le débutant');
  assert.ok(r23.wb > 0.54, 'le fort bat le normal');
  assert.ok(r23.a - r23.b > 1.5, 'le fort marque nettement moins de points');
});
