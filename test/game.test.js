// Tests unitaires de la classe Game (horloge simulée, aucun réseau).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, PHASE, DISCONNECT_GRACE_MS } from '../src/game.js';
import { parseQuiz } from '../src/quiz-parser.js';
import { fakeClock, recorder, QUIZ_2 } from '../test-utils/helpers.js';

function setup(quiz = QUIZ_2) {
  const clock = fakeClock();
  const rec = recorder();
  const { questions, errors } = parseQuiz(quiz);
  assert.deepEqual(errors, []);
  const game = new Game({ code: '4821', questions, send: rec.send, clock });
  return { clock, rec, game };
}

function withPlayers(names, quiz) {
  const ctx = setup(quiz);
  const players = names.map((n) => {
    const r = ctx.game.join(n);
    assert.ok(r.ok, `join ${n}`);
    return r.player;
  });
  return { ...ctx, players };
}

test('partie complète à deux questions : scores calculés par le serveur, podium', () => {
  const { clock, rec, game, players } = withPlayers(['Awa', 'Bello']);
  const [a, b] = players;
  assert.ok(game.start().ok);
  assert.equal(game.phase, PHASE.QUESTION);

  // Q1 (20 s) : Awa juste immédiatement, Bello faux à 5 s -> reveal dès que tous ont répondu
  assert.ok(game.answer(a.id, 0, 1).ok);
  clock.skew(5000);
  assert.ok(game.answer(b.id, 0, 0).ok);
  assert.equal(game.phase, PHASE.REVEAL);
  const r1 = rec.to(a.id, 'reveal')[0];
  assert.equal(r1.correctIndex, 1);
  assert.deepEqual(r1.counts, [1, 1, 0]);
  assert.deepEqual(r1.you, { answered: true, choiceIndex: 1, correct: true, points: 1000, score: 1000, rank: 1 });
  assert.deepEqual(rec.to(b.id, 'reveal')[0].you, { answered: true, choiceIndex: 0, correct: false, points: 0, score: 0, rank: 2 });

  // Q2 (10 s) : Awa juste à 2,5 s (875), Bello juste à 5 s (750)
  assert.ok(game.next().ok);
  assert.equal(game.index, 1);
  clock.skew(2500);
  game.answer(a.id, 1, 1);
  clock.skew(2500);
  game.answer(b.id, 1, 1);
  assert.equal(game.phase, PHASE.REVEAL);
  assert.equal(rec.to('host', 'reveal')[1].isLast, true);

  assert.ok(game.next().ok);
  assert.equal(game.phase, PHASE.PODIUM);
  const hostPodium = rec.to('host', 'podium')[0];
  assert.deepEqual(hostPodium.leaderboard, [
    { nickname: 'Awa', score: 1875, rank: 1 },
    { nickname: 'Bello', score: 750, rank: 2 },
  ]);
  assert.deepEqual(rec.to(b.id, 'podium')[0].you, { score: 750, rank: 2 });
  assert.equal(clock.pending(), 0, 'aucun minuteur ne reste actif');
});

test('le message question ne contient jamais la bonne réponse', () => {
  const { rec, game } = withPlayers(['Awa']);
  game.start();
  for (const { msg } of rec.ofType('question')) {
    assert.equal('correctIndex' in msg, false);
    assert.doesNotMatch(JSON.stringify(msg), /correct/i);
  }
  const state = game.stateFor(game.players.keys().next().value);
  assert.doesNotMatch(JSON.stringify(state), /correct/i, 'ni dans l’instantané de reprise');
});

test('seconde réponse : ALREADY_ANSWERED et le score ne change pas', () => {
  const { game, players, clock } = withPlayers(['Awa', 'Bello']);
  game.start();
  assert.ok(game.answer(players[0].id, 0, 0).ok); // faux
  const r = game.answer(players[0].id, 0, 1); // tente la bonne
  assert.equal(r.code, 'ALREADY_ANSWERED');
  clock.advance(20_300);
  assert.equal(players[0].score, 0);
});

test('choix hors bornes ou non entier : INVALID_CHOICE', () => {
  const { game, players } = withPlayers(['Awa']);
  game.start();
  for (const c of [-1, 3, 1.5, '1', null, undefined]) {
    assert.equal(game.answer(players[0].id, 0, c).code, 'INVALID_CHOICE', String(c));
  }
  assert.equal(game.phase, PHASE.QUESTION);
});

test('réponse dans la tolérance de 300 ms acceptée à 500 points, au-delà TOO_LATE', () => {
  const { game, players, clock } = withPlayers(['Awa', 'Bello', 'Chris']);
  game.start();
  clock.skew(20_000 + 300); // horloge en retard sur le minuteur : l'échéance + 300 ms pile
  assert.ok(game.answer(players[0].id, 0, 1).ok);
  clock.skew(1); // 301 ms après l'échéance
  assert.equal(game.answer(players[1].id, 0, 1).code, 'TOO_LATE');
  game.closeQuestion();
  assert.equal(players[0].score, 500);
  assert.equal(players[1].score, 0);
});

test('réponse après la clôture par le minuteur : TOO_LATE', () => {
  const { game, players, clock, rec } = withPlayers(['Awa', 'Bello']);
  game.start();
  game.answer(players[0].id, 0, 1);
  clock.advance(20_300); // le minuteur serveur clôt la question
  assert.equal(game.phase, PHASE.REVEAL);
  assert.equal(rec.ofType('reveal').length, 3);
  assert.equal(game.answer(players[1].id, 0, 1).code, 'TOO_LATE');
});

test('questionIndex périmé : STALE_QUESTION ; réponse en LOBBY : WRONG_PHASE', () => {
  const { game, players } = withPlayers(['Awa', 'Bello']);
  assert.equal(game.answer(players[0].id, 0, 1).code, 'WRONG_PHASE');
  game.start();
  game.answer(players[0].id, 0, 1);
  game.answer(players[1].id, 0, 1);
  game.next();
  assert.equal(game.answer(players[0].id, 0, 1).code, 'STALE_QUESTION');
  assert.equal(game.answer(players[0].id, 5, 1).code, 'STALE_QUESTION');
});

test('clôture idempotente : minuteur et dernière réponse simultanés -> une seule reveal', () => {
  const { game, players, clock, rec } = withPlayers(['Awa', 'Bello']);
  game.start();
  const timerFn = [...clock.timers.values()][0].fn;
  game.answer(players[0].id, 0, 1);
  game.answer(players[1].id, 0, 1); // dernière réponse -> closeQuestion()
  timerFn(); // le minuteur se déclenche quand même (clearTimeout trop tard)
  assert.equal(game.closeQuestion(), false);
  assert.equal(rec.to('host', 'reveal').length, 1);
  assert.equal(rec.ofType('reveal').length, 3, 'une reveal par destinataire, pas plus');
  assert.equal(players[0].score, 1000, 'points appliqués une seule fois');
});

test('minuteur au même instant que la dernière réponse : la réponse arrive après la clôture', () => {
  const { game, players, clock, rec } = withPlayers(['Awa', 'Bello']);
  game.start();
  game.answer(players[0].id, 0, 1);
  clock.advance(20_300);
  assert.equal(game.answer(players[1].id, 0, 1).code, 'TOO_LATE');
  assert.equal(rec.to('host', 'reveal').length, 1);
});

test('tous les joueurs connectés ont répondu : reveal immédiat, minuteur annulé', () => {
  const { game, players, clock, rec } = withPlayers(['Awa', 'Bello', 'Chris']);
  game.start();
  for (const p of players) game.answer(p.id, 0, 2);
  assert.equal(game.phase, PHASE.REVEAL);
  assert.equal(clock.pending(), 0);
  assert.deepEqual(rec.to('host', 'progress').at(-1), { type: 'progress', answered: 3, expected: 3 });
});

test('déconnexion pendant la question : le joueur reste attendu pendant le délai de grâce (CA1, CA6)', () => {
  const { game, players, rec, clock } = withPlayers(['Awa', 'Bello', 'Chris']);
  game.start();
  game.answer(players[0].id, 0, 1);
  game.answer(players[1].id, 0, 0);
  game.disconnect(players[2].id);
  assert.equal(game.phase, PHASE.QUESTION, 'pas de correction immédiate');
  assert.deepEqual(rec.to('host', 'progress').at(-1), { type: 'progress', answered: 2, expected: 3 });
  clock.advance(DISCONNECT_GRACE_MS - 1);
  assert.equal(game.phase, PHASE.QUESTION, 'toujours attendu juste avant la fin du délai');
});

test('retour dans le délai de grâce : le joueur peut encore répondre et marquer (CA2)', () => {
  const { game, players, clock } = withPlayers(['Awa', 'Bello']);
  game.start();
  game.answer(players[0].id, 0, 1);
  game.disconnect(players[1].id);
  clock.advance(2000);
  assert.ok(game.join('Bello').resumed);
  clock.advance(1000);
  assert.ok(game.answer(players[1].id, 0, 1).ok);
  assert.equal(game.phase, PHASE.REVEAL);
  assert.equal(players[1].score, 925, '3 s sur 20 s : round(1000 × (1 − 0,15/2))');
  clock.advance(DISCONNECT_GRACE_MS);
  assert.equal(clock.pending(), 0, 'minuteur de grâce annulé au retour');
});

test('délai de grâce expiré : correction unique si les autres ont répondu (CA3)', () => {
  const { game, players, rec, clock } = withPlayers(['Awa', 'Bello', 'Chris']);
  game.start();
  game.answer(players[0].id, 0, 1);
  game.answer(players[1].id, 0, 0);
  game.disconnect(players[2].id);
  clock.advance(DISCONNECT_GRACE_MS);
  assert.equal(game.phase, PHASE.REVEAL);
  assert.equal(rec.to('host', 'reveal').length, 1);
  clock.advance(30_000);
  assert.equal(rec.to('host', 'reveal').length, 1, 'aucune seconde correction');
});

test('le délai de grâce ne prolonge pas la question au-delà de son échéance (CA4)', () => {
  const { game, players, clock } = withPlayers(['Awa', 'Bello']);
  game.start();
  clock.advance(19_000);
  game.disconnect(players[1].id);
  clock.advance(1_300); // échéance 20 s + tolérance 300 ms
  assert.equal(game.phase, PHASE.REVEAL);
});

test('suppression de la session : aucun minuteur de grâce ne survit (relecture du diff)', () => {
  const { game, players, clock } = withPlayers(['Awa', 'Bello']);
  game.start();
  game.disconnect(players[1].id);
  game.destroy();
  assert.equal(clock.pending(), 0);
});

test('la clôture annule les minuteurs de grâce : rien ne fuit sur la question suivante (CA5)', () => {
  const { game, players, rec, clock } = withPlayers(['Awa', 'Bello', 'Chris']);
  game.start();
  game.disconnect(players[2].id);
  game.close();
  assert.equal(clock.pending(), 0);
  game.next();
  game.join('Chris');
  game.answer(players[0].id, 1, 1);
  clock.advance(DISCONNECT_GRACE_MS);
  assert.equal(game.phase, PHASE.QUESTION, 'la question 2 attend toujours Bello et Chris');
  assert.equal(rec.to('host', 'reveal').length, 1);
});

test('un joueur qui a répondu puis s’est déconnecté reste compté', () => {
  const { game, players, rec } = withPlayers(['Awa', 'Bello']);
  game.start();
  game.answer(players[0].id, 0, 1);
  game.disconnect(players[0].id);
  assert.deepEqual(rec.to('host', 'progress').at(-1), { type: 'progress', answered: 1, expected: 2 });
  game.answer(players[1].id, 0, 1);
  assert.equal(game.phase, PHASE.REVEAL);
  assert.equal(players[0].score, 1000);
});

test('plus personne en ligne : on attend la fin du temps', () => {
  const { game, players, clock } = withPlayers(['Awa']);
  game.start();
  game.disconnect(players[0].id);
  assert.equal(game.phase, PHASE.QUESTION);
  clock.advance(20_300);
  assert.equal(game.phase, PHASE.REVEAL);
});

test('transitions gardées : WRONG_PHASE', () => {
  const { game } = setup();
  assert.equal(game.start().code, 'WRONG_PHASE', 'pas de joueur');
  assert.equal(game.next().code, 'WRONG_PHASE');
  assert.equal(game.close().code, 'WRONG_PHASE');
  game.join('Awa');
  game.start();
  assert.equal(game.start().code, 'WRONG_PHASE');
  assert.equal(game.next().code, 'WRONG_PHASE');
  assert.ok(game.close().ok);
  assert.equal(game.close().code, 'WRONG_PHASE');
  assert.ok(game.end().ok);
  assert.equal(game.end().code, 'WRONG_PHASE');
});

test('fin anticipée pendant une question : les réponses données comptent, podium', () => {
  const { game, players, clock, rec } = withPlayers(['Awa', 'Bello']);
  game.start();
  game.answer(players[0].id, 0, 1);
  game.end();
  assert.equal(game.phase, PHASE.PODIUM);
  assert.equal(players[0].score, 1000);
  assert.equal(clock.pending(), 0);
  assert.equal(rec.to(players[1].id, 'podium')[0].you.rank, 2);
});

test('reconnexion : jeton, pseudo seul si déconnecté, NICK_TAKEN si connecté', () => {
  const { game, players } = withPlayers(['Awa']);
  const awa = players[0];
  // Même pseudo (casse différente) pendant que Awa est connectée
  assert.equal(game.join('AWA').code, 'NICK_TAKEN');
  // Jeton : reprise quel que soit le pseudo saisi, même si l'ancienne socket est encore là
  const byToken = game.join('autre chose', awa.token);
  assert.ok(byToken.ok && byToken.resumed);
  assert.equal(byToken.player.id, awa.id);
  // Pseudo seul après déconnexion
  game.disconnect(awa.id);
  const byNick = game.join('  awa ');
  assert.ok(byNick.ok && byNick.resumed);
  assert.equal(byNick.player.id, awa.id);
  assert.equal(game.players.size, 1);
});

test('reprise en cours de partie : score et réponse conservés, instantané complet', () => {
  const { game, players, clock } = withPlayers(['Awa', 'Bello']);
  game.start();
  game.answer(players[0].id, 0, 1);
  game.answer(players[1].id, 0, 1);
  game.next();
  clock.skew(1000);
  game.answer(players[0].id, 1, 2);
  game.disconnect(players[0].id);
  const r = game.join('Awa', players[0].token);
  assert.equal(r.player.score, 1000);
  const state = game.stateFor(players[0].id);
  assert.equal(state.phase, PHASE.QUESTION);
  assert.equal(state.question.index, 1);
  assert.equal(state.you.answeredChoice, 2);
  assert.equal(state.remainingMs, 9000);
});

test('pseudos : invalides refusés, normalisés', () => {
  const { game } = setup();
  for (const bad of ['', '   ', 'a'.repeat(21), 'ab\u0007c', 'x\ny', 42, null]) {
    assert.equal(game.join(bad).code, 'NICK_INVALID', JSON.stringify(bad));
  }
  const ok = game.join('  Jean   Paul ');
  assert.equal(ok.player.nickname, 'Jean Paul');
});

test('arrivée en cours de partie acceptée ; partie au podium : ROOM_ENDED', () => {
  const { game } = withPlayers(['Awa']);
  game.start();
  const late = game.join('Retard');
  assert.ok(late.ok);
  assert.equal(game.progress().expected, 2);
  game.end();
  assert.equal(game.join('Nouveau').code, 'ROOM_ENDED');
  assert.equal(game.join('Awa', late.player.token).code, 'ROOM_ENDED');
});

test('exclusion en salle d’attente : retire le joueur et bannit son pseudo', () => {
  const { game, players, rec } = withPlayers(['Awa', 'Troll']);
  const r = game.kick(players[1].id);
  assert.ok(r.ok);
  assert.equal(rec.to(players[1].id, 'kicked').length, 1);
  assert.equal(game.players.size, 1);
  assert.equal(game.join('troll').code, 'NICK_TAKEN');
  assert.equal(game.join('x', players[1].token).ok, true, 'le jeton d’un exclu ne restaure rien : nouveau joueur « x »');
  assert.equal(game.kick('p999').code, 'BAD_REQUEST');
  game.start();
  assert.equal(game.kick(players[0].id).code, 'WRONG_PHASE');
});

test('podium : top 3 pour les joueurs, classement complet pour l’hôte', () => {
  const names = ['A', 'B', 'C', 'D', 'E'];
  const { game, players, clock, rec } = withPlayers(names, 'Q ?\n*oui\nnon');
  game.start();
  players.forEach((p, i) => {
    clock.skew(1000);
    game.answer(p.id, 0, 0);
    assert.ok(i < 4 || game.phase === PHASE.REVEAL);
  });
  game.next();
  assert.equal(rec.to('host', 'podium')[0].leaderboard.length, 5);
  const last = rec.to(players[4].id, 'podium')[0];
  assert.equal(last.leaderboard.length, 3);
  assert.deepEqual(last.leaderboard.map((e) => e.nickname), ['A', 'B', 'C']);
  assert.equal(last.you.rank, 5);
});

test('minuteur écoulé sans réponse : reveal avec zéro vote', () => {
  const { game, clock, rec } = withPlayers(['Awa']);
  game.start();
  clock.advance(20_299);
  assert.equal(game.phase, PHASE.QUESTION);
  clock.advance(1);
  assert.equal(game.phase, PHASE.REVEAL);
  assert.deepEqual(rec.to('host', 'reveal')[0].counts, [0, 0, 0]);
});
