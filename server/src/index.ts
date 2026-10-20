import { createServer } from 'node:http';
import QRCode from 'qrcode';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { attachSocket } from './realtime/socket.js';
import { getDb, closeDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { detectLanIPv4, buildJoinUrl } from './net/lan.js';
import { getRepositories } from './context.js';
import { stopClock } from './realtime/socket.js';
import {
  recoverStaleActivities,
  startAutoBackup,
  stopAutoBackup,
} from './modules/maintenance/service.js';

async function main(): Promise<void> {
  // 1. Base de données + migrations (avant d'accepter du trafic).
  getDb();
  const report = runMigrations();
  logger.info('Migrations', report);

  // Reprise après incident : clôturer les activités dont le minuteur a expiré pendant l'arrêt.
  const recovery = recoverStaleActivities(getRepositories());
  if (recovery.closed.length) {
    logger.warn('Activités clôturées à la reprise', { count: recovery.closed.length });
  }

  // 2. Serveur HTTP + Express + Socket.IO.
  const app = createApp();
  const httpServer = createServer(app);
  attachSocket(httpServer);

  // 3. Écoute.
  httpServer.listen(config.port, config.host, async () => {
    const lanIp = detectLanIPv4();
    const consoleUrl = buildJoinUrl('localhost', config.port, '/host');
    const lanUrl = lanIp ? buildJoinUrl(lanIp, config.port, '/') : null;

    logger.info('Kaiju démarré');
    // Panneau de connexion imprimé au lancement.
    console.log('\n──────────────────────────────────────────────');
    console.log('  KAIJU — serveur actif');
    console.log('──────────────────────────────────────────────');
    console.log(`  Console organisateur : ${consoleUrl}`);
    if (lanUrl) {
      console.log(`  Participants (LAN)   : ${lanUrl}`);
      console.log(`  Adresse IP LAN       : ${lanIp}`);
    } else {
      console.log('  Participants (LAN)   : adresse LAN introuvable');
      console.log('  → Vérifiez la connexion Wi-Fi/Ethernet de cet ordinateur.');
    }
    console.log(`  Port                 : ${config.port}`);

    // QR code ASCII vers l'URL LAN (jamais localhost pour les téléphones).
    if (lanUrl) {
      try {
        const qr = await QRCode.toString(lanUrl, { type: 'terminal', small: true });
        console.log('\n  QR de connexion participant :\n');
        console.log(qr);
      } catch {
        console.log('  (QR non affichable dans ce terminal)');
      }
    }
    console.log('──────────────────────────────────────────────\n');

    // Sauvegardes automatiques périodiques.
    startAutoBackup();
  });

  // 4. Arrêt propre.
  const shutdown = (signal: string): void => {
    logger.info(`Arrêt (${signal})…`);
    stopAutoBackup();
    stopClock();
    httpServer.close(() => {
      closeDb();
      process.exit(0);
    });
    // Filet de sécurité si la fermeture traîne.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Échec du démarrage', { message: (err as Error).message });
  closeDb();
  process.exit(1);
});
