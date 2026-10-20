import { randomBytes, randomUUID } from 'node:crypto';

/** Identifiant interne opaque (clé primaire). */
export function newId(prefix = ''): string {
  return prefix ? `${prefix}_${randomUUID()}` : randomUUID();
}

/** Jeton aléatoire opaque (session auth, reconnexion participant). */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Alphabet de code de session : majuscules + chiffres SANS caractères ambigus
 * (ni O/0, ni I/1) pour une saisie fiable sur smartphone.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Génère un code de session aléatoire de longueur donnée (défaut 6). */
export function newSessionCode(length = 6): string {
  const buf = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[buf[i]! % CODE_ALPHABET.length];
  }
  return out;
}
