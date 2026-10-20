/**
 * Contrats d'événements Socket.IO, typés et partagés client/serveur.
 * Toute charge entrante est revalidée côté serveur avec Zod (jamais de confiance au client).
 */
import type { ActivityType, ActivityState, SessionState } from '../domain/index.js';

/** Vue publique d'une activité telle qu'exposée aux participants/projection. */
export interface PublicActivityView {
  id: string;
  type: ActivityType;
  title: string;
  question?: string;
  choices?: { text: string }[];
  state: ActivityState;
  /** Horodatage serveur (ms epoch) de fin du minuteur, s'il est en cours. */
  deadlineAt?: number;
  timerSec?: number;
  presentation: 'devices' | 'projection' | 'both';
}

/** Résultats agrégés (ne sont émis qu'aux surfaces autorisées par la visibilité). */
export interface AggregateResults {
  activityId: string;
  totalResponses: number;
  /** Décompte par index de choix (quiz/sondage à choix). */
  choiceCounts?: number[];
  /** Fréquences de mots (nuage de mots). */
  words?: { word: string; count: number }[];
  /** Distribution d'échelle (clé = valeur, valeur = décompte). */
  scaleCounts?: Record<number, number>;
  /** Révélation des bonnes réponses — uniquement après publication. */
  correctIndexes?: number[];
  explanation?: string;
}

export interface ParticipantPresence {
  id: string;
  pseudonym: string;
  connected: boolean;
}

export interface QaItemView {
  id: string;
  text: string;
  author?: string; // absent si anonyme
  votes: number;
  status: 'pending' | 'approved' | 'hidden' | 'archived' | 'answered';
  createdAt: number;
}

/** Événements émis par le SERVEUR vers les clients. */
export interface ServerToClientEvents {
  'session:state': (p: { sessionId: string; code: string; state: SessionState }) => void;
  'activity:changed': (p: { activity: PublicActivityView | null }) => void;
  'activity:tick': (p: { activityId: string; remainingMs: number }) => void;
  'results:update': (p: AggregateResults) => void;
  'qa:update': (p: { activityId: string; items: QaItemView[] }) => void;
  'participants:update': (p: { count: number; items?: ParticipantPresence[] }) => void;
  'notice': (p: { level: 'info' | 'warn' | 'error'; messageKey: string }) => void;
  /** Accusé de persistance durable d'une soumission (émis APRÈS écriture confirmée). */
  'submission:ack': (p: {
    clientSubmissionId: string;
    accepted: boolean;
    reason?: string;
  }) => void;
}

/** Événements émis par un CLIENT vers le serveur (tous revalidés + autorisés côté serveur). */
export interface ClientToServerEvents {
  'host:activity:start': (
    p: { activityId: string; countdownSec?: number },
    cb: (r: Ack) => void,
  ) => void;
  'host:activity:close': (p: { activityId: string }, cb: (r: Ack) => void) => void;
  'host:activity:pause': (p: { activityId: string }, cb: (r: Ack) => void) => void;
  'host:activity:resume': (p: { activityId: string }, cb: (r: Ack) => void) => void;
  'host:results:publish': (
    p: { activityId: string; toProjection: boolean },
    cb: (r: Ack) => void,
  ) => void;
  'participant:quiz:submit': (p: unknown, cb: (r: Ack) => void) => void;
  'participant:poll:submit': (p: unknown, cb: (r: Ack) => void) => void;
  'participant:qa:submit': (p: unknown, cb: (r: Ack) => void) => void;
  'participant:qa:vote': (p: unknown, cb: (r: Ack) => void) => void;
}

/** Accusé de réception générique d'une commande temps réel. */
export interface Ack {
  ok: boolean;
  /** Clé i18n d'erreur si !ok. */
  errorKey?: string;
}

/** Données attachées au socket côté serveur. */
export interface SocketData {
  surface: 'host' | 'participant' | 'projection';
  sessionId?: string;
  participantId?: string;
  isHost: boolean;
}
