import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// IMPORTANT : aucun import statique de modules applicatifs ici — « config » est
// évalué une seule fois au premier import. On fixe donc l'environnement AVANT
// tout import dynamique de connection/migrate/service.

let dir: string;
let createBackup: typeof import('./service.js').createBackup;
let listBackups: typeof import('./service.js').listBackups;
let backupDir: string;
let closeDb: () => void;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kaiju-bak-'));
  process.env.DATABASE_PATH = join(dir, 'db.sqlite');
  process.env.BACKUP_DIR = join(dir, 'backups');
  process.env.SESSION_SECRET = 'test-secret-value-with-enough-length';
  process.env.NODE_ENV = 'test';

  const conn = await import('../../db/connection.js');
  closeDb = conn.closeDb;
  const { config } = await import('../../config.js');
  backupDir = config.backupDir;
  const mig = await import('../../db/migrate.js');
  mig.runMigrations();
  const svc = await import('./service.js');
  createBackup = svc.createBackup;
  listBackups = svc.listBackups;
});

afterAll(() => {
  closeDb?.();
  rmSync(dir, { recursive: true, force: true });
});

describe('Sauvegardes', () => {
  it('crée un fichier cohérent et l’enregistre dans les métadonnées', async () => {
    const meta = await createBackup('manual', 1000);
    expect(existsSync(join(backupDir, meta.filename))).toBe(true);
    expect(meta.bytes).toBeGreaterThan(0);
    expect(meta.checksum).toHaveLength(64);
    expect(listBackups().some((b) => b.filename === meta.filename)).toBe(true);
  });
});
