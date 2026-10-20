import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;

/** Enveloppe un handler async : capture les erreurs et les traduit en réponse propre. */
export function handle(fn: Handler) {
  return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.status).json({ ok: false, errorKey: err.errorKey });
        return;
      }
      if (err instanceof ZodError) {
        res.status(400).json({ ok: false, errorKey: 'error.validation' });
        return;
      }
      // Ne jamais exposer les détails internes au client.
      logger.error('Erreur handler', { message: (err as Error).message });
      res.status(500).json({ ok: false, errorKey: 'error.internal' });
    }
  };
}

/** Valide le corps de requête avec un schéma Zod (renvoie le type de SORTIE, defaults appliqués). */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): ZodInfer<S> {
  return schema.parse(body);
}
