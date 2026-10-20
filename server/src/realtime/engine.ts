import type { Repositories, SessionActivityRow } from '../db/repositories.js';
import {
  activityAcceptsAnswers,
  canTransitionActivity,
  computeQuizScore,
  rankEntries,
  type ActivityDraft,
  type AggregateResults,
} from '@kaiju/shared';
import { newId } from '../lib/ids.js';
import { AppError, Errors } from '../lib/errors.js';

/**
 * Moteur temps réel — logique métier à AUTORITÉ SERVEUR.
 * Pur et testable : aucune dépendance Socket.IO ici. Le serveur décide seul
 * du début/fin des activités, de l'acceptation des réponses, des scores et de la visibilité.
 */

function parseSnapshot(sac: SessionActivityRow): ActivityDraft {
  return JSON.parse(sac.snapshot_json) as ActivityDraft;
}

function getSacOrThrow(repos: Repositories, id: string): SessionActivityRow {
  const sac = repos.sessionActivity.findById(id);
  if (!sac) throw Errors.notFound();
  return sac;
}

/** Durée du minuteur (ms) d'une activité, ou null si sans minuteur (Q&A). */
function timerMs(draft: ActivityDraft): number | null {
  if ('timerSec' in draft && typeof draft.timerSec === 'number') return draft.timerSec * 1000;
  return null;
}

/**
 * Démarre une activité. Le serveur fixe l'heure officielle et la deadline.
 * countdownSec > 0 : passe d'abord en « countdown » ; l'horloge bascule ensuite en « running ».
 */
export function startActivity(
  repos: Repositories,
  sacId: string,
  countdownSec = 0,
  now: number = Date.now(),
): SessionActivityRow {
  const sac = getSacOrThrow(repos, sacId);
  const draft = parseSnapshot(sac);

  if (countdownSec > 0) {
    if (!canTransitionActivity(sac.state, 'countdown')) throw new AppError(409, 'error.validation');
    repos.sessionActivity.updateState(sacId, 'countdown', {
      deadline_at: now + countdownSec * 1000,
    });
  } else {
    if (!canTransitionActivity(sac.state, 'running')) throw new AppError(409, 'error.validation');
    const tms = timerMs(draft);
    repos.sessionActivity.updateState(sacId, 'running', {
      started_at: now,
      deadline_at: tms ? now + tms : null,
    });
  }
  return getSacOrThrow(repos, sacId);
}

export function pauseActivity(repos: Repositories, sacId: string): SessionActivityRow {
  const sac = getSacOrThrow(repos, sacId);
  if (!canTransitionActivity(sac.state, 'paused')) throw new AppError(409, 'error.validation');
  repos.sessionActivity.updateState(sacId, 'paused');
  return getSacOrThrow(repos, sacId);
}

export function resumeActivity(
  repos: Repositories,
  sacId: string,
  now: number = Date.now(),
): SessionActivityRow {
  const sac = getSacOrThrow(repos, sacId);
  if (!canTransitionActivity(sac.state, 'running')) throw new AppError(409, 'error.validation');
  repos.sessionActivity.updateState(sacId, 'running', {
    started_at: sac.started_at ?? now,
  });
  return getSacOrThrow(repos, sacId);
}

export function closeActivity(
  repos: Repositories,
  sacId: string,
  now: number = Date.now(),
): SessionActivityRow {
  const sac = getSacOrThrow(repos, sacId);
  if (!canTransitionActivity(sac.state, 'closed')) throw new AppError(409, 'error.validation');
  repos.sessionActivity.updateState(sacId, 'closed', { closed_at: now });
  return getSacOrThrow(repos, sacId);
}

export interface ClockResult {
  changed: boolean;
  sac: SessionActivityRow;
}

/**
 * Fait avancer l'horloge d'une activité : countdown→running et running→closed
 * quand la deadline officielle est atteinte. Idempotent.
 */
export function tickActivity(
  repos: Repositories,
  sacId: string,
  now: number = Date.now(),
): ClockResult {
  const sac = getSacOrThrow(repos, sacId);
  if (sac.state === 'countdown' && sac.deadline_at && now >= sac.deadline_at) {
    const draft = parseSnapshot(sac);
    const tms = timerMs(draft);
    repos.sessionActivity.updateState(sacId, 'running', {
      started_at: now,
      deadline_at: tms ? now + tms : null,
    });
    return { changed: true, sac: getSacOrThrow(repos, sacId) };
  }
  if (sac.state === 'running' && sac.deadline_at && now >= sac.deadline_at) {
    repos.sessionActivity.updateState(sacId, 'closed', { closed_at: now });
    return { changed: true, sac: getSacOrThrow(repos, sacId) };
  }
  return { changed: false, sac };
}

export type SubmitResult =
  | { accepted: true; duplicate: boolean; score?: number }
  | { accepted: false; errorKey: string };

/**
 * Soumission d'une réponse de quiz.
 * RÈGLES : n'accepte que pendant « running », refuse après la deadline (même après
 * reconnexion), idempotente (une seule réponse par participant), persistée AVANT l'accusé.
 */
export function submitQuizAnswer(
  repos: Repositories,
  input: {
    sessionActivityId: string;
    participantId: string;
    selectedIndexes: number[];
    clientSubmissionId: string;
  },
  now: number = Date.now(),
): SubmitResult {
  const sac = repos.sessionActivity.findById(input.sessionActivityId);
  if (!sac) return { accepted: false, errorKey: 'error.codeInvalid' };
  const draft = parseSnapshot(sac);
  if (draft.type !== 'quiz') return { accepted: false, errorKey: 'error.validation' };

  if (!activityAcceptsAnswers(sac.state)) {
    return { accepted: false, errorKey: 'error.activityNotRunning' };
  }
  // Refus des réponses tardives — autorité serveur, insensible à la reconnexion.
  if (sac.deadline_at && now > sac.deadline_at) {
    return { accepted: false, errorKey: 'error.deadlinePassed' };
  }

  // Idempotence : réponse déjà enregistrée pour ce participant.
  const existing = repos.answer.findByParticipant(input.sessionActivityId, input.participantId);
  if (existing) {
    const dup = existing.client_submission_id === input.clientSubmissionId;
    return dup
      ? { accepted: true, duplicate: true }
      : { accepted: false, errorKey: 'error.duplicate' };
  }

  const totalTimeMs = timerMs(draft) ?? 0;
  const timeRemainingMs = sac.deadline_at ? Math.max(0, sac.deadline_at - now) : 0;
  const answerTimeMs = sac.started_at ? now - sac.started_at : 0;

  const breakdown = computeQuizScore(
    {
      correctChoiceIndexes: draft.correctIndexes,
      selectedChoiceIndexes: input.selectedIndexes,
      totalTimeMs,
      timeRemainingMs,
      totalChoices: draft.choices.length,
    },
    draft.scoreRules,
  );

  // Écriture durable AVANT l'accusé. Contrainte unique = anti-doublon.
  try {
    repos.answer.insert({
      id: newId('ans'),
      session_activity_id: input.sessionActivityId,
      participant_id: input.participantId,
      client_submission_id: input.clientSubmissionId,
      payload_json: JSON.stringify({ selectedIndexes: input.selectedIndexes }),
      score: breakdown.total,
      answer_time_ms: answerTimeMs,
      created_at: now,
    });
  } catch {
    // Collision sur l'index unique (course réseau) : traiter comme doublon accepté.
    return { accepted: true, duplicate: true };
  }

  return { accepted: true, duplicate: false, score: breakdown.total };
}

/** Soumission de sondage (non noté par défaut). Mêmes règles de fenêtre que le quiz. */
export function submitPollAnswer(
  repos: Repositories,
  input: {
    sessionActivityId: string;
    participantId: string;
    selectedIndexes?: number[];
    text?: string;
    scale?: number;
    clientSubmissionId: string;
  },
  now: number = Date.now(),
): SubmitResult {
  const sac = repos.sessionActivity.findById(input.sessionActivityId);
  if (!sac) return { accepted: false, errorKey: 'error.codeInvalid' };
  const draft = parseSnapshot(sac);
  if (draft.type !== 'poll') return { accepted: false, errorKey: 'error.validation' };
  if (!activityAcceptsAnswers(sac.state)) {
    return { accepted: false, errorKey: 'error.activityNotRunning' };
  }
  if (sac.deadline_at && now > sac.deadline_at) {
    return { accepted: false, errorKey: 'error.deadlinePassed' };
  }

  const existing = repos.answer.findByParticipant(input.sessionActivityId, input.participantId);
  if (existing) {
    return existing.client_submission_id === input.clientSubmissionId
      ? { accepted: true, duplicate: true }
      : { accepted: false, errorKey: 'error.duplicate' };
  }

  try {
    repos.answer.insert({
      id: newId('ans'),
      session_activity_id: input.sessionActivityId,
      participant_id: input.participantId,
      client_submission_id: input.clientSubmissionId,
      payload_json: JSON.stringify({
        selectedIndexes: input.selectedIndexes ?? null,
        text: input.text ?? null,
        scale: input.scale ?? null,
      }),
      score: null,
      answer_time_ms: sac.started_at ? now - sac.started_at : 0,
      created_at: now,
    });
  } catch {
    return { accepted: true, duplicate: true };
  }
  return { accepted: true, duplicate: false };
}

/** Agrège les résultats d'une activité (choix / échelle / nuage de mots). */
export function computeResults(
  repos: Repositories,
  sacId: string,
  revealCorrect: boolean,
): AggregateResults {
  const sac = getSacOrThrow(repos, sacId);
  const draft = parseSnapshot(sac);
  const rows = repos.answer.listPayloads(sacId);

  const result: AggregateResults = { activityId: sacId, totalResponses: rows.length };

  if (draft.type === 'quiz' || (draft.type === 'poll' && draft.choices.length > 0)) {
    const n = 'choices' in draft ? draft.choices.length : 0;
    const counts = new Array(n).fill(0);
    const words: Record<string, number> = {};
    const scale: Record<number, number> = {};
    for (const r of rows) {
      const p = JSON.parse(r.payload_json) as {
        selectedIndexes?: number[] | null;
        text?: string | null;
        scale?: number | null;
      };
      for (const idx of p.selectedIndexes ?? []) if (idx < n) counts[idx]++;
      if (p.text) words[p.text] = (words[p.text] ?? 0) + 1;
      if (typeof p.scale === 'number') scale[p.scale] = (scale[p.scale] ?? 0) + 1;
    }
    result.choiceCounts = counts;
    if (Object.keys(words).length) {
      result.words = Object.entries(words).map(([word, count]) => ({ word, count }));
    }
    if (Object.keys(scale).length) result.scaleCounts = scale;
  }

  if (revealCorrect && draft.type === 'quiz') {
    result.correctIndexes = draft.correctIndexes;
    result.explanation = draft.explanation;
  }
  return result;
}

export interface RankingEntry {
  participantId: string;
  pseudonym: string;
  totalScore: number;
}

/** Classement individuel d'une session : somme des scores quiz, départage documenté. */
export function computeRanking(repos: Repositories, sessionId: string): RankingEntry[] {
  const rows = repos.answer.rankingRows(sessionId);
  const participants = repos.participant.listBySession(sessionId);
  const pMap = new Map(participants.map((p) => [p.id, p]));

  const ranked = rankEntries(
    rows.map((r) => ({
      participantId: r.pid,
      totalScore: r.total,
      cumulativeAnswerTimeMs: r.time,
      joinOrder: pMap.get(r.pid)?.join_order ?? 1e9,
    })),
  );

  return ranked.map((e) => ({
    participantId: e.participantId,
    pseudonym: pMap.get(e.participantId)?.pseudonym ?? '—',
    totalScore: e.totalScore,
  }));
}

export interface TeamRankingEntry {
  teamId: string;
  name: string;
  totalScore: number;
}

/** Classement par équipe : somme des scores des membres. */
export function computeTeamRanking(repos: Repositories, sessionId: string): TeamRankingEntry[] {
  const rows = repos.answer.rankingRows(sessionId);
  const scoreByParticipant = new Map(rows.map((r) => [r.pid, r.total]));
  const teams = repos.team.listBySession(sessionId);
  const totals = new Map(teams.map((t) => [t.id, 0]));

  for (const p of repos.participant.listBySession(sessionId)) {
    if (p.team_id && totals.has(p.team_id)) {
      totals.set(p.team_id, (totals.get(p.team_id) ?? 0) + (scoreByParticipant.get(p.id) ?? 0));
    }
  }

  return teams
    .map((t) => ({ teamId: t.id, name: t.name, totalScore: totals.get(t.id) ?? 0 }))
    .sort((a, b) => b.totalScore - a.totalScore);
}
