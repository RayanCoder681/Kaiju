/**
 * Limitation de débit à fenêtre glissante, en mémoire (local-first, pas de Redis).
 * Protège les actions exposées aux participants (entrée, soumissions, votes).
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly maxActions: number,
  ) {}

  /** Retourne true si l'action est autorisée, false si le quota est dépassé. */
  allow(key: string, now: number = Date.now()): boolean {
    const since = now - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (arr.length >= this.maxActions) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }

  /** Purge périodique des clés inactives (à appeler occasionnellement). */
  sweep(now: number = Date.now()): void {
    const since = now - this.windowMs;
    for (const [key, arr] of this.hits) {
      const kept = arr.filter((t) => t > since);
      if (kept.length === 0) this.hits.delete(key);
      else this.hits.set(key, kept);
    }
  }
}
