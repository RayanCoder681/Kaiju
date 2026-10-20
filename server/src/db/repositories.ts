import type Database from 'better-sqlite3';
import type { SessionState, ActivityState, ActivityType } from '@kaiju/shared';

/* ───────────── Types de lignes ───────────── */

export interface OrganizerRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  created_at: number;
}

export interface SessionRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  state: SessionState;
  content_locale: string;
  anonymous: number;
  planned_at: number | null;
  created_at: number;
  started_at: number | null;
  closed_at: number | null;
  settings_json: string;
}

export interface ParticipantRow {
  id: string;
  session_id: string;
  pseudonym: string;
  avatar: string | null;
  reconnect_token: string;
  team_id: string | null;
  join_order: number;
  connected: number;
  created_at: number;
  last_seen_at: number;
}

export interface ActivityLibraryRow {
  id: string;
  type: ActivityType;
  title: string;
  content_locale: string;
  definition_json: string;
  used: number;
  created_at: number;
  updated_at: number;
}

export interface SessionActivityRow {
  id: string;
  session_id: string;
  library_id: string | null;
  type: ActivityType;
  position: number;
  snapshot_json: string;
  state: ActivityState;
  private_notes: string | null;
  results_published_console: number;
  results_published_projection: number;
  started_at: number | null;
  deadline_at: number | null;
  closed_at: number | null;
  created_at: number;
}

/* ───────────── Fabrique de repositories ───────────── */

export function makeRepositories(db: Database.Database) {
  return {
    organizer: {
      count(): number {
        return (db.prepare('SELECT COUNT(*) AS n FROM organizer').get() as { n: number }).n;
      },
      create(row: OrganizerRow): void {
        db.prepare(
          'INSERT INTO organizer (id, username, password_hash, display_name, created_at) VALUES (@id,@username,@password_hash,@display_name,@created_at)',
        ).run(row);
      },
      findByUsername(username: string): OrganizerRow | undefined {
        return db.prepare('SELECT * FROM organizer WHERE username = ?').get(username) as
          | OrganizerRow
          | undefined;
      },
      findById(id: string): OrganizerRow | undefined {
        return db.prepare('SELECT * FROM organizer WHERE id = ?').get(id) as
          | OrganizerRow
          | undefined;
      },
    },

    authSession: {
      create(token: string, organizerId: string, createdAt: number, expiresAt: number): void {
        db.prepare(
          'INSERT INTO auth_session (token, organizer_id, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)',
        ).run(token, organizerId, createdAt, expiresAt, createdAt);
      },
      findValid(token: string, now: number): { organizer_id: string } | undefined {
        return db
          .prepare('SELECT organizer_id FROM auth_session WHERE token = ? AND expires_at > ?')
          .get(token, now) as { organizer_id: string } | undefined;
      },
      touch(token: string, now: number): void {
        db.prepare('UPDATE auth_session SET last_seen_at = ? WHERE token = ?').run(now, token);
      },
      delete(token: string): void {
        db.prepare('DELETE FROM auth_session WHERE token = ?').run(token);
      },
      deleteExpired(now: number): void {
        db.prepare('DELETE FROM auth_session WHERE expires_at <= ?').run(now);
      },
    },

    session: {
      create(row: SessionRow): void {
        db.prepare(
          `INSERT INTO session (id,code,title,description,state,content_locale,anonymous,planned_at,created_at,started_at,closed_at,settings_json)
           VALUES (@id,@code,@title,@description,@state,@content_locale,@anonymous,@planned_at,@created_at,@started_at,@closed_at,@settings_json)`,
        ).run(row);
      },
      findById(id: string): SessionRow | undefined {
        return db.prepare('SELECT * FROM session WHERE id = ?').get(id) as SessionRow | undefined;
      },
      /** Session joignable par code : non fermée et non annulée. */
      findJoinableByCode(code: string): SessionRow | undefined {
        return db
          .prepare("SELECT * FROM session WHERE code = ? AND state NOT IN ('closed','cancelled')")
          .get(code) as SessionRow | undefined;
      },
      /** Codes des sessions encore actives (pour garantir l'unicité). */
      activeCodes(): Set<string> {
        const rows = db
          .prepare("SELECT code FROM session WHERE state NOT IN ('closed','cancelled')")
          .all() as { code: string }[];
        return new Set(rows.map((r) => r.code));
      },
      listRecent(limit = 50): SessionRow[] {
        return db
          .prepare('SELECT * FROM session ORDER BY created_at DESC LIMIT ?')
          .all(limit) as SessionRow[];
      },
      updateState(id: string, state: SessionState, patch: Partial<SessionRow> = {}): void {
        const startedAt = patch.started_at ?? null;
        const closedAt = patch.closed_at ?? null;
        db.prepare(
          `UPDATE session SET state = ?,
             started_at = COALESCE(?, started_at),
             closed_at = COALESCE(?, closed_at)
           WHERE id = ?`,
        ).run(state, startedAt, closedAt, id);
      },
    },

    team: {
      create(id: string, sessionId: string, name: string, now: number): void {
        db.prepare('INSERT INTO team (id, session_id, name, created_at) VALUES (?,?,?,?)').run(
          id,
          sessionId,
          name,
          now,
        );
      },
      listBySession(sessionId: string): { id: string; name: string }[] {
        return db
          .prepare('SELECT id, name FROM team WHERE session_id = ? ORDER BY created_at')
          .all(sessionId) as { id: string; name: string }[];
      },
      findById(id: string): { id: string; session_id: string; name: string } | undefined {
        return db.prepare('SELECT id, session_id, name FROM team WHERE id = ?').get(id) as
          | { id: string; session_id: string; name: string }
          | undefined;
      },
    },

    participant: {
      create(row: ParticipantRow): void {
        db.prepare(
          `INSERT INTO participant (id,session_id,pseudonym,avatar,reconnect_token,team_id,join_order,connected,created_at,last_seen_at)
           VALUES (@id,@session_id,@pseudonym,@avatar,@reconnect_token,@team_id,@join_order,@connected,@created_at,@last_seen_at)`,
        ).run(row);
      },
      findByReconnect(sessionId: string, token: string): ParticipantRow | undefined {
        return db
          .prepare('SELECT * FROM participant WHERE session_id = ? AND reconnect_token = ?')
          .get(sessionId, token) as ParticipantRow | undefined;
      },
      findById(id: string): ParticipantRow | undefined {
        return db.prepare('SELECT * FROM participant WHERE id = ?').get(id) as
          | ParticipantRow
          | undefined;
      },
      listBySession(sessionId: string): ParticipantRow[] {
        return db
          .prepare('SELECT * FROM participant WHERE session_id = ? ORDER BY join_order')
          .all(sessionId) as ParticipantRow[];
      },
      countBySession(sessionId: string): number {
        return (
          db
            .prepare('SELECT COUNT(*) AS n FROM participant WHERE session_id = ?')
            .get(sessionId) as { n: number }
        ).n;
      },
      setConnected(id: string, connected: boolean, now: number): void {
        db.prepare('UPDATE participant SET connected = ?, last_seen_at = ? WHERE id = ?').run(
          connected ? 1 : 0,
          now,
          id,
        );
      },
      /** Affecte un participant à une équipe. Ne touche ni ses réponses ni ses scores. */
      assignTeam(id: string, teamId: string | null): void {
        db.prepare('UPDATE participant SET team_id = ? WHERE id = ?').run(teamId, id);
      },
    },

    activityLibrary: {
      create(row: ActivityLibraryRow): void {
        db.prepare(
          `INSERT INTO activity_library (id,type,title,content_locale,definition_json,used,created_at,updated_at)
           VALUES (@id,@type,@title,@content_locale,@definition_json,@used,@created_at,@updated_at)`,
        ).run(row);
      },
      findById(id: string): ActivityLibraryRow | undefined {
        return db.prepare('SELECT * FROM activity_library WHERE id = ?').get(id) as
          | ActivityLibraryRow
          | undefined;
      },
      list(): ActivityLibraryRow[] {
        return db
          .prepare('SELECT * FROM activity_library ORDER BY updated_at DESC')
          .all() as ActivityLibraryRow[];
      },
      markUsed(id: string, now: number): void {
        db.prepare('UPDATE activity_library SET used = 1, updated_at = ? WHERE id = ?').run(now, id);
      },
      update(id: string, title: string, definitionJson: string, now: number): void {
        db.prepare(
          'UPDATE activity_library SET title = ?, definition_json = ?, updated_at = ? WHERE id = ?',
        ).run(title, definitionJson, now, id);
      },
    },

    answer: {
      findByParticipant(
        sacId: string,
        participantId: string,
      ): { client_submission_id: string } | undefined {
        return db
          .prepare(
            'SELECT client_submission_id FROM answer WHERE session_activity_id = ? AND participant_id = ?',
          )
          .get(sacId, participantId) as { client_submission_id: string } | undefined;
      },
      insert(row: {
        id: string;
        session_activity_id: string;
        participant_id: string;
        client_submission_id: string;
        payload_json: string;
        score: number | null;
        answer_time_ms: number;
        created_at: number;
      }): void {
        db.prepare(
          `INSERT INTO answer (id, session_activity_id, participant_id, client_submission_id, payload_json, score, answer_time_ms, created_at)
           VALUES (@id,@session_activity_id,@participant_id,@client_submission_id,@payload_json,@score,@answer_time_ms,@created_at)`,
        ).run(row);
      },
      listPayloads(sacId: string): { payload_json: string }[] {
        return db
          .prepare('SELECT payload_json FROM answer WHERE session_activity_id = ?')
          .all(sacId) as { payload_json: string }[];
      },
      rankingRows(sessionId: string): { pid: string; total: number; time: number }[] {
        return db
          .prepare(
            `SELECT a.participant_id AS pid,
                    COALESCE(SUM(a.score), 0) AS total,
                    COALESCE(SUM(a.answer_time_ms), 0) AS time
               FROM answer a
               JOIN session_activity sa ON sa.id = a.session_activity_id
              WHERE sa.session_id = ?
              GROUP BY a.participant_id`,
          )
          .all(sessionId) as { pid: string; total: number; time: number }[];
      },
    },

    sessionActivity: {
      create(row: SessionActivityRow): void {
        db.prepare(
          `INSERT INTO session_activity
            (id,session_id,library_id,type,position,snapshot_json,state,private_notes,results_published_console,results_published_projection,started_at,deadline_at,closed_at,created_at)
           VALUES
            (@id,@session_id,@library_id,@type,@position,@snapshot_json,@state,@private_notes,@results_published_console,@results_published_projection,@started_at,@deadline_at,@closed_at,@created_at)`,
        ).run(row);
      },
      findById(id: string): SessionActivityRow | undefined {
        return db.prepare('SELECT * FROM session_activity WHERE id = ?').get(id) as
          | SessionActivityRow
          | undefined;
      },
      listBySession(sessionId: string): SessionActivityRow[] {
        return db
          .prepare('SELECT * FROM session_activity WHERE session_id = ? ORDER BY position')
          .all(sessionId) as SessionActivityRow[];
      },
      nextPosition(sessionId: string): number {
        const row = db
          .prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM session_activity WHERE session_id = ?')
          .get(sessionId) as { maxPos: number };
        return row.maxPos + 1;
      },
      /** Toutes les activités en décompte ou en cours (reprise après incident). */
      listActive(): SessionActivityRow[] {
        return db
          .prepare("SELECT * FROM session_activity WHERE state IN ('countdown','running')")
          .all() as SessionActivityRow[];
      },
      /** Sessions ayant une activité en décompte ou en cours (pour l'horloge globale). */
      activeSessionIds(): string[] {
        const rows = db
          .prepare(
            "SELECT DISTINCT session_id FROM session_activity WHERE state IN ('countdown','running')",
          )
          .all() as { session_id: string }[];
        return rows.map((r) => r.session_id);
      },
      /** Activité actuellement non terminée (décompte/en cours/en pause) d'une session. */
      currentLocking(sessionId: string): SessionActivityRow | undefined {
        return db
          .prepare(
            "SELECT * FROM session_activity WHERE session_id = ? AND state IN ('countdown','running','paused') ORDER BY position LIMIT 1",
          )
          .get(sessionId) as SessionActivityRow | undefined;
      },
      updateState(id: string, state: ActivityState, patch: Partial<SessionActivityRow> = {}): void {
        db.prepare(
          `UPDATE session_activity SET state = ?,
             started_at = COALESCE(?, started_at),
             deadline_at = COALESCE(?, deadline_at),
             closed_at = COALESCE(?, closed_at)
           WHERE id = ?`,
        ).run(state, patch.started_at ?? null, patch.deadline_at ?? null, patch.closed_at ?? null, id);
      },
    },
  };
}

export type Repositories = ReturnType<typeof makeRepositories>;
