import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@kaiju/shared';

export type KaijuSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Ouvre une connexion Socket.IO vers le serveur Kaiju (même origine). */
export function connectSocket(): KaijuSocket {
  return io({
    transports: ['websocket', 'polling'],
    withCredentials: true,
  });
}

/** Émet un événement et attend l'accusé de réception (callback). */
export function emitAck<T = { ok: boolean }>(
  socket: KaijuSocket,
  event: string,
  payload: unknown,
): Promise<T> {
  return new Promise((resolve) => {
    (socket.emit as (e: string, p: unknown, cb: (r: T) => void) => void)(event, payload, resolve);
  });
}

/** Identifiant de soumission idempotent (anti-doublon réseau). */
export function newSubmissionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
