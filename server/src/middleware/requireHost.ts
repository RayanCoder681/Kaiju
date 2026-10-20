import type { Request, Response, NextFunction } from 'express';
import { getRepositories } from '../context.js';
import { authenticate } from '../modules/auth/service.js';
import { readCookie, AUTH_COOKIE } from './cookies.js';

/** Étend Request avec l'identité organisateur authentifiée. */
export interface HostRequest extends Request {
  organizerId?: string;
}

/**
 * Autorise uniquement un organisateur authentifié.
 * RÈGLE : l'autorisation est vérifiée côté serveur pour CHAQUE action d'administration.
 * Le code de session ne confère jamais ces droits.
 */
export function requireHost(req: HostRequest, res: Response, next: NextFunction): void {
  const token = readCookie(req, AUTH_COOKIE);
  const organizerId = authenticate(getRepositories(), token);
  if (!organizerId) {
    res.status(401).json({ ok: false, errorKey: 'error.unauthorized' });
    return;
  }
  req.organizerId = organizerId;
  next();
}
