import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

let db: Database.Database | null = null;

/**
 * Ouvre (ou renvoie) la connexion SQLite unique.
 * PRAGMAs choisis pour la fiabilité locale :
 *  - WAL : lectures concurrentes + écritures durables.
 *  - foreign_keys : intégrité référentielle.
 *  - synchronous NORMAL : bon compromis durabilité/performance en WAL.
 */
export function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(dirname(config.databasePath), { recursive: true });
  db = new Database(config.databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');

  logger.info('Base SQLite ouverte', { path: config.databasePath });
  return db;
}

/** Ferme proprement la connexion (arrêt du serveur, tests). */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
