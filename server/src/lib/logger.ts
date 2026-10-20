/**
 * Journalisation simple et sûre.
 * Règle de sécurité : ne JAMAIS journaliser de mots de passe, jetons, secrets
 * ni contenu privé inutile. Les champs sensibles sont masqués ici.
 */

const SENSITIVE_KEYS = /pass|secret|token|cookie|authorization|hash/i;

function redact(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[masqué]' : redact(v);
    }
    return out;
  }
  return value;
}

function ts(): string {
  return new Date().toISOString();
}

/** Mode silencieux (info/warn) pendant les tests pour garder une sortie lisible. */
const QUIET = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

export const logger = {
  info(message: string, meta?: unknown): void {
    if (QUIET) return;
    if (meta === undefined) console.log(`[${ts()}] INFO  ${message}`);
    else console.log(`[${ts()}] INFO  ${message}`, redact(meta));
  },
  warn(message: string, meta?: unknown): void {
    if (meta === undefined) console.warn(`[${ts()}] WARN  ${message}`);
    else console.warn(`[${ts()}] WARN  ${message}`, redact(meta));
  },
  error(message: string, meta?: unknown): void {
    if (meta === undefined) console.error(`[${ts()}] ERROR ${message}`);
    else console.error(`[${ts()}] ERROR ${message}`, redact(meta));
  },
};
