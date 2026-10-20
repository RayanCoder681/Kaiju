import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import { makeRepositories, type Repositories } from '../../db/repositories.js';
import { createSession } from '../sessions/service.js';
import { attachActivity } from '../activities/service.js';
import { recoverStaleActivities } from './service.js';

const quizDraft = {
  type: 'quiz' as const,
  title: 'Q',
  format: 'single' as const,
  question: '?',
  choices: [{ text: 'a' }, { text: 'b' }],
  correctIndexes: [0],
  timerSec: 30,
  scoreRules: { basePoints: 100, speedBonusMax: 0, partialCredit: 'none' as const, wrongPenalty: 0 },
};

describe('Reprise après incident', () => {
  let repos: Repositories;
  beforeEach(() => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repos = makeRepositories(db);
  });

  it('clôture une activité dont le minuteur a expiré, garde celle encore valide', () => {
    const s = createSession(repos, { title: 'S', contentLocale: 'fr', anonymous: false, quickStart: true });
    const expired = attachActivity(repos, s.id, { draft: quizDraft });
    const valid = attachActivity(repos, s.id, { draft: quizDraft });

    const now = 100_000;
    repos.sessionActivity.updateState(expired.id, 'running', { started_at: 0, deadline_at: 50_000 });
    repos.sessionActivity.updateState(valid.id, 'running', { started_at: 0, deadline_at: 200_000 });

    const result = recoverStaleActivities(repos, now);
    expect(result.closed).toContain(expired.id);
    expect(result.kept).toContain(valid.id);
    expect(repos.sessionActivity.findById(expired.id)!.state).toBe('closed');
    expect(repos.sessionActivity.findById(valid.id)!.state).toBe('running');
  });
});
