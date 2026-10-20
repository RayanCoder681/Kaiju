import type { Repositories, SessionActivityRow } from '../../db/repositories.js';
import { z } from 'zod';
import { zActivity, validateQuizIntegrity, type ActivityDraft } from '@kaiju/shared';
import { computeResults, computeRanking } from '../../realtime/engine.js';
import { newId } from '../../lib/ids.js';

/* ───────────── Export CSV des résultats ───────────── */

/** Échappe une valeur pour CSV (RFC 4180) : guillemets doublés, entourage si nécessaire. */
function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

/**
 * Export CSV des scores par participant (une colonne par quiz).
 * BOM UTF-8 en tête pour une ouverture correcte dans Excel.
 */
export function exportResultsCsv(repos: Repositories, sessionId: string): string {
  const participants = repos.participant.listBySession(sessionId);
  const teams = new Map(repos.team.listBySession(sessionId).map((tm) => [tm.id, tm.name]));
  const activities = repos.sessionActivity
    .listBySession(sessionId)
    .filter((a) => a.type === 'quiz');

  // Score par (participant, activité quiz).
  const perActivity = new Map<string, Map<string, number>>();
  for (const a of activities) {
    const m = new Map<string, number>();
    for (const r of repos.answer.rankingRowsForActivity(a.id)) m.set(r.pid, r.total);
    perActivity.set(a.id, m);
  }

  const header = [
    'Pseudonyme',
    'Equipe',
    ...activities.map((a) => (JSON.parse(a.snapshot_json) as ActivityDraft).title),
    'Score total',
  ];
  const lines = [csvRow(header)];

  for (const p of participants) {
    let total = 0;
    const cells: (string | number)[] = [p.pseudonym, p.team_id ? (teams.get(p.team_id) ?? '') : ''];
    for (const a of activities) {
      const s = perActivity.get(a.id)?.get(p.id) ?? 0;
      total += s;
      cells.push(s);
    }
    cells.push(total);
    lines.push(csvRow(cells));
  }

  return '﻿' + lines.join('\r\n') + '\r\n';
}

/* ───────────── Export JSON des activités ───────────── */

export const ACTIVITIES_SCHEMA_VERSION = 1;

/** Exporte les définitions d'activités (bibliothèque) dans un format documenté. */
export function exportActivitiesJson(repos: Repositories): {
  schema: string;
  version: number;
  activities: ActivityDraft[];
} {
  const activities = repos.activityLibrary
    .list()
    .map((a) => JSON.parse(a.definition_json) as ActivityDraft);
  return { schema: 'kaiju.activities', version: ACTIVITIES_SCHEMA_VERSION, activities };
}

const zImportFile = z.object({
  schema: z.literal('kaiju.activities').optional(),
  version: z.number().optional(),
  activities: z.array(z.unknown()),
});

export interface ImportReport {
  imported: { index: number; title: string }[];
  duplicates: { index: number; title: string }[];
  errors: { index: number; error: string }[];
}

/**
 * Importe des activités depuis un JSON. Chaque élément est validé (Zod + intégrité quiz).
 * Jamais d'exécution de code : simple JSON.parse + validation. Doublons (même titre) signalés.
 * Rapport d'erreurs par ligne ; les éléments valides sont importés, les autres ignorés.
 */
export function importActivitiesJson(repos: Repositories, raw: unknown): ImportReport {
  const file = zImportFile.parse(raw);
  const report: ImportReport = { imported: [], duplicates: [], errors: [] };
  const existingTitles = new Set(repos.activityLibrary.list().map((a) => a.title.toLowerCase()));

  file.activities.forEach((item, index) => {
    const parsed = zActivity.safeParse(item);
    if (!parsed.success) {
      report.errors.push({ index, error: parsed.error.issues[0]?.message ?? 'Format invalide' });
      return;
    }
    const draft = parsed.data;
    if (draft.type === 'quiz') {
      const integ = validateQuizIntegrity(draft);
      if (!integ.ok) {
        report.errors.push({ index, error: integ.error });
        return;
      }
    }
    if (existingTitles.has(draft.title.toLowerCase())) {
      report.duplicates.push({ index, title: draft.title });
      return;
    }
    const now = Date.now();
    repos.activityLibrary.create({
      id: newId('act'),
      type: draft.type,
      title: draft.title,
      content_locale: draft.contentLocale,
      definition_json: JSON.stringify(draft),
      used: 0,
      created_at: now,
      updated_at: now,
    });
    existingTitles.add(draft.title.toLowerCase());
    report.imported.push({ index, title: draft.title });
  });

  return report;
}

/* ───────────── Rapport de session ───────────── */

export interface SessionReport {
  session: { id: string; title: string; code: string; state: string };
  participation: { total: number; connected: number };
  ranking: { pseudonym: string; totalScore: number }[];
  activities: {
    id: string;
    type: string;
    title: string;
    state: string;
    totalResponses: number;
    choiceCounts?: number[];
    correctIndexes?: number[];
  }[];
}

export function buildSessionReport(repos: Repositories, sessionId: string): SessionReport {
  const session = repos.session.findById(sessionId);
  if (!session) throw new Error('session introuvable');
  const participants = repos.participant.listBySession(sessionId);
  const activities = repos.sessionActivity.listBySession(sessionId).map((a: SessionActivityRow) => {
    const draft = JSON.parse(a.snapshot_json) as ActivityDraft;
    const res = computeResults(repos, a.id, true);
    return {
      id: a.id,
      type: a.type,
      title: draft.title,
      state: a.state,
      totalResponses: res.totalResponses,
      choiceCounts: res.choiceCounts,
      correctIndexes: res.correctIndexes,
    };
  });

  return {
    session: { id: session.id, title: session.title, code: session.code, state: session.state },
    participation: {
      total: participants.length,
      connected: participants.filter((p) => p.connected).length,
    },
    ranking: computeRanking(repos, sessionId).map((r) => ({
      pseudonym: r.pseudonym,
      totalScore: r.totalScore,
    })),
    activities,
  };
}

/** Bundle complet (export/transfert) : session, snapshots, participants, résultats. */
export function exportFullBundle(repos: Repositories, sessionId: string) {
  const report = buildSessionReport(repos, sessionId);
  const snapshots = repos.sessionActivity
    .listBySession(sessionId)
    .map((a) => ({ id: a.id, type: a.type, snapshot: JSON.parse(a.snapshot_json) }));
  return {
    schema: 'kaiju.session-bundle',
    version: 1,
    exportedAt: Date.now(),
    report,
    snapshots,
  };
}
