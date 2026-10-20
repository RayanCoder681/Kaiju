import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { authRouter } from './modules/auth/routes.js';
import { sessionsRouter } from './modules/sessions/routes.js';
import { joinRouter, hostParticipantsRouter } from './modules/participants/routes.js';
import {
  activitiesRouter,
  sessionActivitiesRouter,
} from './modules/activities/routes.js';

/**
 * Fabrique l'application Express.
 * Isolée de l'écoute réseau pour être testable (Supertest).
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Santé : utilisé par le script de lancement et les tests.
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, name: 'Kaiju', time: Date.now() });
  });

  // Métadonnées publiques minimales (pas de secret).
  app.get('/api/meta', (_req: Request, res: Response) => {
    res.json({
      name: 'Kaiju',
      defaultLocale: config.defaultLocale,
      version: '0.1.0',
    });
  });

  // API — routeurs métier (montés avant le repli SPA).
  app.use('/api/auth', authRouter);
  app.use('/api/join', joinRouter);
  app.use('/api/activities', activitiesRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/sessions', sessionActivitiesRouter);
  app.use('/api/sessions', hostParticipantsRouter);

  // Service du client compilé (parcours local-first mono-port).
  // En développement, le client tourne sur Vite ; en production/démo, il est servi ici.
  const clientDist = join(config.serverRoot, '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // Repli SPA : toute route non-API renvoie index.html (routage côté client).
    app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  } else {
    app.get('/', (_req: Request, res: Response) => {
      res
        .status(200)
        .type('text/plain')
        .send(
          "Kaiju — serveur actif. Client non compilé.\n" +
            'Lancez « npm run dev:client » (développement) ou « npm run build » (démo).',
        );
    });
  }

  // Jamais exposer les détails internes au client.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Erreur non gérée', { message: err.message });
    res.status(500).json({ ok: false, errorKey: 'error.internal' });
  });

  return app;
}
