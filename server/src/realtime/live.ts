import type { Server as SocketServer } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketData,
  PublicActivityView,
  ActivityDraft,
} from '@kaiju/shared';
import type { Repositories, SessionActivityRow } from '../db/repositories.js';
import { computeResults } from './engine.js';

export type KaijuIo = SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Noms de salles par surface : l'isolation garantit la confidentialité des résultats. */
export const rooms = {
  host: (sessionId: string) => `host:${sessionId}`,
  participant: (sessionId: string) => `part:${sessionId}`,
  projection: (sessionId: string) => `proj:${sessionId}`,
};

/** Vue publique d'une activité : aucun corrigé ni note privée. */
export function publicActivityView(sac: SessionActivityRow): PublicActivityView {
  const draft = JSON.parse(sac.snapshot_json) as ActivityDraft;
  const view: PublicActivityView = {
    id: sac.id,
    type: draft.type,
    title: draft.title,
    state: sac.state,
    presentation: 'presentation' in draft ? draft.presentation : 'both',
  };
  if ('question' in draft) view.question = draft.question;
  if ('choices' in draft && draft.choices.length) {
    view.choices = draft.choices.map((c) => ({ text: c.text }));
  }
  if ('timerSec' in draft && typeof draft.timerSec === 'number') view.timerSec = draft.timerSec;
  if (sac.deadline_at) view.deadlineAt = sac.deadline_at;
  return view;
}

/** Diffuse l'activité courante (ou null) à toutes les surfaces d'une session. */
export function broadcastActivity(
  io: KaijuIo,
  sessionId: string,
  sac: SessionActivityRow | null,
): void {
  const payload = { activity: sac ? publicActivityView(sac) : null };
  io.to(rooms.host(sessionId)).emit('activity:changed', payload);
  io.to(rooms.participant(sessionId)).emit('activity:changed', payload);
  io.to(rooms.projection(sessionId)).emit('activity:changed', payload);
}

/**
 * Diffuse les résultats en respectant la visibilité :
 *  - console (host) : toujours, avec corrigé.
 *  - participants : seulement si visibilité « immediate » (sans corrigé).
 *  - projection : seulement après publication explicite (avec corrigé).
 */
export function broadcastResults(
  io: KaijuIo,
  repos: Repositories,
  sessionId: string,
  sac: SessionActivityRow,
): void {
  const draft = JSON.parse(sac.snapshot_json) as ActivityDraft;
  const visibility = 'resultVisibility' in draft ? draft.resultVisibility : 'on_close';

  // Console : vue complète (corrigé révélé).
  io.to(rooms.host(sessionId)).emit('results:update', computeResults(repos, sac.id, true));

  // Participants : agrégat sans corrigé, si visibilité immédiate.
  if (visibility === 'immediate') {
    io.to(rooms.participant(sessionId)).emit('results:update', computeResults(repos, sac.id, false));
  }

  // Projection : uniquement si publié vers la projection (corrigé révélé).
  if (sac.results_published_projection) {
    io.to(rooms.projection(sessionId)).emit('results:update', computeResults(repos, sac.id, true));
  }
}

/** Diffuse le décompte de présence (et la liste aux surfaces host). */
export function broadcastParticipants(io: KaijuIo, repos: Repositories, sessionId: string): void {
  const list = repos.participant.listBySession(sessionId);
  const count = list.length;
  io.to(rooms.host(sessionId)).emit('participants:update', {
    count,
    items: list.map((p) => ({ id: p.id, pseudonym: p.pseudonym, connected: !!p.connected })),
  });
  io.to(rooms.participant(sessionId)).emit('participants:update', { count });
  io.to(rooms.projection(sessionId)).emit('participants:update', { count });
}
