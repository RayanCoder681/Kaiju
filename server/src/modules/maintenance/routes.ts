import { Router } from 'express';
import { handle } from '../../middleware/handle.js';
import { requireHost } from '../../middleware/requireHost.js';
import { getDb } from '../../db/connection.js';
import { config } from '../../config.js';
import { getRecentErrors } from '../../lib/logger.js';
import { createBackup, listBackups, lastBackupAt } from './service.js';

export const maintenanceRouter = Router();
maintenanceRouter.use(requireHost);

/** Panneau de diagnostic : état serveur, réseau, participants, erreurs, sauvegarde. */
maintenanceRouter.get(
  '/diagnostics',
  handle((_req, res) => {
    const db = getDb();
    let dbOk = true;
    try {
      db.prepare('SELECT 1').get();
    } catch {
      dbOk = false;
    }
    const activeSessions = (
      db.prepare("SELECT COUNT(*) n FROM session WHERE state = 'active'").get() as { n: number }
    ).n;
    const connected = (
      db.prepare('SELECT COUNT(*) n FROM participant WHERE connected = 1').get() as { n: number }
    ).n;

    res.json({
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      dbOk,
      activeSessions,
      connectedParticipants: connected,
      lastBackupAt: lastBackupAt(),
      recentErrors: getRecentErrors(),
      limits: config.limits,
    });
  }),
);

maintenanceRouter.get(
  '/backups',
  handle((_req, res) => {
    res.json({ ok: true, backups: listBackups() });
  }),
);

maintenanceRouter.post(
  '/backup',
  handle(async (_req, res) => {
    const meta = await createBackup('manual');
    res.status(201).json({ ok: true, backup: meta });
  }),
);
