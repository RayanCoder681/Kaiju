/** Types de domaine partagés client/serveur. */

export const ACTIVITY_TYPES = ['quiz', 'poll', 'qa', 'open'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Formats de question de quiz. */
export const QUIZ_FORMATS = ['single', 'multiple', 'truefalse'] as const;
export type QuizFormat = (typeof QUIZ_FORMATS)[number];

/** Formats de sondage. */
export const POLL_FORMATS = ['single', 'multiple', 'text', 'scale', 'wordcloud'] as const;
export type PollFormat = (typeof POLL_FORMATS)[number];

/** Politique de visibilité des résultats. */
export const RESULT_VISIBILITY = [
  'immediate', // visibles dès soumission
  'on_close', // après fermeture de l'activité
  'projection_only', // uniquement sur la projection (après autorisation)
  'console_only', // uniquement dans la console organisateur
] as const;
export type ResultVisibility = (typeof RESULT_VISIBILITY)[number];

/** Où la question est présentée. */
export const PRESENTATION_MODE = [
  'devices', // smartphones uniquement
  'projection', // projection uniquement, réponse sur smartphone
  'both',
] as const;
export type PresentationMode = (typeof PRESENTATION_MODE)[number];

/** Modes de classement. */
export const RANKING_MODES = ['individual', 'team', 'podium', 'none'] as const;
export type RankingMode = (typeof RANKING_MODES)[number];

/** Langue de l'interface. */
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Rôle d'interface (jamais une autorisation à lui seul — l'autorité reste serveur). */
export const SURFACES = ['host', 'participant', 'projection'] as const;
export type Surface = (typeof SURFACES)[number];
