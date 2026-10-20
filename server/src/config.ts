import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locale } from '@kaiju/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Racine du package serveur (un niveau au-dessus de src/dist). */
const SERVER_ROOT = resolve(__dirname, '..');

function fromRoot(p: string): string {
  return resolve(SERVER_ROOT, p);
}

/**
 * Secret de session : lu depuis l'environnement, sinon généré une fois et
 * persisté hors dépôt (jamais commité, jamais journalisé).
 */
function resolveSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  const secretPath = fromRoot('data/.session-secret');
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, 'utf8').trim();
  }
  const generated = randomBytes(48).toString('hex');
  mkdirSync(dirname(secretPath), { recursive: true });
  writeFileSync(secretPath, generated, { mode: 0o600 });
  return generated;
}

export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';
  sessionSecret: string;
  databasePath: string;
  backupDir: string;
  uploadDir: string;
  defaultLocale: Locale;
  serverRoot: string;
  limits: {
    /** Nombre maximal de participants par session (limite sûre, non désactivable par l'organisateur). */
    maxParticipantsPerSession: number;
    /** Taille maximale d'une image uploadée (octets). */
    maxImageBytes: number;
    /** Intervalle de sauvegarde automatique (minutes, 0 = désactivé). */
    autoBackupMinutes: number;
    /** Fenêtre et quota de limitation de débit pour les actions participant. */
    rateWindowMs: number;
    rateMaxActions: number;
  };
}

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  sessionSecret: resolveSessionSecret(),
  databasePath: fromRoot(process.env.DATABASE_PATH ?? './data/kaiju.sqlite'),
  backupDir: fromRoot(process.env.BACKUP_DIR ?? './backups'),
  uploadDir: fromRoot(process.env.UPLOAD_DIR ?? './uploads'),
  defaultLocale: (process.env.DEFAULT_LOCALE as Locale) ?? 'fr',
  serverRoot: SERVER_ROOT,
  limits: {
    maxParticipantsPerSession: Number(process.env.MAX_PARTICIPANTS ?? 200),
    maxImageBytes: Number(process.env.MAX_IMAGE_BYTES ?? 5 * 1024 * 1024),
    autoBackupMinutes: Number(process.env.AUTO_BACKUP_MINUTES ?? 10),
    rateWindowMs: Number(process.env.RATE_WINDOW_MS ?? 10_000),
    rateMaxActions: Number(process.env.RATE_MAX_ACTIONS ?? 30),
  },
};
