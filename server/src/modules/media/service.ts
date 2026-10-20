import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config.js';
import { getDb } from '../../db/connection.js';
import { newId } from '../../lib/ids.js';

/** Types d'image autorisés (type réel vérifié par signature, pas par extension). */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', ext: 'png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', ext: 'gif', test: (b) => b.length > 6 && b.toString('ascii', 0, 6).match(/^GIF8[79]a$/) !== null },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

export interface MediaRecord {
  id: string;
  filename: string;
  mime: string;
  bytes: number;
}

/** Détecte le type réel d'un buffer image. Retourne null si non reconnu. */
export function detectImageType(buf: Buffer): { mime: string; ext: string } | null {
  for (const sig of SIGNATURES) {
    if (sig.test(buf)) return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}

/**
 * Enregistre une image locale après validation du type réel et de la taille.
 * Jamais d'exécution ; simple écriture dans le dossier des médias.
 */
export function saveImage(buf: Buffer): MediaRecord {
  if (buf.length > config.limits.maxImageBytes) {
    throw new Error('IMAGE_TOO_LARGE');
  }
  const detected = detectImageType(buf);
  if (!detected) {
    throw new Error('IMAGE_TYPE_INVALID');
  }
  mkdirSync(config.uploadDir, { recursive: true });
  const id = newId('med');
  const filename = `${id}.${detected.ext}`;
  writeFileSync(join(config.uploadDir, filename), buf);

  getDb()
    .prepare('INSERT INTO media (id, filename, mime, bytes, created_at) VALUES (?,?,?,?,?)')
    .run(id, filename, detected.mime, buf.length, Date.now());

  return { id, filename, mime: detected.mime, bytes: buf.length };
}

export function getMedia(id: string): { path: string; mime: string } | null {
  const row = getDb().prepare('SELECT filename, mime FROM media WHERE id = ?').get(id) as
    | { filename: string; mime: string }
    | undefined;
  if (!row) return null;
  const path = join(config.uploadDir, row.filename);
  if (!existsSync(path)) return null;
  return { path, mime: row.mime };
}

/** Lecture brute (export complet avec médias). */
export function readMediaBuffer(id: string): Buffer | null {
  const m = getMedia(id);
  return m ? readFileSync(m.path) : null;
}
