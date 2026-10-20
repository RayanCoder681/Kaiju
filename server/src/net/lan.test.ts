import { describe, it, expect } from 'vitest';
import { buildJoinUrl } from './lan.js';

describe('buildJoinUrl', () => {
  it('construit une URL LAN avec hôte et port, jamais localhost', () => {
    const url = buildJoinUrl('192.168.1.42', 4000, '/join');
    expect(url).toBe('http://192.168.1.42:4000/join');
    expect(url).not.toContain('localhost');
    expect(url).not.toContain('127.0.0.1');
  });
});
