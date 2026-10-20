import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketData,
} from '@kaiju/shared';
import { logger } from '../lib/logger.js';

export type KaijuIo = SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Attache Socket.IO au serveur HTTP.
 * Phase 1 : établissement de connexion + journalisation.
 * Les gestionnaires métier (démarrage d'activité, soumissions, etc.) sont
 * enregistrés aux phases suivantes, tous revalidés et autorisés côté serveur.
 */
export function attachSocket(httpServer: HttpServer): KaijuIo {
  const io: KaijuIo = new SocketServer(httpServer, {
    // Local-first : même origine, pas de CORS large nécessaire en mono-port.
    serveClient: false,
    pingTimeout: 20_000,
  });

  io.on('connection', (socket) => {
    logger.info('Socket connecté', { id: socket.id });
    socket.on('disconnect', (reason) => {
      logger.info('Socket déconnecté', { id: socket.id, reason });
    });
  });

  return io;
}
