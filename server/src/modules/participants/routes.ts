import { Router } from 'express';
import { zJoinRequest, zSessionCode } from '@kaiju/shared';
import { getRepositories } from '../../context.js';
import { handle, parseBody } from '../../middleware/handle.js';
import { requireHost } from '../../middleware/requireHost.js';
import { Errors } from '../../lib/errors.js';
import { joinLimiter } from '../../lib/limiters.js';
import { joinPreview, joinSession } from './service.js';

/** Routes publiques participant (aucune authentification). */
export const joinRouter = Router();

joinRouter.get(
  '/preview/:code',
  handle((req, res) => {
    const code = parseBody(zSessionCode, (req.params.code ?? '').toUpperCase());
    res.json({ ok: true, session: joinPreview(getRepositories(), code) });
  }),
);

joinRouter.post(
  '/',
  handle((req, res) => {
    if (!joinLimiter.allow(req.ip ?? 'unknown')) throw Errors.rateLimited();
    const input = parseBody(zJoinRequest, req.body);
    const result = joinSession(getRepositories(), input);
    res.json({ ok: true, ...result });
  }),
);

/** Routes organisateur : liste des participants d'une session (présence). */
export const hostParticipantsRouter = Router();
hostParticipantsRouter.use(requireHost);
hostParticipantsRouter.get(
  '/:sessionId/participants',
  handle((req, res) => {
    const repos = getRepositories();
    const items = repos.participant.listBySession(req.params.sessionId).map((p) => ({
      id: p.id,
      pseudonym: p.pseudonym,
      connected: !!p.connected,
      joinOrder: p.join_order,
    }));
    res.json({ ok: true, participants: items, count: items.length });
  }),
);
