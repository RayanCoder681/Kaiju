import { Router } from 'express';
import { z } from 'zod';
import { getRepositories } from '../../context.js';
import { handle, parseBody } from '../../middleware/handle.js';
import { requireHost } from '../../middleware/requireHost.js';
import { newId } from '../../lib/ids.js';
import { computeRanking, computeTeamRanking } from '../../realtime/engine.js';

/** Équipes + classements (host). Monté sur /api/sessions. */
export const teamsRouter = Router();
teamsRouter.use(requireHost);

teamsRouter.get(
  '/:sessionId/teams',
  handle((req, res) => {
    res.json({ ok: true, teams: getRepositories().team.listBySession(req.params.sessionId) });
  }),
);

teamsRouter.post(
  '/:sessionId/teams',
  handle((req, res) => {
    const { name } = parseBody(z.object({ name: z.string().trim().min(1).max(60) }), req.body);
    const id = newId('team');
    getRepositories().team.create(id, req.params.sessionId, name, Date.now());
    res.status(201).json({ ok: true, team: { id, name } });
  }),
);

teamsRouter.post(
  '/:sessionId/participants/:pid/team',
  handle((req, res) => {
    const { teamId } = parseBody(
      z.object({ teamId: z.string().nullable() }),
      req.body,
    );
    getRepositories().participant.assignTeam(req.params.pid, teamId);
    res.json({ ok: true });
  }),
);

teamsRouter.get(
  '/:sessionId/ranking',
  handle((req, res) => {
    const repos = getRepositories();
    res.json({
      ok: true,
      individual: computeRanking(repos, req.params.sessionId),
      teams: computeTeamRanking(repos, req.params.sessionId),
    });
  }),
);
