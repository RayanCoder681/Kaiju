import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Express } from 'express';

let app: Express;
let agent: ReturnType<typeof request.agent>;
let dir: string;
let closeDb: () => void;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kaiju-e2e-'));
  process.env.DATABASE_PATH = join(dir, 'test.sqlite');
  process.env.SESSION_SECRET = 'test-secret-value-with-enough-length';
  process.env.NODE_ENV = 'test';

  const conn = await import('./db/connection.js');
  closeDb = conn.closeDb;
  const { runMigrations } = await import('./db/migrate.js');
  runMigrations();
  const { createApp } = await import('./app.js');
  app = createApp();
  agent = request.agent(app);
});

afterAll(() => {
  closeDb?.();
  rmSync(dir, { recursive: true, force: true });
});

describe('Parcours complet Phase 2 (HTTP)', () => {
  let sessionId = '';
  let code = '';
  let reconnectToken = '';

  it('1. setup requis puis création du compte organisateur', async () => {
    const status = await agent.get('/api/auth/setup-status');
    expect(status.body.setupNeeded).toBe(true);

    const setup = await agent
      .post('/api/auth/setup')
      .send({ username: 'prof', password: 'motdepasse1' });
    expect(setup.status).toBe(201);
  });

  it('2. une action admin sans session est refusée (401)', async () => {
    const res = await request(app).post('/api/sessions').send({ title: 'X' });
    expect(res.status).toBe(401);
  });

  it('3. login pose un cookie et autorise la création de session', async () => {
    const login = await agent.post('/api/auth/login').send({ username: 'prof', password: 'motdepasse1' });
    expect(login.status).toBe(200);
    expect(login.headers['set-cookie']).toBeDefined();

    const create = await agent
      .post('/api/sessions')
      .send({ title: 'TD Systèmes Distribués', quickStart: true });
    expect(create.status).toBe(201);
    expect(create.body.session.state).toBe('active');
    sessionId = create.body.session.id;
    code = create.body.session.code;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('4. infos de connexion : code présent, URL jamais en localhost', async () => {
    const res = await agent.get(`/api/sessions/${sessionId}/connection`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(code);
    if (res.body.joinUrl) {
      expect(res.body.joinUrl).not.toContain('localhost');
      expect(res.body.joinUrl).not.toContain('127.0.0.1');
    }
  });

  it('5. un participant rejoint publiquement (sans auth)', async () => {
    const res = await request(app).post('/api/join').send({ code, pseudonym: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.reconnected).toBe(false);
    reconnectToken = res.body.reconnectToken;
    expect(reconnectToken).toBeTruthy();
  });

  it('6. reconnexion sans doublon', async () => {
    const res = await request(app)
      .post('/api/join')
      .send({ code, pseudonym: 'Alice', reconnectToken });
    expect(res.body.reconnected).toBe(true);

    const list = await agent.get(`/api/sessions/${sessionId}/participants`);
    expect(list.body.count).toBe(1);
  });

  it('7. création et attachement d’une activité quiz (snapshot)', async () => {
    const quiz = {
      type: 'quiz',
      title: 'Complexité',
      format: 'single',
      question: 'Pire cas ?',
      choices: [{ text: 'O(1)' }, { text: 'O(log n)' }],
      correctIndexes: [1],
      timerSec: 30,
      scoreRules: { basePoints: 100, speedBonusMax: 0, partialCredit: 'none', wrongPenalty: 0 },
    };
    const lib = await agent.post('/api/activities').send(quiz);
    expect(lib.status).toBe(201);

    const attach = await agent
      .post(`/api/sessions/${sessionId}/activities`)
      .send({ libraryId: lib.body.activity.id });
    expect(attach.status).toBe(201);
    expect(attach.body.activity.state).toBe('prepared');

    const list = await agent.get(`/api/sessions/${sessionId}/activities`);
    expect(list.body.activities).toHaveLength(1);
  });

  it('8. logout invalide la session', async () => {
    await agent.post('/api/auth/logout');
    const res = await agent.get('/api/sessions');
    expect(res.status).toBe(401);
  });
});
