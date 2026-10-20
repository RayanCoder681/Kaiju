import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rateLimit.js';

describe('RateLimiter', () => {
  it('autorise jusqu’au quota puis bloque dans la fenêtre', () => {
    const rl = new RateLimiter(1000, 3);
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('a', 100)).toBe(true);
    expect(rl.allow('a', 200)).toBe(true);
    expect(rl.allow('a', 300)).toBe(false); // 4e dans la fenêtre
  });

  it('réautorise après expiration de la fenêtre', () => {
    const rl = new RateLimiter(1000, 1);
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('a', 500)).toBe(false);
    expect(rl.allow('a', 1500)).toBe(true); // fenêtre écoulée
  });

  it('isole les clés', () => {
    const rl = new RateLimiter(1000, 1);
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('b', 0)).toBe(true);
  });
});
