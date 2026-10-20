import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('API — santé & métadonnées', () => {
  const app = createApp();

  it('GET /api/health renvoie ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.name).toBe('Kaiju');
  });

  it('GET /api/meta renvoie la locale par défaut', async () => {
    const res = await request(app).get('/api/meta');
    expect(res.status).toBe(200);
    expect(['fr', 'en']).toContain(res.body.defaultLocale);
  });
});
