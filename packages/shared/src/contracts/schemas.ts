import { z } from 'zod';
import {
  QUIZ_FORMATS,
  POLL_FORMATS,
  RESULT_VISIBILITY,
  PRESENTATION_MODE,
  LOCALES,
} from '../domain/types.js';

/** Limites sûres par défaut (configurables côté serveur). Centralisées ici. */
export const LIMITS = {
  pseudonymMin: 1,
  pseudonymMax: 40,
  sessionTitleMax: 140,
  sessionDescriptionMax: 2000,
  choicesPerQuestionMax: 10,
  questionTextMax: 1000,
  choiceTextMax: 300,
  openAnswerMax: 2000,
  qaQuestionMax: 500,
  timerMinSec: 5,
  timerMaxSec: 600,
} as const;

/** Identifiant générique (nanoid/uuid côté serveur). */
export const zId = z.string().min(1).max(64);

/** Code de session : court, alphanumérique majuscules + chiffres, sans ambiguïté visuelle. */
export const zSessionCode = z
  .string()
  .regex(/^[A-Z0-9]{4,10}$/, 'Code de session invalide');

/* ───────────── Authentification organisateur ───────────── */

export const zLoginRequest = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof zLoginRequest>;

/* ───────────── Entrée participant ───────────── */

export const zJoinRequest = z.object({
  code: zSessionCode,
  pseudonym: z.string().trim().min(LIMITS.pseudonymMin).max(LIMITS.pseudonymMax),
  avatar: z.string().max(64).optional(),
  /** Jeton de reconnexion fourni par le serveur lors de la première entrée. */
  reconnectToken: z.string().max(128).optional(),
});
export type JoinRequest = z.infer<typeof zJoinRequest>;

/* ───────────── Création de session ───────────── */

export const zCreateSession = z.object({
  title: z.string().trim().min(1).max(LIMITS.sessionTitleMax),
  description: z.string().trim().max(LIMITS.sessionDescriptionMax).optional(),
  plannedAt: z.string().datetime().optional(),
  contentLocale: z.enum(LOCALES).default('fr'),
  anonymous: z.boolean().default(false),
});
export type CreateSession = z.infer<typeof zCreateSession>;

/* ───────────── Activités ───────────── */

export const zChoice = z.object({
  text: z.string().trim().min(1).max(LIMITS.choiceTextMax),
});

export const zScoreRules = z.object({
  basePoints: z.number().int().min(0).max(100_000),
  speedBonusMax: z.number().int().min(0).max(100_000),
  partialCredit: z.enum(['none', 'linear']),
  wrongPenalty: z.number().int().min(0).max(100_000),
});

export const zQuizActivity = z.object({
  type: z.literal('quiz'),
  title: z.string().trim().min(1).max(LIMITS.questionTextMax),
  format: z.enum(QUIZ_FORMATS),
  question: z.string().trim().min(1).max(LIMITS.questionTextMax),
  choices: z.array(zChoice).min(2).max(LIMITS.choicesPerQuestionMax),
  correctIndexes: z.array(z.number().int().min(0)).min(1),
  explanation: z.string().trim().max(LIMITS.questionTextMax).optional(),
  timerSec: z.number().int().min(LIMITS.timerMinSec).max(LIMITS.timerMaxSec),
  scoreRules: zScoreRules,
  presentation: z.enum(PRESENTATION_MODE).default('both'),
  resultVisibility: z.enum(RESULT_VISIBILITY).default('on_close'),
  contentLocale: z.enum(LOCALES).default('fr'),
});

export const zPollActivity = z.object({
  type: z.literal('poll'),
  title: z.string().trim().min(1).max(LIMITS.questionTextMax),
  format: z.enum(POLL_FORMATS),
  question: z.string().trim().min(1).max(LIMITS.questionTextMax),
  choices: z.array(zChoice).max(LIMITS.choicesPerQuestionMax).default([]),
  timerSec: z.number().int().min(LIMITS.timerMinSec).max(LIMITS.timerMaxSec).optional(),
  presentation: z.enum(PRESENTATION_MODE).default('both'),
  resultVisibility: z.enum(RESULT_VISIBILITY).default('immediate'),
  contentLocale: z.enum(LOCALES).default('fr'),
});

export const zQaActivity = z.object({
  type: z.literal('qa'),
  title: z.string().trim().min(1).max(LIMITS.questionTextMax),
  allowAnonymous: z.boolean().default(true),
  contentLocale: z.enum(LOCALES).default('fr'),
});

export const zOpenActivity = z.object({
  type: z.literal('open'),
  title: z.string().trim().min(1).max(LIMITS.questionTextMax),
  question: z.string().trim().min(1).max(LIMITS.questionTextMax),
  timerSec: z.number().int().min(LIMITS.timerMinSec).max(LIMITS.timerMaxSec).optional(),
  contentLocale: z.enum(LOCALES).default('fr'),
});

export const zActivity = z.discriminatedUnion('type', [
  zQuizActivity,
  zPollActivity,
  zQaActivity,
  zOpenActivity,
]);
export type ActivityDraft = z.infer<typeof zActivity>;

/**
 * Validation métier complémentaire d'un quiz : les index corrects doivent
 * référencer des choix existants (non couvert par le schéma seul).
 */
export function validateQuizIntegrity(
  a: z.infer<typeof zQuizActivity>,
): { ok: true } | { ok: false; error: string } {
  const max = a.choices.length - 1;
  for (const idx of a.correctIndexes) {
    if (idx > max) return { ok: false, error: `Index correct ${idx} hors des choix` };
  }
  if (a.format === 'single' && a.correctIndexes.length !== 1) {
    return { ok: false, error: 'Un choix unique exige exactement une bonne réponse' };
  }
  if (a.format === 'truefalse' && a.choices.length !== 2) {
    return { ok: false, error: 'Vrai/Faux exige exactement deux choix' };
  }
  return { ok: true };
}

/* ───────────── Soumissions participant ───────────── */

export const zSubmitQuizAnswer = z.object({
  activityId: zId,
  selectedIndexes: z.array(z.number().int().min(0)).max(LIMITS.choicesPerQuestionMax),
  /** Clé d'idempotence générée par le client pour éviter les doublons. */
  clientSubmissionId: z.string().min(1).max(64),
});
export type SubmitQuizAnswer = z.infer<typeof zSubmitQuizAnswer>;

export const zSubmitPollAnswer = z.object({
  activityId: zId,
  selectedIndexes: z.array(z.number().int().min(0)).max(LIMITS.choicesPerQuestionMax).optional(),
  text: z.string().trim().max(LIMITS.openAnswerMax).optional(),
  scale: z.number().int().min(1).max(10).optional(),
  clientSubmissionId: z.string().min(1).max(64),
});
export type SubmitPollAnswer = z.infer<typeof zSubmitPollAnswer>;

export const zSubmitQaQuestion = z.object({
  activityId: zId,
  text: z.string().trim().min(1).max(LIMITS.qaQuestionMax),
  anonymous: z.boolean().default(false),
  clientSubmissionId: z.string().min(1).max(64),
});
export type SubmitQaQuestion = z.infer<typeof zSubmitQaQuestion>;

export const zQaVote = z.object({
  questionId: zId,
  clientSubmissionId: z.string().min(1).max(64),
});
export type QaVote = z.infer<typeof zQaVote>;
