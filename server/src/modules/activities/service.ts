import type {
  Repositories,
  ActivityLibraryRow,
  SessionActivityRow,
} from '../../db/repositories.js';
import {
  zActivity,
  validateQuizIntegrity,
  type ActivityDraft,
} from '@kaiju/shared';
import { newId } from '../../lib/ids.js';
import { AppError, Errors } from '../../lib/errors.js';

/** Valide un brouillon d'activité (schéma + intégrité métier du quiz). */
export function validateDraft(raw: unknown): ActivityDraft {
  const draft = zActivity.parse(raw);
  if (draft.type === 'quiz') {
    const check = validateQuizIntegrity(draft);
    if (!check.ok) throw new AppError(400, 'error.validation');
  }
  return draft;
}

export function createLibraryActivity(repos: Repositories, raw: unknown): ActivityLibraryRow {
  const draft = validateDraft(raw);
  const now = Date.now();
  const row: ActivityLibraryRow = {
    id: newId('act'),
    type: draft.type,
    title: draft.title,
    content_locale: draft.contentLocale,
    definition_json: JSON.stringify(draft),
    used: 0,
    created_at: now,
    updated_at: now,
  };
  repos.activityLibrary.create(row);
  return row;
}

/** Édition en bibliothèque autorisée uniquement si l'activité n'a jamais été utilisée. */
export function updateLibraryActivity(
  repos: Repositories,
  id: string,
  raw: unknown,
): ActivityLibraryRow {
  const existing = repos.activityLibrary.findById(id);
  if (!existing) throw Errors.notFound();
  if (existing.used) throw Errors.conflict(); // protéger l'historique : dupliquer pour corriger
  const draft = validateDraft(raw);
  repos.activityLibrary.update(id, draft.title, JSON.stringify(draft), Date.now());
  return repos.activityLibrary.findById(id)!;
}

export function duplicateLibraryActivity(repos: Repositories, id: string): ActivityLibraryRow {
  const existing = repos.activityLibrary.findById(id);
  if (!existing) throw Errors.notFound();
  const now = Date.now();
  const copy: ActivityLibraryRow = {
    ...existing,
    id: newId('act'),
    title: `${existing.title} (copie)`,
    used: 0,
    created_at: now,
    updated_at: now,
  };
  repos.activityLibrary.create(copy);
  return copy;
}

export function listLibrary(repos: Repositories): ActivityLibraryRow[] {
  return repos.activityLibrary.list();
}

/**
 * Attache une activité à une session sous forme de SNAPSHOT indépendant.
 * Modifier la bibliothèque ensuite ne changera pas ce snapshot (historique immuable).
 */
export function attachActivity(
  repos: Repositories,
  sessionId: string,
  input: { libraryId?: string; draft?: unknown; privateNotes?: string },
): SessionActivityRow {
  const session = repos.session.findById(sessionId);
  if (!session) throw Errors.notFound();

  let draft: ActivityDraft;
  let libraryId: string | null = null;

  if (input.libraryId) {
    const lib = repos.activityLibrary.findById(input.libraryId);
    if (!lib) throw Errors.notFound();
    draft = JSON.parse(lib.definition_json) as ActivityDraft;
    libraryId = lib.id;
    repos.activityLibrary.markUsed(lib.id, Date.now());
  } else {
    draft = validateDraft(input.draft);
  }

  const now = Date.now();
  const row: SessionActivityRow = {
    id: newId('sac'),
    session_id: sessionId,
    library_id: libraryId,
    type: draft.type,
    position: repos.sessionActivity.nextPosition(sessionId),
    snapshot_json: JSON.stringify(draft),
    state: 'prepared',
    private_notes: input.privateNotes ?? null,
    results_published_console: 0,
    results_published_projection: 0,
    started_at: null,
    deadline_at: null,
    closed_at: null,
    created_at: now,
  };
  repos.sessionActivity.create(row);
  return row;
}

export function listSessionActivities(
  repos: Repositories,
  sessionId: string,
): SessionActivityRow[] {
  return repos.sessionActivity.listBySession(sessionId);
}
