import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { getDb, closeDb } from './connection.js';
import { logger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

/** Garantit la table de suivi des migrations. */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migration (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

function checksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface MigrationReport {
  applied: string[];
  skipped: string[];
}

/**
 * Applique les migrations .sql non encore appliquées, dans l'ordre alphabétique.
 * Chaque migration tourne dans une transaction. Un fichier déjà appliqué dont
 * le checksum diffère lève une erreur (protège contre une altération silencieuse).
 */
export function runMigrations(db: Database.Database = getDb()): MigrationReport {
  ensureMigrationsTable(db);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedRows = db
    .prepare('SELECT filename, checksum FROM _migration')
    .all() as { filename: string; checksum: string }[];
  const appliedMap = new Map(appliedRows.map((r) => [r.filename, r.checksum]));

  const report: MigrationReport = { applied: [], skipped: [] };

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const sum = checksum(sql);
    const already = appliedMap.get(file);

    if (already) {
      if (already !== sum) {
        throw new Error(
          `Migration « ${file} » déjà appliquée mais modifiée depuis (checksum différent). ` +
            `Créez une nouvelle migration plutôt que d'éditer une migration appliquée.`,
        );
      }
      report.skipped.push(file);
      continue;
    }

    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migration (filename, checksum, applied_at) VALUES (?, ?, ?)').run(
        file,
        sum,
        Date.now(),
      );
    });
    tx();
    report.applied.push(file);
    logger.info(`Migration appliquée : ${file}`);
  }

  return report;
}

/** Exécution directe : `npm run migrate`. */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    const report = runMigrations();
    logger.info('Migrations terminées', report);
    closeDb();
    process.exit(0);
  } catch (err) {
    logger.error('Échec des migrations', { message: (err as Error).message });
    closeDb();
    process.exit(1);
  }
}
