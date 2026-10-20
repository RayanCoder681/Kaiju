/**
 * États du cycle de vie — autorité serveur.
 * Le cycle de vie d'une CONFÉRENCE est distinct de celui d'une ACTIVITÉ.
 */

/** États d'une conférence / session. */
export const SESSION_STATES = [
  'preparation',
  'active',
  'suspended',
  'closed',
  'cancelled',
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** Transitions autorisées pour une session (toute transition absente est rejetée côté serveur). */
export const SESSION_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  preparation: ['active', 'cancelled'],
  active: ['suspended', 'closed', 'cancelled'],
  suspended: ['active', 'closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

/** États d'une activité (quiz, sondage, Q&A, réponses ouvertes). */
export const ACTIVITY_STATES = [
  'prepared',
  'countdown',
  'running',
  'paused',
  'closed',
  'cancelled',
] as const;
export type ActivityState = (typeof ACTIVITY_STATES)[number];

/** Transitions autorisées pour une activité. */
export const ACTIVITY_TRANSITIONS: Record<ActivityState, readonly ActivityState[]> = {
  prepared: ['countdown', 'running', 'cancelled'],
  countdown: ['running', 'cancelled'],
  running: ['paused', 'closed', 'cancelled'],
  paused: ['running', 'closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

/** Vrai si la transition d'état de session est autorisée. */
export function canTransitionSession(from: SessionState, to: SessionState): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

/** Vrai si la transition d'état d'activité est autorisée. */
export function canTransitionActivity(from: ActivityState, to: ActivityState): boolean {
  return ACTIVITY_TRANSITIONS[from].includes(to);
}

/** Une activité accepte des réponses uniquement dans l'état « running ». */
export function activityAcceptsAnswers(state: ActivityState): boolean {
  return state === 'running';
}

/**
 * Nouvelles entrées participant autorisées uniquement quand aucune activité
 * n'est en cours (règle métier : entrée bloquée pendant une activité).
 */
export function joinAllowedWhileActivity(state: ActivityState | null): boolean {
  if (state === null) return true;
  return state === 'prepared' || state === 'closed' || state === 'cancelled';
}
