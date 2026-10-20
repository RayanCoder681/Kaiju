import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { makeRepositories, type Repositories } from '../db/repositories.js';
import { createSession } from '../modules/sessions/service.js';
import { attachActivity } from '../modules/activities/service.js';
import {
  startActivity,
  tickActivity,
  closeActivity,
  submitQuizAnswer,
  computeResults,
  computeRanking,
  computeTeamRanking,
} from './engine.js';

let repos: Repositories;

beforeEach(() => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  repos = makeRepositories(db);
});

const quizDraft = () => ({
  type: 'quiz' as const,
  title: 'Q',
  format: 'single' as const,
  question: 'Pire cas ?',
  choices: [{ text: 'O(1)' }, { text: 'O(log n)' }, { text: 'O(n)' }],
  correctIndexes: [1],
  explanation: 'Borne amortie.',
  timerSec: 30,
  scoreRules: { basePoints: 100, speedBonusMax: 50, partialCredit: 'none' as const, wrongPenalty: 0 },
});

function setup() {
  const s = createSession(repos, { title: 'S', contentLocale: 'fr', anonymous: false, quickStart: true });
  const sac = attachActivity(repos, s.id, { draft: quizDraft() });
  const p1 = { id: 'p1', pseudonym: 'Alice', order: 1 };
  const p2 = { id: 'p2', pseudonym: 'Bob', order: 2 };
  for (const p of [p1, p2]) {
    repos.participant.create({
      id: p.id,
      session_id: s.id,
      pseudonym: p.pseudonym,
      avatar: null,
      reconnect_token: `t_${p.id}`,
      team_id: null,
      join_order: p.order,
      connected: 1,
      created_at: 0,
      last_seen_at: 0,
    });
  }
  return { sessionId: s.id, sacId: sac.id };
}

describe('Horloge & cycle d’activité', () => {
  it('démarre en running avec une deadline serveur', () => {
    const { sacId } = setup();
    const sac = startActivity(repos, sacId, 0, 1_000);
    expect(sac.state).toBe('running');
    expect(sac.deadline_at).toBe(1_000 + 30_000);
  });

  it('countdown bascule en running via l’horloge', () => {
    const { sacId } = setup();
    startActivity(repos, sacId, 5, 1_000);
    expect(repos.sessionActivity.findById(sacId)!.state).toBe('countdown');
    const t = tickActivity(repos, sacId, 6_500); // après 5s de décompte
    expect(t.changed).toBe(true);
    expect(t.sac.state).toBe('running');
  });

  it('l’horloge clôture à l’échéance', () => {
    const { sacId } = setup();
    startActivity(repos, sacId, 0, 1_000);
    expect(tickActivity(repos, sacId, 10_000).changed).toBe(false); // avant deadline
    const t = tickActivity(repos, sacId, 31_001);
    expect(t.sac.state).toBe('closed');
  });
});

describe('Soumission quiz — règles critiques', () => {
  it('accepte pendant running et calcule le score (avec bonus de rapidité)', () => {
    const { sacId } = setup();
    startActivity(repos, sacId, 0, 0); // deadline = 30000
    const r = submitQuizAnswer(
      repos,
      { sessionActivityId: sacId, participantId: 'p1', selectedIndexes: [1], clientSubmissionId: 'c1' },
      15_000,
    );
    expect(r.accepted).toBe(true);
    if (r.accepted) expect(r.score).toBe(125); // 100 + 50*0.5
  });

  it('refuse avant running', () => {
    const { sacId } = setup();
    const r = submitQuizAnswer(
      repos,
      { sessionActivityId: sacId, participantId: 'p1', selectedIndexes: [1], clientSubmissionId: 'c1' },
      0,
    );
    expect(r).toEqual({ accepted: false, errorKey: 'error.activityNotRunning' });
  });

  it('refuse une réponse tardive (après deadline), même tardivement', () => {
    const { sacId } = setup();
    startActivity(repos, sacId, 0, 0);
    const r = submitQuizAnswer(
      repos,
      { sessionActivityId: sacId, participantId: 'p1', selectedIndexes: [1], clientSubmissionId: 'c1' },
      30_001,
    );
    expect(r).toEqual({ accepted: false, errorKey: 'error.deadlinePassed' });
  });

  it('idempotence : même clientSubmissionId => doublon accepté, autre => refusé', () => {
    const { sacId } = setup();
    startActivity(repos, sacId, 0, 0);
    const first = submitQuizAnswer(
      repos,
      { sessionActivityId: sacId, participantId: 'p1', selectedIndexes: [1], clientSubmissionId: 'c1' },
      1_000,
    );
    expect(first.accepted).toBe(true);
    const sameId = submitQuizAnswer(
      repos,
      { sessionActivityId: sacId, participantId: 'p1', selectedIndexes: [0], clientSubmissionId: 'c1' },
      2_000,
    );
    expect(sameId).toEqual({ accepted: true, duplicate: true });
    const otherId = submitQuizAnswer(
      repos,
      { sessionActivityId: sacId, participantId: 'p1', selectedIndexes: [0], clientSubmissionId: 'c2' },
      3_000,
    );
    expect(otherId).toEqual({ accepted: false, errorKey: 'error.duplicate' });
  });
});

describe('Résultats & visibilité', () => {
  it('agrège les choix ; ne révèle la bonne réponse que si demandé', () => {
    const { sacId } = setup();
    startActivity(repos, sacId, 0, 0);
    submitQuizAnswer(repos, { sessionActivityId: sacId, participantId: 'p1', selectedIndexes: [1], clientSubmissionId: 'c1' }, 1000);
    submitQuizAnswer(repos, { sessionActivityId: sacId, participantId: 'p2', selectedIndexes: [0], clientSubmissionId: 'c2' }, 1000);

    const hidden = computeResults(repos, sacId, false);
    expect(hidden.totalResponses).toBe(2);
    expect(hidden.choiceCounts).toEqual([1, 1, 0]);
    expect(hidden.correctIndexes).toBeUndefined();

    const revealed = computeResults(repos, sacId, true);
    expect(revealed.correctIndexes).toEqual([1]);
    expect(revealed.explanation).toBe('Borne amortie.');
  });
});

describe('Classement', () => {
  it('ordonne par score puis temps de réponse', () => {
    const { sacId } = setup();
    startActivity(repos, sacId, 0, 0);
    // p1 bonne réponse rapide, p2 mauvaise
    submitQuizAnswer(repos, { sessionActivityId: sacId, participantId: 'p1', selectedIndexes: [1], clientSubmissionId: 'c1' }, 1000);
    submitQuizAnswer(repos, { sessionActivityId: sacId, participantId: 'p2', selectedIndexes: [0], clientSubmissionId: 'c2' }, 1000);
    closeActivity(repos, sacId, 31_000);

    const sessionId = repos.sessionActivity.findById(sacId)!.session_id;
    const ranking = computeRanking(repos, sessionId);
    expect(ranking[0]!.pseudonym).toBe('Alice');
    expect(ranking[0]!.totalScore).toBeGreaterThan(ranking[1]!.totalScore);
  });

  it('classement par équipe ; changer d’équipe ne supprime pas les scores', () => {
    const { sacId } = setup();
    const sessionId = repos.sessionActivity.findById(sacId)!.session_id;
    startActivity(repos, sacId, 0, 0);
    submitQuizAnswer(repos, { sessionActivityId: sacId, participantId: 'p1', selectedIndexes: [1], clientSubmissionId: 'c1' }, 1000);
    submitQuizAnswer(repos, { sessionActivityId: sacId, participantId: 'p2', selectedIndexes: [0], clientSubmissionId: 'c2' }, 1000);

    repos.team.create('A', sessionId, 'Aile Gauche', 0);
    repos.team.create('B', sessionId, 'Aile Droite', 0);
    repos.participant.assignTeam('p1', 'A');
    repos.participant.assignTeam('p2', 'B');

    let teams = computeTeamRanking(repos, sessionId);
    expect(teams[0]!.name).toBe('Aile Gauche');
    expect(teams[0]!.totalScore).toBeGreaterThan(teams[1]!.totalScore);

    // p1 change d'équipe : son score suit, aucune donnée perdue.
    repos.participant.assignTeam('p1', 'B');
    teams = computeTeamRanking(repos, sessionId);
    expect(teams.find((t) => t.teamId === 'B')!.totalScore).toBeGreaterThan(0);
  });
});
