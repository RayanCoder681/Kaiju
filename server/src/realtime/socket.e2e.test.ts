import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';

let httpServer: HttpServer;
let port = 0;
let dir: string;
let closeDb: () => void;
let stopClock: () => void;

let sessionId = '';
let code = '';
let activityId = '';
let shortActivityId = '';
let hostCookie = '';
let reconnectToken = '';

const quizDraft = {
  type: 'quiz' as const,
  title: 'Q',
  format: 'single' as const,
  question: 'Pire cas ?',
  choices: [{ text: 'O(1)' }, { text: 'O(log n)' }],
  correctIndexes: [1],
  timerSec: 30,
  scoreRules: { basePoints: 100, speedBonusMax: 0, partialCredit: 'none' as const, wrongPenalty: 0 },
  contentLocale: 'fr' as const,
};

/** Attend un événement socket (avec timeout). */
function waitFor<T = unknown>(socket: Socket, event: string, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitAck<T = { ok: boolean }>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kaiju-socket-'));
  process.env.DATABASE_PATH = join(dir, 'test.sqlite');
  process.env.SESSION_SECRET = 'test-secret-value-with-enough-length';
  process.env.NODE_ENV = 'test';

  const conn = await import('../db/connection.js');
  closeDb = conn.closeDb;
  const { runMigrations } = await import('../db/migrate.js');
  runMigrations();
  const { getRepositories } = await import('../context.js');
  const repos = getRepositories();

  const { setupOrganizer, login } = await import('../modules/auth/service.js');
  await setupOrganizer(repos, { username: 'prof', password: 'motdepasse1' });
  const auth = await login(repos, { username: 'prof', password: 'motdepasse1' });
  hostCookie = `kaiju_sid=${auth.token}`;

  const { createSession } = await import('../modules/sessions/service.js');
  const session = createSession(repos, {
    title: 'Live',
    contentLocale: 'fr',
    anonymous: false,
    quickStart: true,
  });
  sessionId = session.id;
  code = session.code;

  const { attachActivity } = await import('../modules/activities/service.js');
  activityId = attachActivity(repos, sessionId, { draft: quizDraft }).id;
  shortActivityId = attachActivity(repos, sessionId, { draft: { ...quizDraft, timerSec: 5 } }).id;

  const { joinSession } = await import('../modules/participants/service.js');
  reconnectToken = joinSession(repos, { code, pseudonym: 'Alice' }).reconnectToken;

  const { createApp } = await import('../app.js');
  const { attachSocket, stopClock: sc } = await import('./socket.js');
  stopClock = sc;
  httpServer = createServer(createApp());
  attachSocket(httpServer);
  await new Promise<void>((r) => httpServer.listen(0, r));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  stopClock?.();
  await new Promise<void>((r) => httpServer.close(() => r()));
  closeDb?.();
  rmSync(dir, { recursive: true, force: true });
});

function connect(extraHeaders?: Record<string, string>): Socket {
  return ioClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    extraHeaders,
    forceNew: true,
  });
}

describe('Temps réel — parcours live', () => {
  it('synchronise une activité du host vers le participant et traite les soumissions', async () => {
    const host = connect({ Cookie: hostCookie });
    const participant = connect();

    const hostHello = await emitAck(host, 'host:hello', { sessionId });
    expect(hostHello.ok).toBe(true);

    const partHello = await emitAck<{ ok: boolean }>(participant, 'participant:hello', {
      code,
      reconnectToken,
    });
    expect(partHello.ok).toBe(true);

    // Le participant reçoit l'activité quand le host la démarre.
    const changed = waitFor<{ activity: { id: string; state: string } }>(participant, 'activity:changed');
    const startAck = await emitAck(host, 'host:activity:start', { activityId });
    expect(startAck.ok).toBe(true);
    const evt = await changed;
    expect(evt.activity.id).toBe(activityId);
    expect(evt.activity.state).toBe('running');

    // Soumission acceptée.
    const sub = await emitAck<{ ok: boolean }>(participant, 'participant:quiz:submit', {
      activityId,
      selectedIndexes: [1],
      clientSubmissionId: 'c1',
    });
    expect(sub.ok).toBe(true);

    // Doublon idempotent (même clé) : accepté.
    const dup = await emitAck<{ ok: boolean }>(participant, 'participant:quiz:submit', {
      activityId,
      selectedIndexes: [0],
      clientSubmissionId: 'c1',
    });
    expect(dup.ok).toBe(true);

    // Le host voit les résultats agrégés après clôture.
    const resultsP = waitFor<{ totalResponses: number; correctIndexes?: number[] }>(host, 'results:update');
    await emitAck(host, 'host:activity:close', { activityId });
    const results = await resultsP;
    expect(results.totalResponses).toBe(1);
    expect(results.correctIndexes).toEqual([1]);

    host.disconnect();
    participant.disconnect();
  });

  it("l'horloge serveur clôture l'activité à l'échéance du minuteur", async () => {
    const host = connect({ Cookie: hostCookie });
    const projection = connect();
    await emitAck(host, 'host:hello', { sessionId });
    await emitAck(projection, 'projection:hello', { code });

    // Minuteur de 5s : on attend une bascule vers « closed » diffusée par l'horloge.
    const closedP = new Promise<{ activity: { state: string } | null }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout clock')), 9000);
      projection.on('activity:changed', (p: { activity: { state: string } | null }) => {
        if (p.activity?.state === 'closed') {
          clearTimeout(timer);
          resolve(p);
        }
      });
    });
    await emitAck(host, 'host:activity:start', { activityId: shortActivityId });
    const closed = await closedP;
    expect(closed.activity?.state).toBe('closed');

    host.disconnect();
    projection.disconnect();
  }, 12000);

  it('refuse une soumission sur une activité clôturée (réponse tardive)', async () => {
    const participant = connect();
    await emitAck(participant, 'participant:hello', { code, reconnectToken });
    const late = await emitAck<{ ok: boolean; errorKey?: string }>(participant, 'participant:quiz:submit', {
      activityId,
      selectedIndexes: [1],
      clientSubmissionId: 'c-late',
    });
    expect(late.ok).toBe(false);
    participant.disconnect();
  });
});
