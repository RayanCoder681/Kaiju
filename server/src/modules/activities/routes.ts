import { Router } from 'express';
import { z } from 'zod';
import { getRepositories } from '../../context.js';
import { handle, parseBody } from '../../middleware/handle.js';
import { requireHost } from '../../middleware/requireHost.js';
import type { ActivityLibraryRow, SessionActivityRow } from '../../db/repositories.js';
import {
  attachActivity,
  createLibraryActivity,
  duplicateLibraryActivity,
  listLibrary,
  listSessionActivities,
  updateLibraryActivity,
} from './service.js';

function toLibraryView(a: ActivityLibraryRow) {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    contentLocale: a.content_locale,
    used: !!a.used,
    definition: JSON.parse(a.definition_json),
    updatedAt: a.updated_at,
  };
}

function toSessionActivityView(a: SessionActivityRow) {
  return {
    id: a.id,
    type: a.type,
    position: a.position,
    state: a.state,
    snapshot: JSON.parse(a.snapshot_json),
    resultsPublishedConsole: !!a.results_published_console,
    resultsPublishedProjection: !!a.results_published_projection,
  };
}

/** Bibliothèque d'activités (host). Monté sur /api/activities. */
export const activitiesRouter = Router();
activitiesRouter.use(requireHost);

activitiesRouter.get(
  '/',
  handle((_req, res) => {
    res.json({ ok: true, activities: listLibrary(getRepositories()).map(toLibraryView) });
  }),
);

activitiesRouter.post(
  '/',
  handle((req, res) => {
    const a = createLibraryActivity(getRepositories(), req.body);
    res.status(201).json({ ok: true, activity: toLibraryView(a) });
  }),
);

activitiesRouter.put(
  '/:id',
  handle((req, res) => {
    const a = updateLibraryActivity(getRepositories(), req.params.id, req.body);
    res.json({ ok: true, activity: toLibraryView(a) });
  }),
);

activitiesRouter.post(
  '/:id/duplicate',
  handle((req, res) => {
    const a = duplicateLibraryActivity(getRepositories(), req.params.id);
    res.status(201).json({ ok: true, activity: toLibraryView(a) });
  }),
);

/** Activités attachées à une session (snapshots). Monté sur /api/sessions. */
export const sessionActivitiesRouter = Router();
sessionActivitiesRouter.use(requireHost);

const zAttach = z.object({
  libraryId: z.string().optional(),
  draft: z.unknown().optional(),
  privateNotes: z.string().max(2000).optional(),
});

sessionActivitiesRouter.get(
  '/:sessionId/activities',
  handle((req, res) => {
    const items = listSessionActivities(getRepositories(), req.params.sessionId).map(
      toSessionActivityView,
    );
    res.json({ ok: true, activities: items });
  }),
);

sessionActivitiesRouter.post(
  '/:sessionId/activities',
  handle((req, res) => {
    const input = parseBody(zAttach, req.body);
    const a = attachActivity(getRepositories(), req.params.sessionId, input);
    res.status(201).json({ ok: true, activity: toSessionActivityView(a) });
  }),
);
