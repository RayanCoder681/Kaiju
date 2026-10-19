// Tests d'intégration : vrai serveur HTTP + WebSocket sur le port 0, vrais clients ws.
// L'horloge des parties est simulée pour que les scores et les retards soient déterministes
// (aucune attente réelle de 20 s).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, CLOSE_REPLACED, CLOSE_KICKED, CLOSE_RATE_LIMITED } from '../server.js';
import { fakeClock, makeClient, QUIZ_2, sleep } from '../test-utils/helpers.js';
import { DISCONNECT_GRACE_MS } from '../src/game.js';

const clock = fakeClock();
const app = await createServer({ port: 0, host: '127.0.0.1', clock });
const url = `ws://127.0.0.1:${app.port}/ws`;
after(() => app.close());

async function connect(target = url, options) {
  const c = makeClient(target, options);
  await c.open();
  return c;
}

async function newHost(quizText = QUIZ_2) {
  const host = await connect();
  host.send({ type: 'host:create', quizText });
  const created = await host.next('host:created');
  await host.next('state');
  return { host, code: created.code, hostToken: created.hostToken, created };
}

async function newPlayer(code, nickname, playerToken) {
  const c = await connect();
  c.send({ type: 'player:join', code, nickname, playerToken });
  const joined = await c.next('joined');
  const state = await c.next('state');
  return { c, joined, state };
}

/** Attend que le serveur ait traité un aller-retour (ping/pong) sur cette socket. */
async function roundTrip(c) {
  c.send({ type: 'ping' });
  await c.next('pong');
}

test('création : code à 4 chiffres, hostToken, URL des participants, état LOBBY', async () => {
  const { host, created } = await newHost();
  assert.match(created.code, /^[1-9]\d{3}$/);
  assert.match(created.hostToken, /^[0-9a-f]{32}$/);
  assert.equal(created.questionCount, 2);
  assert.ok(created.joinUrl.endsWith(`/?code=${created.code}`), created.joinUrl);
  host.close();
});

test('quiz invalide : QUIZ_INVALID avec les erreurs du parseur, aucune session créée', async () => {
  const before = app.rooms.size;
  const host = await connect();
  host.send({ type: 'host:create', quizText: 'A ?\nx\ny\n\nB ?\n*x\n*y' });
  const err = await host.error('QUIZ_INVALID');
  assert.equal(err.details.length, 2);
  assert.deepEqual(Object.keys(err.details[0]).sort(), ['block', 'line', 'message']);
  assert.equal(app.rooms.size, before);
  host.close();
});

test('trois joueurs rejoignent : l’hôte voit la liste lobby', async () => {
  const { host, code } = await newHost();
  const names = ['Awa', 'Bello', 'Chris'];
  for (const n of names) await newPlayer(code, n);
  const lobby = await host.next('lobby', (m) => m.players.length === 3);
  assert.deepEqual(lobby.players.map((p) => p.nickname), names);
  assert.ok(lobby.players.every((p) => p.connected && /^p\d+$/.test(p.id)));
});

test('partie complète à deux questions jusqu’au podium : scores du serveur, champs client ignorés', async () => {
  const { host, code } = await newHost();
  const a = await newPlayer(code, 'Awa');
  const b = await newPlayer(code, 'Bello');
  host.send({ type: 'host:start' });

  const q0 = await a.c.next('question');
  await b.c.next('question');
  assert.equal(q0.index, 0);
  assert.equal(q0.total, 2);
  assert.deepEqual(q0.choices, ['Douala', 'Yaoundé', 'Bafoussam']);
  assert.equal('correctIndex' in q0, false, 'la bonne réponse n’est pas envoyée avant reveal');

  // Awa répond juste tout de suite ; Bello envoie une mauvaise réponse en prétendant 1000 points et 0 ms
  a.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 1 });
  await a.c.next('answer:ack');
  clock.skew(5000);
  b.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 0, points: 1000, elapsedMs: 0, correct: true });
  const r1b = await b.c.next('reveal');
  assert.equal(r1b.correctIndex, 1);
  assert.deepEqual(r1b.counts, [1, 1, 0]);
  assert.deepEqual(r1b.you, { answered: true, choiceIndex: 0, correct: false, points: 0, score: 0, rank: 2 });
  const r1h = await host.next('reveal');
  assert.equal('you' in r1h, false);
  assert.deepEqual(r1h.leaderboard[0], { nickname: 'Awa', score: 1000, rank: 1 });

  host.send({ type: 'host:next' });
  const q1 = await a.c.next('question');
  assert.equal(q1.index, 1);
  assert.equal(q1.durationMs, 10_000);
  clock.skew(2500);
  a.c.send({ type: 'player:answer', questionIndex: 1, choiceIndex: 1 });
  await a.c.next('answer:ack');
  clock.skew(2500);
  b.c.send({ type: 'player:answer', questionIndex: 1, choiceIndex: 1, points: 99999 });
  const r2a = await a.c.next('reveal', (m) => m.index === 1);
  assert.equal(r2a.you.points, 875);
  assert.equal(r2a.isLast, true);

  host.send({ type: 'host:next' });
  const podium = await host.next('podium');
  assert.deepEqual(podium.leaderboard, [
    { nickname: 'Awa', score: 1875, rank: 1 },
    { nickname: 'Bello', score: 750, rank: 2 },
  ]);
  const pb = await b.c.next('podium');
  assert.deepEqual(pb.you, { score: 750, rank: 2 });
});

test('action d’hôte depuis une socket joueur ou anonyme : NOT_HOST', async () => {
  const { code } = await newHost();
  const p = await newPlayer(code, 'Awa');
  for (const type of ['host:start', 'host:next', 'host:close', 'host:end']) {
    p.c.send({ type });
    await p.c.error('NOT_HOST');
  }
  p.c.send({ type: 'host:kick', playerId: p.joined.playerId });
  await p.c.error('NOT_HOST');
  const anon = await connect();
  anon.send({ type: 'host:resume', code, hostToken: 'f'.repeat(32) });
  await anon.error('NOT_HOST');
  anon.close();
});

test('entrées invalides : erreurs explicites, le serveur continue', async () => {
  const { host, code } = await newHost();
  const p = await newPlayer(code, 'Awa');
  p.c.send('pas du json');
  assert.match((await p.c.error('BAD_REQUEST')).message, /JSON/);
  p.c.send({ type: 'inconnu' });
  await p.c.error('BAD_REQUEST');
  p.c.send({ nope: true });
  await p.c.error('BAD_REQUEST');
  host.send({ type: 'host:start' });
  await p.c.next('question');
  p.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 7 });
  await p.c.error('INVALID_CHOICE');
  p.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: -1 });
  await p.c.error('INVALID_CHOICE');
  p.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 'x' });
  await p.c.error('INVALID_CHOICE');
  await roundTrip(p.c);
  const anon = await connect();
  anon.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 0 });
  await anon.error('BAD_REQUEST');
  anon.close();
});

test('réponses : ALREADY_ANSWERED, STALE_QUESTION, TOO_LATE (échéance + 300 ms)', async () => {
  const { host, code } = await newHost();
  const a = await newPlayer(code, 'Awa');
  const b = await newPlayer(code, 'Bello');
  const c = await newPlayer(code, 'Chris');
  host.send({ type: 'host:start' });
  await a.c.next('question');

  a.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 0 });
  await a.c.next('answer:ack');
  a.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 1 });
  await a.c.error('ALREADY_ANSWERED');

  b.c.send({ type: 'player:answer', questionIndex: 1, choiceIndex: 1 });
  await b.c.error('STALE_QUESTION');

  clock.skew(20_000 + 301); // l'horloge dépasse l'échéance + tolérance avant que le minuteur ne tourne
  b.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 1 });
  await b.c.error('TOO_LATE');

  clock.advance(0); // le minuteur serveur clôt maintenant la question
  const reveal = await c.c.next('reveal');
  assert.deepEqual(reveal.counts, [1, 0, 0]);
  assert.equal(reveal.you.answered, false);
  c.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 1 });
  await c.c.error('TOO_LATE');
  await host.next('reveal');
  await roundTrip(host);
  assert.equal(host.received('reveal').length, 0, 'une seule reveal pour l’hôte');
});

test('un joueur se déconnecte alors que les autres ont répondu : reveal après le délai de grâce', async () => {
  const { host, code } = await newHost();
  const a = await newPlayer(code, 'Awa');
  const b = await newPlayer(code, 'Bello');
  host.send({ type: 'host:start' });
  await a.c.next('question');
  a.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 1 });
  await host.next('progress', (m) => m.answered === 1 && m.expected === 2);
  b.c.close();
  await host.next('lobby', (m) => m.players.some((p) => p.nickname === 'Bello' && !p.connected));
  assert.equal(host.inbox.some((m) => m.type === 'reveal'), false, 'pas de correction pendant le délai');
  clock.advance(DISCONNECT_GRACE_MS);
  const reveal = await host.next('reveal');
  assert.deepEqual(reveal.counts, [0, 1, 0]);
});

test('10 participants simultanés répondent dans la même fenêtre : 10 réponses comptées', async () => {
  const { host, code } = await newHost('Choisis ?\n*un\ndeux\ntrois');
  const players = await Promise.all(Array.from({ length: 10 }, (_, i) => newPlayer(code, `joueur${i}`)));
  host.send({ type: 'host:start' });
  await Promise.all(players.map((p) => p.c.next('question')));
  players.forEach((p, i) => p.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: i % 3 }));
  const acks = await Promise.all(players.map((p) => p.c.next('answer:ack')));
  assert.equal(acks.length, 10);
  const reveal = await host.next('reveal');
  assert.deepEqual(reveal.counts, [4, 3, 3]);
  assert.equal(reveal.counts.reduce((s, n) => s + n), 10);
  const yous = await Promise.all(players.map((p) => p.c.next('reveal').then((r) => r.you)));
  assert.equal(yous.filter((y) => y.correct).length, 4);
  assert.ok(yous.every((y) => y.correct ? y.points === 1000 : y.points === 0));
});

test('reconnexion par jeton : même playerId, score conservé, état complet reçu', async () => {
  const { host, code } = await newHost();
  const a = await newPlayer(code, 'Awa');
  const b = await newPlayer(code, 'Bello');
  host.send({ type: 'host:start' });
  await a.c.next('question');
  a.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 1 });
  b.c.send({ type: 'player:answer', questionIndex: 0, choiceIndex: 1 });
  await a.c.next('reveal');
  host.send({ type: 'host:next' });
  await a.c.next('question', (m) => m.index === 1);

  a.c.close();
  await host.next('lobby', (m) => m.players.some((p) => p.nickname === 'Awa' && !p.connected));
  const again = await newPlayer(code, 'n’importe quoi', a.joined.playerToken);
  assert.equal(again.joined.resumed, true);
  assert.equal(again.joined.playerId, a.joined.playerId);
  assert.equal(again.joined.nickname, 'Awa');
  assert.equal(again.state.phase, 'QUESTION');
  assert.equal(again.state.question.index, 1);
  assert.equal(again.state.you.score, 1000);
  assert.equal(again.state.you.answeredChoice, null);
  // il peut répondre à la question en cours
  again.c.send({ type: 'player:answer', questionIndex: 1, choiceIndex: 1 });
  await again.c.next('answer:ack');
});

test('reprise par pseudo seul si l’original est déconnecté ; NICK_TAKEN s’il est connecté', async () => {
  const { host, code } = await newHost();
  const a = await newPlayer(code, 'Awa');
  const intruder = await connect();
  intruder.send({ type: 'player:join', code, nickname: 'AWA' });
  await intruder.error('NICK_TAKEN');

  a.c.close();
  await host.next('lobby', (m) => m.players.some((p) => !p.connected));
  const back = await newPlayer(code, 'awa');
  assert.equal(back.joined.resumed, true);
  assert.equal(back.joined.playerId, a.joined.playerId);
  assert.equal(back.joined.playerToken, a.joined.playerToken);
  intruder.close();
});

test('deux sockets avec le même jeton : l’ancienne est fermée, la nouvelle reçoit les messages', async () => {
  const { host, code } = await newHost();
  const first = await newPlayer(code, 'Awa');
  const second = await newPlayer(code, 'Awa', first.joined.playerToken);
  const closed = await first.c.closed;
  assert.equal(closed.code, CLOSE_REPLACED);
  host.send({ type: 'host:start' });
  await second.c.next('question');
  const lobby = host.received('lobby').at(-1);
  assert.ok(lobby.players.every((p) => p.connected), 'la fermeture de l’ancienne socket ne déconnecte pas le joueur');
});

test('reprise de l’hôte par hostToken : état complet, ancienne socket fermée', async () => {
  const { host, code, hostToken } = await newHost();
  await newPlayer(code, 'Awa');
  const host2 = await connect();
  host2.send({ type: 'host:resume', code, hostToken });
  const state = await host2.next('state');
  assert.equal(state.role, 'host');
  assert.equal(state.phase, 'LOBBY');
  assert.equal(state.players.length, 1);
  assert.ok(state.joinUrl.endsWith(`?code=${code}`));
  assert.equal((await host.closed).code, CLOSE_REPLACED);
  host2.send({ type: 'host:start' });
  await host2.next('question');
});

test('code inexistant : ROOM_NOT_FOUND', async () => {
  const c = await connect();
  const used = new Set(app.rooms.games.keys());
  const free = ['1000', '1001', '1002', '1003'].find((x) => !used.has(x));
  for (const code of [free, '0000', 'abcd', '12345']) {
    c.send({ type: 'player:join', code, nickname: 'Awa' });
    await c.error('ROOM_NOT_FOUND');
  }
  c.close();
});

test('session au podium : ROOM_ENDED pour un nouveau joueur', async () => {
  const { host, code } = await newHost();
  await newPlayer(code, 'Awa');
  host.send({ type: 'host:end' });
  await host.next('podium');
  const late = await connect();
  late.send({ type: 'player:join', code, nickname: 'Tard' });
  await late.error('ROOM_ENDED');
  late.close();
});

test('exclusion : message kicked, socket fermée, pseudo bloqué', async () => {
  const { host, code } = await newHost();
  const t = await newPlayer(code, 'Troll');
  host.send({ type: 'host:kick', playerId: t.joined.playerId });
  await t.c.next('kicked');
  assert.equal((await t.c.closed).code, CLOSE_KICKED);
  const again = await connect();
  again.send({ type: 'player:join', code, nickname: 'troll' });
  await again.error('NICK_TAKEN');
  again.close();
});

test('limite de débit : RATE_LIMITED puis fermeture', async () => {
  const c = await connect();
  for (let i = 0; i < 25; i++) c.send({ type: 'ping' });
  await c.error('RATE_LIMITED');
  assert.equal((await c.closed).code, CLOSE_RATE_LIMITED);
});

test('message trop gros (> 64 Ko) : socket fermée, le serveur continue', async () => {
  const c = await connect();
  c.send({ type: 'host:create', quizText: 'x'.repeat(70 * 1024) });
  assert.equal((await c.closed).code, 1009);
  const ok = await connect();
  await roundTrip(ok);
  ok.close();
});

test('redémarrage du serveur : la reprise renvoie ROOM_NOT_FOUND', async () => {
  let server = await createServer({ port: 0, host: '127.0.0.1' });
  let u = `ws://127.0.0.1:${server.port}/ws`;
  const host = makeClient(u);
  await host.open();
  host.send({ type: 'host:create', quizText: QUIZ_2 });
  const { code, hostToken } = await host.next('host:created');
  const p = makeClient(u);
  await p.open();
  p.send({ type: 'player:join', code, nickname: 'Awa' });
  const { playerToken } = await p.next('joined');

  await server.close(); // toutes les parties en mémoire sont perdues
  await Promise.all([host.closed, p.closed]);
  server = await createServer({ port: 0, host: '127.0.0.1' });
  u = `ws://127.0.0.1:${server.port}/ws`;
  try {
    const p2 = makeClient(u);
    await p2.open();
    p2.send({ type: 'player:join', code, nickname: 'Awa', playerToken });
    await p2.error('ROOM_NOT_FOUND');
    p2.send({ type: 'host:resume', code, hostToken });
    await p2.error('ROOM_NOT_FOUND');
    p2.close();
  } finally {
    await server.close();
  }
});

test('heartbeat : une socket qui ne répond plus est coupée et le joueur passe déconnecté', async () => {
  const server = await createServer({ port: 0, host: '127.0.0.1', heartbeatMs: 40 });
  const u = `ws://127.0.0.1:${server.port}/ws`;
  try {
    const host = makeClient(u);
    await host.open();
    host.send({ type: 'host:create', quizText: QUIZ_2 });
    const { code } = await host.next('host:created');
    const mute = makeClient(u, { autoPong: false }); // téléphone en veille : plus de pong
    await mute.open();
    mute.send({ type: 'player:join', code, nickname: 'Dort' });
    await mute.next('joined');
    await host.next('lobby', (m) => m.players.some((p) => p.nickname === 'Dort' && !p.connected), 3000);
    host.close();
  } finally {
    await server.close();
  }
});

test('ALLOWED_ORIGINS défini : connexion refusée depuis une autre origine', async () => {
  const server = await createServer({ port: 0, host: '127.0.0.1', allowedOrigins: ['https://kaiju.example.org'] });
  const u = `ws://127.0.0.1:${server.port}/ws`;
  try {
    const bad = makeClient(u, { origin: 'https://evil.example.com' });
    await assert.rejects(bad.open());
    const good = makeClient(u, { origin: 'https://kaiju.example.org' });
    await good.open();
    good.close();
  } finally {
    await server.close();
  }
  await sleep(0);
});
