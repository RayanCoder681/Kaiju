// Outils partagés par les tests. Placé hors de test/ pour que « node --test » ne le compte pas comme un fichier de test.
import WebSocket from 'ws';

/** Horloge simulée : le temps n'avance que sur advance() (minuteurs déclenchés) ou skew() (sans déclencher). */
export function fakeClock(start = 1_000_000) {
  let t = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    advance(ms) {
      t += ms;
      for (const [id, tm] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (tm.at <= t && timers.has(id)) {
          timers.delete(id);
          tm.fn();
        }
      }
    },
    /** Fait avancer le temps sans exécuter les minuteurs (simule une boucle d'événements en retard). */
    skew(ms) {
      t += ms;
    },
    pending: () => timers.size,
    timers,
  };
}

/** Enregistre tous les messages envoyés par une partie, par destinataire. */
export function recorder() {
  const log = [];
  const send = (target, msg) => log.push({ target, msg });
  const to = (target, type) => log.filter((e) => e.target === target && (!type || e.msg.type === type)).map((e) => e.msg);
  const ofType = (type) => log.filter((e) => e.msg.type === type);
  return { log, send, to, ofType, clear: () => (log.length = 0) };
}

export const QUIZ_2 = `Quelle est la capitale du Cameroun ?
Douala
*Yaoundé
Bafoussam

Combien font 2 + 2 ? [10s]
3
*4
5
22`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Client WebSocket de test avec boîte de réception et attente par type. */
export function makeClient(url, options) {
  const ws = new WebSocket(url, options);
  const inbox = [];
  const waiters = [];
  let closeInfo = null;
  const closed = new Promise((resolve) => {
    ws.on('close', (code, reason) => {
      closeInfo = { code, reason: String(reason) };
      resolve(closeInfo);
    });
  });
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  const matcher = (type, pred) => (m) => m.type === type && (!pred || pred(m));
  return {
    ws,
    inbox,
    closed,
    get closeInfo() {
      return closeInfo;
    },
    send: (msg) => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)),
    /** Attend le prochain message de ce type (et vérifiant pred si fourni). */
    next(type, pred, ms = 2000) {
      const match = matcher(type, pred);
      const i = inbox.findIndex(match);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { match, resolve };
        waiters.push(w);
        setTimeout(() => {
          const k = waiters.indexOf(w);
          if (k >= 0) {
            waiters.splice(k, 1);
            reject(new Error(`timeout en attendant ${type}`));
          }
        }, ms).unref();
      });
    },
    /** Attend une erreur avec ce code. */
    error(code, ms) {
      return this.next('error', (m) => m.code === code, ms);
    },
    /** Messages déjà reçus d'un type (sans les consommer). */
    received: (type) => inbox.filter((m) => m.type === type),
    drain: () => inbox.splice(0, inbox.length),
    open: () =>
      new Promise((resolve, reject) => {
        if (ws.readyState === 1) return resolve();
        ws.once('open', resolve);
        ws.once('error', reject);
      }),
    close: () => ws.close(),
  };
}
