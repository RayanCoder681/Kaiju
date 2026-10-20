import type { Locale } from '../domain/types.js';

/**
 * Traductions centralisées (interface, erreurs, états, notifications).
 * La langue de l'INTERFACE est indépendante de la langue du CONTENU d'activité.
 * Aucune traduction automatique : chaque clé est traduite à la main.
 */
export const DICTIONARIES = {
  fr: {
    'app.name': 'Kaiju',
    'app.tagline': "Participation en direct pour vos amphis et ateliers",

    'common.join': 'Rejoindre',
    'common.cancel': 'Annuler',
    'common.confirm': 'Confirmer',
    'common.save': 'Enregistrer',
    'common.saving': 'Enregistrement…',
    'common.saved': 'Enregistré',
    'common.saveFailed': 'Échec de sauvegarde',
    'common.loading': 'Chargement…',
    'common.retry': 'Réessayer',

    'session.state.preparation': 'En préparation',
    'session.state.active': 'En direct',
    'session.state.suspended': 'Suspendue',
    'session.state.closed': 'Terminée',
    'session.state.cancelled': 'Annulée',

    'activity.state.prepared': 'Prête',
    'activity.state.countdown': 'Décompte',
    'activity.state.running': 'En cours',
    'activity.state.paused': 'En pause',
    'activity.state.closed': 'Clôturée',
    'activity.state.cancelled': 'Annulée',

    'join.enterCode': 'Saisissez le code de la session',
    'join.pseudonym': 'Votre pseudonyme',
    'join.waiting': "En attente du démarrage par l'organisateur",

    'error.codeInvalid': 'Code de session invalide',
    'error.sessionClosed': 'Cette session est terminée',
    'error.sessionNotStarted': "La session n'a pas encore démarré",
    'error.sessionFull': 'La session a atteint sa capacité maximale',
    'error.sessionLocked': "Une activité est en cours, l'entrée est momentanément verrouillée",
    'error.activityNotRunning': "L'activité n'accepte pas de réponse actuellement",
    'error.deadlinePassed': 'Le délai est dépassé, réponse refusée',
    'error.duplicate': 'Réponse déjà enregistrée',
    'error.unauthorized': 'Action non autorisée',
    'error.validation': 'Données invalides',
    'error.rateLimited': 'Trop de requêtes, patientez un instant',
    'error.internal': 'Une erreur interne est survenue',

    'notice.activityStarted': "L'activité a démarré",
    'notice.timerEnded': 'Le temps est écoulé',
    'notice.resultsPublished': 'Les résultats sont publiés',
    'notice.reconnected': 'Reconnexion réussie',
  },

  en: {
    'app.name': 'Kaiju',
    'app.tagline': 'Live participation for your lectures and workshops',

    'common.join': 'Join',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.save': 'Save',
    'common.saving': 'Saving…',
    'common.saved': 'Saved',
    'common.saveFailed': 'Save failed',
    'common.loading': 'Loading…',
    'common.retry': 'Retry',

    'session.state.preparation': 'Preparing',
    'session.state.active': 'Live',
    'session.state.suspended': 'Suspended',
    'session.state.closed': 'Ended',
    'session.state.cancelled': 'Cancelled',

    'activity.state.prepared': 'Ready',
    'activity.state.countdown': 'Countdown',
    'activity.state.running': 'Running',
    'activity.state.paused': 'Paused',
    'activity.state.closed': 'Closed',
    'activity.state.cancelled': 'Cancelled',

    'join.enterCode': 'Enter the session code',
    'join.pseudonym': 'Your nickname',
    'join.waiting': 'Waiting for the host to start',

    'error.codeInvalid': 'Invalid session code',
    'error.sessionClosed': 'This session has ended',
    'error.sessionNotStarted': "The session hasn't started yet",
    'error.sessionFull': 'The session has reached its maximum capacity',
    'error.sessionLocked': 'An activity is running, joining is temporarily locked',
    'error.activityNotRunning': 'The activity is not accepting answers right now',
    'error.deadlinePassed': 'The deadline has passed, answer refused',
    'error.duplicate': 'Answer already recorded',
    'error.unauthorized': 'Action not allowed',
    'error.validation': 'Invalid data',
    'error.rateLimited': 'Too many requests, please wait',
    'error.internal': 'An internal error occurred',

    'notice.activityStarted': 'The activity has started',
    'notice.timerEnded': "Time's up",
    'notice.resultsPublished': 'Results are published',
    'notice.reconnected': 'Reconnected successfully',
  },
} as const;

/** Clés de traduction disponibles (dérivées du dictionnaire français de référence). */
export type MessageKey = keyof (typeof DICTIONARIES)['fr'];

export const DEFAULT_LOCALE: Locale = 'fr';

/** Traduit une clé. Repli : locale par défaut, puis la clé brute. */
export function translate(locale: Locale, key: MessageKey): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return dict[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
}

/** Fabrique un traducteur lié à une locale. */
export function makeTranslator(locale: Locale) {
  return (key: MessageKey): string => translate(locale, key);
}
