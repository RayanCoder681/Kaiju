import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Repositories } from '../../db/repositories.js';
import { getDb } from '../../db/connection.js';
import { config } from '../../config.js';
import { newId } from '../../lib/ids.js';
import { logger } from '../../lib/logger.js';

/**
 * Reprise après incident : au démarrage, toute activité dont le minuteur a
 * expiré pendant l'interruption est clôturée. Aucune réponse tardive n'est acceptée.
 * Les activités sans minuteur (Q&A) et celles dont l'échéance est future restent actives.
 */
export function recoverStaleActivities(
  repos: Repositories,
  now: number = Date.now(),
): { closed: string[]; kept: string[] } {
  const closed: string[] = [];
  const kept: string[] = [];
  for (const sac of repos.sessionActivity.listActive()) {
    if (sac.deadline_at && now > sac.deadline_at) {
      repos.sessionActivity.updateState(sac.id, 'closed', { closed_at: now });
      closed.push(sac.id);
    } else {
      kept.push(sac.id);
    }
  }
  if (closed.length) {
    logger.warn('Reprise : activités clôturées (minuteur expiré pendant l’arrêt)', {
      count: closed.length,
    });
  }
  return { closed, kept };
}

export interface BackupMeta {
  id: string;
  filename: string;
  kind: 'auto' | 'manual';
  bytes: number;
  checksum: string;
  createdAt: number;
}

function timestamp(now: number): string {
  return new Date(now).toISOString().replace(/[:.]/g, '-');
}

/** Crée une sauvegarde cohérente de la base SQLite (copie en ligne). */
export async function createBackup(
  kind: 'auto' | 'manual' = 'manual',
  now: number = Date.now(),
): Promise<BackupMeta> {
  mkdirSync(config.backupDir, { recursive: true });
  const filename = `kaiju-${timestamp(now)}-${kind}.sqlite`;
  const dest = join(config.backupDir, filename);

  // better-sqlite3 : copie en ligne cohérente, même pendant l'écriture.
  await getDb().backup(dest);

  const bytes = statSync(dest).size;
  const checksum = createHash('sha256').update(readFileSync(dest)).digest('hex');

  getDb()
    .prepare(
      'INSERT INTO backup_meta (id, filename, kind, bytes, checksum, created_at) VALUES (?,?,?,?,?,?)',
    )
    .run(newId('bak'), filename, kind, bytes, checksum, now);

  logger.info('Sauvegarde créée', { filename, bytes });
  return { id: filename, filename, kind, bytes, checksum, createdAt: now };
}

export function listBackups(): BackupMeta[] {
  const rows = getDb()
    .prepare('SELECT * FROM backup_meta ORDER BY created_at DESC')
    .all() as {
    id: string;
    filename: string;
    kind: 'auto' | 'manual';
    bytes: number;
    checksum: string;
    created_at: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    kind: r.kind,
    bytes: r.bytes,
    checksum: r.checksum,
    createdAt: r.created_at,
  }));
}

export function lastBackupAt(): number | null {
  return listBackups()[0]?.createdAt ?? null;
}

/** Démarre les sauvegardes automatiques périodiques (si configurées). */
let backupTimer: NodeJS.Timeout | null = null;
export function startAutoBackup(): void {
  if (backupTimer || config.limits.autoBackupMinutes <= 0) return;
  const intervalMs = config.limits.autoBackupMinutes * 60 * 1000;
  backupTimer = setInterval(() => {
    createBackup('auto').catch((err) =>
      logger.error('Échec sauvegarde auto', { message: (err as Error).message }),
    );
  }, intervalMs);
  backupTimer.unref?.();
}

export function stopAutoBackup(): void {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}
