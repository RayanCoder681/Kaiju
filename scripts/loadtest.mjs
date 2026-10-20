#!/usr/bin/env node
/**
 * Test de charge SIMULÉ (pas un essai LAN réel) : N participants se connectent,
 * rejoignent une session, répondent à un quiz, et on mesure les latences.
 *
 * Usage : node scripts/loadtest.mjs --base http://localhost:4000 --n 40 --user prof --pass motdepasse1
 * Le serveur doit déjà tourner. Les identifiants servent à créer/piloter la session.
 */
import { io } from 'socket.io-client';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : def;
}

const BASE = arg('base', 'http://localhost:4000');
const N = Number(arg('n', 40));
const USER = arg('user', 'prof');
const PASS = arg('pass', 'motdepasse1');

let cookie = '';
async function jfetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function main() {
  console.log(`Test de charge simulé — ${N} participants vers ${BASE}`);

  const status = await jfetch('/api/auth/setup-status');
  if (status.body.setupNeeded) await jfetch('/api/auth/setup', { method: 'POST', body: { username: USER, password: PASS } });
  const login = await jfetch('/api/auth/login', { method: 'POST', body: { username: USER, password: PASS } });
  if (login.status !== 200) throw new Error('login échoué');

  const session = (await jfetch('/api/sessions', { method: 'POST', body: { title: `Charge ${Date.now()}`, quickStart: true } })).body.session;
  const quiz = (await jfetch('/api/activities', {
    method: 'POST',
    body: {
      type: 'quiz', title: 'Charge', format: 'single', question: 'Réponse ?',
      choices: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }],
      correctIndexes: [1], timerSec: 120,
      scoreRules: { basePoints: 100, speedBonusMax: 50, partialCredit: 'none', wrongPenalty: 0 },
    },
  })).body.activity;
  const sac = (await jfetch(`/api/sessions/${session.id}/activities`, { method: 'POST', body: { libraryId: quiz.id } })).body.activity;

  // Host socket pour démarrer l'activité.
  const host = io(BASE, { transports: ['websocket'], extraHeaders: { Cookie: cookie }, forceNew: true });
  await new Promise((r) => host.on('connect', r));
  await new Promise((r) => host.emit('host:hello', { sessionId: session.id }, r));

  const joinLatencies = [];
  const submitLatencies = [];
  let accepted = 0, joinFail = 0;

  // Connexions participant en parallèle.
  const participants = await Promise.all(
    Array.from({ length: N }, async (_v, i) => {
      const t0 = Date.now();
      const j = await jfetch('/api/join', { method: 'POST', body: { code: session.code, pseudonym: `P${i}` } });
      joinLatencies.push(Date.now() - t0);
      if (j.status !== 200) { joinFail++; return null; }
      const sock = io(BASE, { transports: ['websocket'], forceNew: true });
      await new Promise((r) => sock.on('connect', r));
      await new Promise((r) => sock.emit('participant:hello', { code: session.code, reconnectToken: j.body.reconnectToken }, r));
      return { sock, token: j.body.reconnectToken };
    }),
  );

  // Démarrage de l'activité.
  await new Promise((r) => host.emit('host:activity:start', { activityId: sac.id }, r));

  // Chaque participant répond.
  await Promise.all(
    participants.filter(Boolean).map(({ sock }, i) =>
      new Promise((resolve) => {
        const t0 = Date.now();
        sock.emit(
          'participant:quiz:submit',
          { activityId: sac.id, selectedIndexes: [i % 4], clientSubmissionId: `c-${i}-${Date.now()}` },
          (ack) => {
            submitLatencies.push(Date.now() - t0);
            if (ack.ok) accepted++;
            resolve();
          },
        );
      }),
    ),
  );

  // Clôture + résultats serveur.
  await new Promise((r) => host.emit('host:activity:close', { activityId: sac.id }, r));
  const ranking = (await jfetch(`/api/sessions/${session.id}/ranking`)).body;

  console.log('\n──────── Résultats du test de charge (simulé) ────────');
  console.log(`Participants ciblés        : ${N}`);
  console.log(`Entrées échouées           : ${joinFail}`);
  console.log(`Soumissions acceptées      : ${accepted}`);
  console.log(`Latence entrée   p50/p95   : ${pct(joinLatencies, 50)} / ${pct(joinLatencies, 95)} ms`);
  console.log(`Latence soumission p50/p95 : ${pct(submitLatencies, 50)} / ${pct(submitLatencies, 95)} ms`);
  console.log(`Classement (entrées)       : ${ranking.individual.length}`);
  console.log('──────────────────────────────────────────────────────');
  console.log('NOTE : simulation sur une seule machine, PAS un essai LAN multi-appareils réel.');

  participants.forEach((p) => p?.sock.disconnect());
  host.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Échec du test de charge :', err.message);
  process.exit(1);
});
