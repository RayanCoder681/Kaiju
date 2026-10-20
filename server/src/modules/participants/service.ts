import type { Repositories, ParticipantRow, SessionRow } from '../../db/repositories.js';
import { joinAllowedWhileActivity, type JoinRequest } from '@kaiju/shared';
import { newId, newToken } from '../../lib/ids.js';
import { Errors } from '../../lib/errors.js';

export interface JoinResult {
  participantId: string;
  reconnectToken: string;
  pseudonym: string;
  reconnected: boolean;
  session: { id: string; title: string; state: string; anonymous: boolean };
}

function sessionView(s: SessionRow) {
  return { id: s.id, title: s.title, state: s.state, anonymous: !!s.anonymous };
}

/** Aperçu public d'une session par code (écran préalable à l'entrée). */
export function joinPreview(repos: Repositories, code: string) {
  const s = repos.session.findJoinableByCode(code);
  if (!s) throw Errors.codeInvalid();
  return sessionView(s);
}

/**
 * Entrée ou reconnexion d'un participant.
 * RÈGLES :
 *  - Reconnexion d'un participant connu : conserve son identité et ses données ; jamais de doublon.
 *  - Nouvelle entrée : bloquée pendant une activité en cours ; autorisée si la session est active.
 *  - La reconnexion ne rend jamais valide une réponse tardive (géré au niveau des réponses).
 */
export function joinSession(repos: Repositories, input: JoinRequest): JoinResult {
  const session = repos.session.findJoinableByCode(input.code);
  if (!session) throw Errors.codeInvalid();

  const now = Date.now();

  // Reconnexion.
  if (input.reconnectToken) {
    const existing = repos.participant.findByReconnect(session.id, input.reconnectToken);
    if (existing) {
      if (session.state !== 'active' && session.state !== 'suspended') {
        throw Errors.sessionClosed();
      }
      repos.participant.setConnected(existing.id, true, now);
      return {
        participantId: existing.id,
        reconnectToken: existing.reconnect_token,
        pseudonym: existing.pseudonym,
        reconnected: true,
        session: sessionView(session),
      };
    }
    // Jeton inconnu : on retombe sur une nouvelle entrée.
  }

  // Nouvelle entrée : la session doit être active.
  if (session.state === 'preparation') throw Errors.sessionNotStarted();
  if (session.state !== 'active') throw Errors.sessionClosed();

  // Verrouillage : pas de nouvelle entrée pendant une activité en cours.
  const locking = repos.sessionActivity.currentLocking(session.id);
  if (!joinAllowedWhileActivity(locking?.state ?? null)) {
    throw Errors.sessionLocked();
  }

  const participant: ParticipantRow = {
    id: newId('par'),
    session_id: session.id,
    pseudonym: input.pseudonym,
    avatar: input.avatar ?? null,
    reconnect_token: newToken(16),
    team_id: null,
    join_order: repos.participant.countBySession(session.id) + 1,
    connected: 1,
    created_at: now,
    last_seen_at: now,
  };
  repos.participant.create(participant);

  return {
    participantId: participant.id,
    reconnectToken: participant.reconnect_token,
    pseudonym: participant.pseudonym,
    reconnected: false,
    session: sessionView(session),
  };
}
