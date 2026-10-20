import type { Repositories, SessionRow } from '../../db/repositories.js';
import {
  canTransitionSession,
  type SessionState,
  type CreateSession,
} from '@kaiju/shared';
import { newId, newSessionCode } from '../../lib/ids.js';
import { AppError, Errors } from '../../lib/errors.js';

/** Génère un code de session unique parmi les sessions actives (longueur croissante si saturation). */
export function generateUniqueCode(repos: Repositories): string {
  const taken = repos.session.activeCodes();
  for (let length = 6; length <= 10; length++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const code = newSessionCode(length);
      if (!taken.has(code)) return code;
    }
  }
  throw Errors.conflict();
}

export function createSession(
  repos: Repositories,
  input: CreateSession & { quickStart?: boolean },
): SessionRow {
  const now = Date.now();
  const quick = input.quickStart ?? false;
  const row: SessionRow = {
    id: newId('ses'),
    code: generateUniqueCode(repos),
    title: input.title,
    description: input.description ?? null,
    state: quick ? 'active' : 'preparation',
    content_locale: input.contentLocale,
    anonymous: input.anonymous ? 1 : 0,
    planned_at: input.plannedAt ? Date.parse(input.plannedAt) : null,
    created_at: now,
    started_at: quick ? now : null,
    closed_at: null,
    settings_json: '{}',
  };
  repos.session.create(row);
  return row;
}

export function getSessionOrThrow(repos: Repositories, id: string): SessionRow {
  const s = repos.session.findById(id);
  if (!s) throw Errors.notFound();
  return s;
}

/**
 * Applique une transition d'état de conférence. Toute transition invalide est rejetée.
 * Les horodatages officiels (démarrage, clôture) sont posés par le serveur.
 */
export function transitionSession(
  repos: Repositories,
  id: string,
  to: SessionState,
): SessionRow {
  const session = getSessionOrThrow(repos, id);
  if (!canTransitionSession(session.state, to)) {
    throw new AppError(409, 'error.validation');
  }
  const now = Date.now();
  const patch: Partial<SessionRow> = {};
  if (to === 'active' && !session.started_at) patch.started_at = now;
  if (to === 'closed' || to === 'cancelled') patch.closed_at = now;
  repos.session.updateState(id, to, patch);
  return getSessionOrThrow(repos, id);
}

export function listSessions(repos: Repositories): SessionRow[] {
  return repos.session.listRecent();
}
