import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { zCreateSession, SESSION_STATES, type SessionState } from '@kaiju/shared';
import { getRepositories } from '../../context.js';
import { handle, parseBody } from '../../middleware/handle.js';
import { requireHost } from '../../middleware/requireHost.js';
import { config } from '../../config.js';
import { detectLanIPv4, buildJoinUrl } from '../../net/lan.js';
import {
  createSession,
  getSessionOrThrow,
  listSessions,
  transitionSession,
} from './service.js';
import type { SessionRow } from '../../db/repositories.js';

export const sessionsRouter = Router();

/** Vue d'une session exposée à l'organisateur (sans champs internes superflus). */
function toHostView(s: SessionRow) {
  return {
    id: s.id,
    code: s.code,
    title: s.title,
    description: s.description,
    state: s.state,
    contentLocale: s.content_locale,
    anonymous: !!s.anonymous,
    plannedAt: s.planned_at,
    createdAt: s.created_at,
    startedAt: s.started_at,
    closedAt: s.closed_at,
  };
}

sessionsRouter.use(requireHost);

sessionsRouter.get(
  '/',
  handle((_req, res) => {
    res.json({ ok: true, sessions: listSessions(getRepositories()).map(toHostView) });
  }),
);

sessionsRouter.post(
  '/',
  handle((req, res) => {
    const input = parseBody(zCreateSession.extend({ quickStart: z.boolean().optional() }), req.body);
    const session = createSession(getRepositories(), input);
    res.status(201).json({ ok: true, session: toHostView(session) });
  }),
);

sessionsRouter.get(
  '/:id',
  handle((req, res) => {
    const session = getSessionOrThrow(getRepositories(), req.params.id);
    res.json({ ok: true, session: toHostView(session) });
  }),
);

/** Infos de connexion : URL LAN (jamais localhost) + QR en data URL. */
sessionsRouter.get(
  '/:id/connection',
  handle(async (req, res) => {
    const session = getSessionOrThrow(getRepositories(), req.params.id);
    const lanIp = detectLanIPv4();
    const joinUrl = lanIp ? buildJoinUrl(lanIp, config.port, `/join?code=${session.code}`) : null;
    const qrDataUrl = joinUrl ? await QRCode.toDataURL(joinUrl, { margin: 1, width: 320 }) : null;
    res.json({
      ok: true,
      code: session.code,
      lanIp,
      port: config.port,
      joinUrl,
      qrDataUrl,
      lanAvailable: !!lanIp,
    });
  }),
);

const zTransition = z.object({ to: z.enum(SESSION_STATES) });

/** Transition d'état (démarrer / suspendre / reprendre / clôturer / annuler). */
sessionsRouter.post(
  '/:id/transition',
  handle((req, res) => {
    const { to } = parseBody(zTransition, req.body) as { to: SessionState };
    const session = transitionSession(getRepositories(), req.params.id, to);
    res.json({ ok: true, session: toHostView(session) });
  }),
);
