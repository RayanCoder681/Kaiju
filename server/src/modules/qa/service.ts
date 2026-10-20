import type Database from 'better-sqlite3';
import { newId } from '../../lib/ids.js';
import type { QaItemView } from '@kaiju/shared';

/** Statuts de modération d'une question Q&A. */
export type QaStatus = 'pending' | 'approved' | 'hidden' | 'archived' | 'answered';

interface QaRow {
  id: string;
  session_activity_id: string;
  participant_id: string | null;
  anonymous: number;
  text: string;
  status: QaStatus;
  projected: number;
  created_at: number;
}

/** Soumet une question Q&A (persistée). Les votes Q&A ne rapportent aucun point. */
export function submitQuestion(
  conn: Database.Database,
  input: {
    sessionActivityId: string;
    participantId: string | null;
    anonymous: boolean;
    text: string;
  },
  now: number = Date.now(),
): QaRow {
  const row: QaRow = {
    id: newId('qa'),
    session_activity_id: input.sessionActivityId,
    participant_id: input.participantId,
    anonymous: input.anonymous ? 1 : 0,
    text: input.text,
    status: 'pending',
    projected: 0,
    created_at: now,
  };
  conn
    .prepare(
      `INSERT INTO qa_question (id,session_activity_id,participant_id,anonymous,text,status,projected,created_at)
       VALUES (@id,@session_activity_id,@participant_id,@anonymous,@text,@status,@projected,@created_at)`,
    )
    .run(row);
  return row;
}

/** Vote communautaire idempotent (contrainte unique participant/question). */
export function voteQuestion(
  conn: Database.Database,
  questionId: string,
  participantId: string,
  now: number = Date.now(),
): { ok: boolean; duplicate: boolean } {
  try {
    conn
      .prepare('INSERT INTO qa_vote (id,question_id,participant_id,created_at) VALUES (?,?,?,?)')
      .run(newId('qav'), questionId, participantId, now);
    return { ok: true, duplicate: false };
  } catch {
    return { ok: true, duplicate: true };
  }
}

export function moderateQuestion(
  conn: Database.Database,
  questionId: string,
  patch: { status?: QaStatus; projected?: boolean },
): void {
  if (patch.status) {
    conn.prepare('UPDATE qa_question SET status = ? WHERE id = ?').run(patch.status, questionId);
  }
  if (patch.projected !== undefined) {
    conn
      .prepare('UPDATE qa_question SET projected = ? WHERE id = ?')
      .run(patch.projected ? 1 : 0, questionId);
  }
}

/**
 * Liste les questions d'une activité, triées par popularité puis date.
 * includeHidden = true pour la console organisateur ; false pour participant/projection.
 * onlyProjected = true pour l'écran de projection.
 */
export function listQuestions(
  conn: Database.Database,
  sessionActivityId: string,
  opts: { includeHidden: boolean; onlyProjected?: boolean } = { includeHidden: false },
): QaItemView[] {
  const rows = conn
    .prepare(
      `SELECT q.*, COALESCE(v.cnt,0) AS votes,
              (SELECT pseudonym FROM participant WHERE id = q.participant_id) AS author_name
         FROM qa_question q
         LEFT JOIN (SELECT question_id, COUNT(*) cnt FROM qa_vote GROUP BY question_id) v
                ON v.question_id = q.id
        WHERE q.session_activity_id = ?
        ORDER BY votes DESC, q.created_at ASC`,
    )
    .all(sessionActivityId) as (QaRow & { votes: number; author_name: string | null })[];

  return rows
    .filter((r) => {
      if (opts.onlyProjected) return r.projected === 1 && r.status !== 'hidden';
      if (!opts.includeHidden) return r.status !== 'hidden' && r.status !== 'archived';
      return true;
    })
    .map((r) => ({
      id: r.id,
      text: r.text,
      author: r.anonymous ? undefined : (r.author_name ?? undefined),
      votes: r.votes,
      status: r.status,
      createdAt: r.created_at,
    }));
}
