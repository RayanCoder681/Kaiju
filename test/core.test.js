// Tests des modules purs (copiés du skill kaiju-core). Exécution : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuiz, LIMITS } from '../src/quiz-parser.js';
import { computePoints, isOnTime, rankPlayers } from '../src/scoring.js';
import { generateRoomCode, isValidRoomCode } from '../src/room-code.js';

// ---------- Parseur ----------
const SAMPLE = `Quelle est la capitale du Cameroun ?
Douala
*Yaoundé
Bafoussam

Combien font 2 + 2 ? [10s]
3
*4`;

test('parse un quiz valide avec durée par défaut et durée explicite', () => {
  const { questions, errors } = parseQuiz(SAMPLE);
  assert.deepEqual(errors, []);
  assert.equal(questions.length, 2);
  assert.deepEqual(questions[0], {
    text: 'Quelle est la capitale du Cameroun ?',
    choices: ['Douala', 'Yaoundé', 'Bafoussam'],
    correctIndex: 1,
    timeSec: 20,
  });
  assert.equal(questions[1].timeSec, 10);
  assert.equal(questions[1].correctIndex, 1);
});

test('tolère CRLF, BOM, tabulations, puces, préfixes A) et étoile en fin de ligne', () => {
  const text = '﻿1. Langage du serveur ?\r\n\tA) Python\r\nB) JavaScript *\r\n- C) Go\r\n\r\n\r\n';
  const { questions, errors } = parseQuiz(text);
  assert.deepEqual(errors, []);
  assert.equal(questions[0].text, 'Langage du serveur ?');
  assert.deepEqual(questions[0].choices, ['Python', 'JavaScript', 'Go']);
  assert.equal(questions[0].correctIndex, 1);
});

test('étoile après un préfixe de lettre', () => {
  const { questions, errors } = parseQuiz('Q ?\nA) Non\nB) *Oui');
  assert.deepEqual(errors, []);
  assert.equal(questions[0].correctIndex, 1);
});

test('étoile échappée = texte littéral', () => {
  const { questions, errors } = parseQuiz('Opérateur de multiplication en JS ?\n\\*\n*×\n/');
  // "\*" devient "*" non marqué ; "*×" est la bonne réponse
  assert.deepEqual(errors, []);
  assert.deepEqual(questions[0].choices, ['*', '×', '/']);
  assert.equal(questions[0].correctIndex, 1);
});

test('un indice entre crochets sans « s » reste dans l’énoncé', () => {
  const { questions, errors } = parseQuiz('Que vaut a[2] ?\n*3\n4');
  assert.deepEqual(errors, []);
  assert.equal(questions[0].text, 'Que vaut a[2] ?');
  assert.equal(questions[0].timeSec, 20);
});

test('erreurs : pas d’étoile, deux étoiles, trop de réponses, une seule réponse', () => {
  const text = 'A ?\nx\ny\n\nB ?\n*x\n*y\n\nC ?\na\nb\nc\nd\n*e\n\nD ?\n*seule';
  const { questions, errors } = parseQuiz(text);
  assert.equal(questions.length, 0, 'tout ou rien');
  const byBlock = (n) => errors.filter((e) => e.block === n).map((e) => e.message).join(' | ');
  assert.match(byBlock(1), /Aucune bonne réponse/);
  assert.match(byBlock(2), /Une seule bonne réponse/);
  assert.match(byBlock(3), /entre 2 et 4/);
  assert.match(byBlock(4), /entre 2 et 4/);
});

test('erreurs : réponses en double, durée hors limites, textes trop longs, entrée vide', () => {
  assert.match(parseQuiz('Q ?\n*Oui\noui').errors[0].message, /double/);
  assert.match(parseQuiz('Q ? [500s]\n*a\nb').errors[0].message, /hors limites/);
  const long = 'x'.repeat(LIMITS.maxQuestionLength + 1);
  assert.match(parseQuiz(`${long}\n*a\nb`).errors[0].message, /trop long/);
  assert.match(parseQuiz('   \n\n').errors[0].message, /Aucune question/);
  assert.match(parseQuiz(42).errors[0].message, /texte/);
  assert.match(parseQuiz('x'.repeat(LIMITS.maxInputChars + 1)).errors[0].message, /trop long/);
});

test('les numéros de ligne pointent sur la bonne ligne', () => {
  const { errors } = parseQuiz('Q1 ?\n*a\nb\n\nQ2 ?\n*a\n*b');
  assert.equal(errors[0].block, 2);
  assert.equal(errors[0].line, 7);
});

// ---------- Score ----------
test('score : bornes 1000 / 500, seuil instantané, arrondi', () => {
  assert.equal(computePoints({ correct: true, elapsedMs: 0, durationMs: 20000 }), 1000);
  assert.equal(computePoints({ correct: true, elapsedMs: 499, durationMs: 20000 }), 1000);
  assert.equal(computePoints({ correct: true, elapsedMs: 10000, durationMs: 20000 }), 750);
  assert.equal(computePoints({ correct: true, elapsedMs: 20000, durationMs: 20000 }), 500);
  assert.equal(computePoints({ correct: true, elapsedMs: 20250, durationMs: 20000 }), 500, 'grâce réseau : jamais < 500');
  assert.equal(computePoints({ correct: true, elapsedMs: 1333, durationMs: 20000 }), 967);
  assert.equal(computePoints({ correct: false, elapsedMs: 0, durationMs: 20000 }), 0);
  assert.throws(() => computePoints({ correct: true, elapsedMs: 0, durationMs: 0 }), RangeError);
});

test('réponse à l’heure / en retard', () => {
  assert.equal(isOnTime({ receivedAt: 1000, endsAt: 1000 }), true);
  assert.equal(isOnTime({ receivedAt: 1300, endsAt: 1000 }), true);
  assert.equal(isOnTime({ receivedAt: 1301, endsAt: 1000 }), false);
});

test('classement déterministe avec départage', () => {
  const ranked = rankPlayers([
    { id: 'a', nickname: 'A', score: 1500, correctTimeMs: 9000, joinedAt: 1 },
    { id: 'b', nickname: 'B', score: 1500, correctTimeMs: 4000, joinedAt: 2 },
    { id: 'c', nickname: 'C', score: 2000, correctTimeMs: 20000, joinedAt: 3 },
    { id: 'd', nickname: 'D', score: 1500, correctTimeMs: 4000, joinedAt: 0 },
  ]);
  assert.deepEqual(ranked.map((p) => p.id), ['c', 'd', 'b', 'a']);
  assert.deepEqual(ranked.map((p) => p.rank), [1, 2, 3, 4]);
});

// ---------- Codes ----------
test('codes : 4 chiffres, pas de collision, saturation détectée', () => {
  const active = new Map();
  for (let i = 0; i < 500; i++) {
    const code = generateRoomCode(active);
    assert.ok(isValidRoomCode(code), code);
    assert.ok(!active.has(code));
    active.set(code, true);
  }
  // Générateur volontairement « malchanceux » : force le repli par balayage
  const taken = new Set(['1234']);
  assert.equal(generateRoomCode(taken, () => 1234), '1235');
  const full = { size: 9000, has: () => true };
  assert.throws(() => generateRoomCode(full));
  assert.equal(isValidRoomCode('0123'), false);
  assert.equal(isValidRoomCode('12345'), false);
});
