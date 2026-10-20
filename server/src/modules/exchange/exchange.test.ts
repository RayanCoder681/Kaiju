import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import { makeRepositories, type Repositories } from '../../db/repositories.js';
import { createSession } from '../sessions/service.js';
import { attachActivity, createLibraryActivity } from '../activities/service.js';
import { startActivity, submitQuizAnswer } from '../../realtime/engine.js';
import {
  exportResultsCsv,
  exportActivitiesJson,
  importActivitiesJson,
  buildSessionReport,
} from './service.js';

let repos: Repositories;

const quizDraft = (over: Record<string, unknown> = {}) => ({
  type: 'quiz' as const,
  title: 'Complexité',
  format: 'single' as const,
  question: 'Pire cas ?',
  choices: [{ text: 'O(1)' }, { text: 'O(log n)' }],
  correctIndexes: [1],
  timerSec: 30,
  scoreRules: { basePoints: 100, speedBonusMax: 0, partialCredit: 'none' as const, wrongPenalty: 0 },
  contentLocale: 'fr' as const,
  ...over,
});

function seededSession() {
  const s = createSession(repos, { title: 'TD', contentLocale: 'fr', anonymous: false, quickStart: true });
  const sac = attachActivity(repos, s.id, { draft: quizDraft() });
  for (const [pid, name, order] of [['p1', 'Alice', 1], ['p2', 'Bob', 2]] as const) {
    repos.participant.create({
      id: pid, session_id: s.id, pseudonym: name, avatar: null, reconnect_token: `t_${pid}`,
      team_id: null, join_order: order, connected: 1, created_at: 0, last_seen_at: 0,
    });
  }
  startActivity(repos, sac.id, 0, 0);
  submitQuizAnswer(repos, { sessionActivityId: sac.id, participantId: 'p1', selectedIndexes: [1], clientSubmissionId: 'c1' }, 1000);
  submitQuizAnswer(repos, { sessionActivityId: sac.id, participantId: 'p2', selectedIndexes: [0], clientSubmissionId: 'c2' }, 1000);
  return { sessionId: s.id, sacId: sac.id };
}

beforeEach(() => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  repos = makeRepositories(db);
});

describe('Export CSV des résultats', () => {
  it('produit un en-tête, une ligne par participant et un total', () => {
    const { sessionId } = seededSession();
    const csv = exportResultsCsv(repos, sessionId);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toContain('Pseudonyme');
    expect(lines[0]).toContain('Score total');
    const alice = lines.find((l) => l.startsWith('Alice'));
    expect(alice).toContain('100'); // Alice a la bonne réponse
    expect(lines).toHaveLength(3); // en-tête + 2 participants
  });
});

describe('Export / import JSON des activités', () => {
  it('exporte les définitions de la bibliothèque', () => {
    createLibraryActivity(repos, quizDraft());
    const out = exportActivitiesJson(repos);
    expect(out.schema).toBe('kaiju.activities');
    expect(out.activities).toHaveLength(1);
  });

  it('importe les valides, signale erreurs et doublons, sans exécuter de code', () => {
    createLibraryActivity(repos, quizDraft({ title: 'Déjà là' }));
    const report = importActivitiesJson(repos, {
      schema: 'kaiju.activities',
      version: 1,
      activities: [
        quizDraft({ title: 'Nouvelle' }), // valide
        quizDraft({ title: 'Mauvaise', correctIndexes: [9] }), // index hors choix -> erreur
        quizDraft({ title: 'Déjà là' }), // doublon
      ],
    });
    expect(report.imported.map((i) => i.title)).toContain('Nouvelle');
    expect(report.errors).toHaveLength(1);
    expect(report.duplicates.map((d) => d.title)).toContain('Déjà là');
  });
});

describe('Rapport de session', () => {
  it('résume participation, classement et activités', () => {
    const { sessionId } = seededSession();
    const report = buildSessionReport(repos, sessionId);
    expect(report.participation.total).toBe(2);
    expect(report.ranking[0]!.pseudonym).toBe('Alice');
    expect(report.activities[0]!.totalResponses).toBe(2);
    expect(report.activities[0]!.correctIndexes).toEqual([1]);
  });
});
