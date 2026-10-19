// Tests unitaires : validation des messages, pseudos, limite de débit, sessions en mémoire et nettoyage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, normalizeNickname, createRateLimiter, makeError, ERROR_MESSAGES } from '../src/protocol.js';
import { Rooms, PODIUM_TTL_MS, IDLE_TTL_MS } from '../src/rooms.js';
import { parseQuiz } from '../src/quiz-parser.js';
import { fakeClock } from '../test-utils/helpers.js';

test('parseMessage : JSON invalide, type manquant ou inconnu -> BAD_REQUEST', () => {
  for (const raw of ['{', 'null', '[]', '"x"', '{"type":3}', '{"type":"hack"}', '{"type":"__proto__"}', '{"type":"toString"}']) {
    const r = parseMessage(raw);
    assert.equal(r.ok, false, raw);
    assert.equal(r.error.code, 'BAD_REQUEST', raw);
  }
});

test('parseMessage : champs requis et types vérifiés', () => {
  assert.equal(parseMessage('{"type":"player:join","code":"1234"}').ok, false);
  assert.equal(parseMessage('{"type":"player:answer","questionIndex":"0","choiceIndex":1}').ok, false);
  assert.equal(parseMessage('{"type":"host:create","quizText":"x","settings":{"defaultTimeSec":2}}').ok, false);
  assert.equal(parseMessage(Buffer.from('{"type":"ping"}')).ok, true);
});

test('parseMessage : les champs non prévus (points, elapsedMs, correct) sont retirés', () => {
  const r = parseMessage(JSON.stringify({ type: 'player:answer', questionIndex: 0, choiceIndex: 1, points: 1000, elapsedMs: 0, correct: true }));
  assert.ok(r.ok);
  assert.deepEqual(r.msg, { type: 'player:answer', questionIndex: 0, choiceIndex: 1 });
});

test('normalizeNickname : NFC, espaces, longueur en caractères, clé insensible à la casse', () => {
  const decomposed = 'Amélie'; // « é » décomposé
  const r = normalizeNickname(decomposed);
  assert.equal(r.value, 'Amélie');
  assert.equal(r.key, 'amélie');
  assert.equal(normalizeNickname('ÉLODIE').key, normalizeNickname('élodie').key);
  assert.ok(normalizeNickname('é'.repeat(20)).ok);
  assert.equal(normalizeNickname('a\tb').ok, false);
  assert.equal(normalizeNickname('a b').ok, false);
});

test('limite de débit : 20 messages par seconde, puis refus, puis nouvelle fenêtre', () => {
  const clock = fakeClock();
  const allow = createRateLimiter(clock, 20);
  for (let i = 0; i < 20; i++) assert.equal(allow(), true);
  assert.equal(allow(), false);
  clock.skew(1000);
  assert.equal(allow(), true);
});

test('makeError : message français par défaut, détails optionnels', () => {
  assert.equal(makeError('NICK_TAKEN').message, ERROR_MESSAGES.NICK_TAKEN);
  assert.deepEqual(makeError('QUIZ_INVALID', undefined, [1]).details, [1]);
});

const QUESTIONS = parseQuiz('Q ?\n*a\nb').questions;

test('Rooms : codes uniques, get, suppression avec rappel', () => {
  const removed = [];
  const rooms = new Rooms({ clock: fakeClock(), onRemove: (code) => removed.push(code) });
  const codes = new Set();
  for (let i = 0; i < 50; i++) codes.add(rooms.create(QUESTIONS).code);
  assert.equal(codes.size, 50);
  const [first] = codes;
  assert.ok(rooms.get(first));
  assert.equal(rooms.get('0000'), null);
  assert.ok(rooms.remove(first));
  assert.equal(rooms.get(first), null);
  assert.deepEqual(removed, [first]);
});

test('Rooms.sweep : podium > 30 min et sessions sans connexion > 2 h supprimées', () => {
  const clock = fakeClock();
  const rooms = new Rooms({ clock });
  const ended = rooms.create(QUESTIONS);
  ended.setHostConnected(true);
  ended.join('Awa');
  ended.end();
  const abandoned = rooms.create(QUESTIONS);
  const active = rooms.create(QUESTIONS);
  active.setHostConnected(true);

  clock.skew(PODIUM_TTL_MS + 1);
  assert.deepEqual(rooms.sweep(), [ended.code], 'podium expiré, même avec des sockets');
  clock.skew(IDLE_TTL_MS);
  assert.deepEqual(rooms.sweep(), [abandoned.code]);
  assert.ok(rooms.get(active.code), 'une session avec l’hôte connecté est conservée');
});

test('Rooms : la suppression annule le minuteur de la question en cours', () => {
  const clock = fakeClock();
  const rooms = new Rooms({ clock });
  const game = rooms.create(QUESTIONS);
  game.join('Awa');
  game.start();
  assert.equal(clock.pending(), 1);
  rooms.destroyAll();
  assert.equal(clock.pending(), 0);
  assert.equal(rooms.size, 0);
});
