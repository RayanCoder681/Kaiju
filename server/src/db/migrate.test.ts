import { describe, it, expect, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';

describe('migrations — schéma initial', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  afterAll(() => db.close());

  it('applique 001_init sans erreur et crée les tables clés', () => {
    const report = runMigrations(db);
    expect(report.applied).toContain('001_init.sql');

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    for (const expected of [
      'organizer',
      'session',
      'participant',
      'team',
      'activity_library',
      'session_activity',
      'answer',
      'qa_question',
      'qa_vote',
      'open_answer',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('est idempotent (second passage : tout est ignoré)', () => {
    const report = runMigrations(db);
    expect(report.applied).toHaveLength(0);
    expect(report.skipped).toContain('001_init.sql');
  });

  it('empêche une seconde réponse du même participant (contrainte unique)', () => {
    const now = Date.now();
    db.prepare(
      "INSERT INTO session (id,code,title,state,created_at) VALUES ('s1','ABCD','T','active',?)",
    ).run(now);
    db.prepare(
      'INSERT INTO participant (id,session_id,pseudonym,reconnect_token,join_order,created_at,last_seen_at) ' +
        "VALUES ('p1','s1','Alice','tok1',1,?,?)",
    ).run(now, now);
    db.prepare(
      "INSERT INTO session_activity (id,session_id,type,position,snapshot_json,state,created_at) " +
        "VALUES ('a1','s1','quiz',0,'{}','running',?)",
    ).run(now);
    db.prepare(
      'INSERT INTO answer (id,session_activity_id,participant_id,client_submission_id,payload_json,created_at) ' +
        "VALUES ('ans1','a1','p1','c1','{}',?)",
    ).run(now);

    expect(() =>
      db
        .prepare(
          'INSERT INTO answer (id,session_activity_id,participant_id,client_submission_id,payload_json,created_at) ' +
            "VALUES ('ans2','a1','p1','c2','{}',?)",
        )
        .run(now),
    ).toThrow();
  });
});
