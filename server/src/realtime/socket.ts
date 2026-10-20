import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { z } from 'zod';
import {
  zSubmitQuizAnswer,
  zSubmitPollAnswer,
  zSubmitQaQuestion,
  zQaVote,
  type Ack,
} from '@kaiju/shared';
import { getRepositories } from '../context.js';
import { getDb } from '../db/connection.js';
import { authenticate } from '../modules/auth/service.js';
import {
  startActivity,
  closeActivity,
  pauseActivity,
  resumeActivity,
  tickActivity,
  submitQuizAnswer,
  submitPollAnswer,
} from './engine.js';
import {
  submitQuestion,
  voteQuestion,
  moderateQuestion,
  listQuestions,
  type QaStatus,
} from '../modules/qa/service.js';
import {
  rooms,
  broadcastActivity,
  broadcastResults,
  broadcastParticipants,
  publicActivityView,
  type KaijuIo,
} from './live.js';

export type { KaijuIo };

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** Diffuse l'état Q&A à chaque surface selon sa visibilité. */
function broadcastQa(io: KaijuIo, sessionId: string, sacId: string): void {
  const conn = getDb();
  io.to(rooms.host(sessionId)).emit('qa:update', {
    activityId: sacId,
    items: listQuestions(conn, sacId, { includeHidden: true }),
  });
  io.to(rooms.participant(sessionId)).emit('qa:update', {
    activityId: sacId,
    items: listQuestions(conn, sacId, { includeHidden: false }),
  });
  io.to(rooms.projection(sessionId)).emit('qa:update', {
    activityId: sacId,
    items: listQuestions(conn, sacId, { includeHidden: false, onlyProjected: true }),
  });
}

export function attachSocket(httpServer: HttpServer): KaijuIo {
  const io: KaijuIo = new SocketServer(httpServer, { serveClient: false, pingTimeout: 20_000 });
  const repos = getRepositories();

  io.on('connection', (socket) => {
    socket.data.isHost = false;

    /* ─────────── Établissement des surfaces ─────────── */

    socket.on('host:hello', ({ sessionId }, cb) => {
      const token = parseCookie(socket.handshake.headers.cookie, 'kaiju_sid');
      const organizerId = authenticate(repos, token);
      const session = repos.session.findById(sessionId);
      if (!organizerId || !session) return cb({ ok: false, errorKey: 'error.unauthorized' });
      socket.data.isHost = true;
      socket.data.sessionId = sessionId;
      void socket.join(rooms.host(sessionId));
      // État initial.
      const current = repos.sessionActivity.currentLocking(sessionId);
      if (current) socket.emit('activity:changed', { activity: publicActivityView(current) });
      cb({ ok: true });
    });

    socket.on('participant:hello', ({ code, reconnectToken }, cb) => {
      const session = repos.session.findJoinableByCode(code);
      if (!session) return cb({ ok: false, errorKey: 'error.codeInvalid' });
      const participant = repos.participant.findByReconnect(session.id, reconnectToken);
      if (!participant) return cb({ ok: false, errorKey: 'error.unauthorized' });

      socket.data.sessionId = session.id;
      socket.data.participantId = participant.id;
      void socket.join(rooms.participant(session.id));
      repos.participant.setConnected(participant.id, true, Date.now());
      broadcastParticipants(io, repos, session.id);

      const current = repos.sessionActivity.currentLocking(session.id);
      if (current) socket.emit('activity:changed', { activity: publicActivityView(current) });
      cb({ ok: true, participantId: participant.id });
    });

    socket.on('projection:hello', ({ code }, cb) => {
      const session = repos.session.findJoinableByCode(code);
      if (!session) return cb({ ok: false, errorKey: 'error.codeInvalid' });
      socket.data.sessionId = session.id;
      void socket.join(rooms.projection(session.id));
      const current = repos.sessionActivity.currentLocking(session.id);
      if (current) socket.emit('activity:changed', { activity: publicActivityView(current) });
      cb({ ok: true });
    });

    /* ─────────── Commandes organisateur (autorité serveur) ─────────── */

    const requireHostSocket = (cb: (r: Ack) => void): string | null => {
      if (!socket.data.isHost || !socket.data.sessionId) {
        cb({ ok: false, errorKey: 'error.unauthorized' });
        return null;
      }
      return socket.data.sessionId;
    };

    socket.on('host:activity:start', ({ activityId, countdownSec }, cb) => {
      const sessionId = requireHostSocket(cb);
      if (!sessionId) return;
      try {
        const sac = startActivity(repos, activityId, countdownSec ?? 0);
        broadcastActivity(io, sessionId, sac);
        cb({ ok: true });
      } catch {
        cb({ ok: false, errorKey: 'error.validation' });
      }
    });

    socket.on('host:activity:close', ({ activityId }, cb) => {
      const sessionId = requireHostSocket(cb);
      if (!sessionId) return;
      try {
        const sac = closeActivity(repos, activityId);
        broadcastActivity(io, sessionId, sac);
        broadcastResults(io, repos, sessionId, sac);
        cb({ ok: true });
      } catch {
        cb({ ok: false, errorKey: 'error.validation' });
      }
    });

    socket.on('host:activity:pause', ({ activityId }, cb) => {
      const sessionId = requireHostSocket(cb);
      if (!sessionId) return;
      try {
        broadcastActivity(io, sessionId, pauseActivity(repos, activityId));
        cb({ ok: true });
      } catch {
        cb({ ok: false, errorKey: 'error.validation' });
      }
    });

    socket.on('host:activity:resume', ({ activityId }, cb) => {
      const sessionId = requireHostSocket(cb);
      if (!sessionId) return;
      try {
        broadcastActivity(io, sessionId, resumeActivity(repos, activityId));
        cb({ ok: true });
      } catch {
        cb({ ok: false, errorKey: 'error.validation' });
      }
    });

    socket.on('host:results:publish', ({ activityId, toProjection }, cb) => {
      const sessionId = requireHostSocket(cb);
      if (!sessionId) return;
      const db = getDb();
      db.prepare(
        `UPDATE session_activity SET results_published_console = 1,
           results_published_projection = CASE WHEN ? THEN 1 ELSE results_published_projection END
         WHERE id = ?`,
      ).run(toProjection ? 1 : 0, activityId);
      const sac = repos.sessionActivity.findById(activityId);
      if (sac) {
        broadcastResults(io, repos, sessionId, sac);
        io.to(rooms.participant(sessionId)).emit('notice', {
          level: 'info',
          messageKey: 'notice.resultsPublished',
        });
      }
      cb({ ok: true });
    });

    socket.on('host:qa:moderate', (raw, cb) => {
      const sessionId = requireHostSocket(cb);
      if (!sessionId) return;
      const parsed = z
        .object({
          questionId: z.string(),
          activityId: z.string(),
          status: z
            .enum(['pending', 'approved', 'hidden', 'archived', 'answered'])
            .optional(),
          projected: z.boolean().optional(),
        })
        .safeParse(raw);
      if (!parsed.success) return cb({ ok: false, errorKey: 'error.validation' });
      moderateQuestion(getDb(), parsed.data.questionId, {
        status: parsed.data.status as QaStatus | undefined,
        projected: parsed.data.projected,
      });
      broadcastQa(io, sessionId, parsed.data.activityId);
      cb({ ok: true });
    });

    /* ─────────── Soumissions participant (revalidées + fenêtre serveur) ─────────── */

    socket.on('participant:quiz:submit', (raw, cb) => {
      const pid = socket.data.participantId;
      const sessionId = socket.data.sessionId;
      if (!pid || !sessionId) return cb({ ok: false, errorKey: 'error.unauthorized' });
      const parsed = zSubmitQuizAnswer.safeParse(raw);
      if (!parsed.success) return cb({ ok: false, errorKey: 'error.validation' });

      const result = submitQuizAnswer(repos, {
        sessionActivityId: parsed.data.activityId,
        participantId: pid,
        selectedIndexes: parsed.data.selectedIndexes,
        clientSubmissionId: parsed.data.clientSubmissionId,
      });
      // Accusé émis APRÈS écriture durable (ou refus).
      socket.emit('submission:ack', {
        clientSubmissionId: parsed.data.clientSubmissionId,
        accepted: result.accepted,
        reason: result.accepted ? undefined : result.errorKey,
      });
      if (result.accepted) {
        const sac = repos.sessionActivity.findById(parsed.data.activityId);
        if (sac) broadcastResults(io, repos, sessionId, sac);
      }
      cb(result.accepted ? { ok: true } : { ok: false, errorKey: result.errorKey });
    });

    socket.on('participant:poll:submit', (raw, cb) => {
      const pid = socket.data.participantId;
      const sessionId = socket.data.sessionId;
      if (!pid || !sessionId) return cb({ ok: false, errorKey: 'error.unauthorized' });
      const parsed = zSubmitPollAnswer.safeParse(raw);
      if (!parsed.success) return cb({ ok: false, errorKey: 'error.validation' });

      const result = submitPollAnswer(repos, {
        sessionActivityId: parsed.data.activityId,
        participantId: pid,
        selectedIndexes: parsed.data.selectedIndexes,
        text: parsed.data.text,
        scale: parsed.data.scale,
        clientSubmissionId: parsed.data.clientSubmissionId,
      });
      socket.emit('submission:ack', {
        clientSubmissionId: parsed.data.clientSubmissionId,
        accepted: result.accepted,
        reason: result.accepted ? undefined : result.errorKey,
      });
      if (result.accepted) {
        const sac = repos.sessionActivity.findById(parsed.data.activityId);
        if (sac) broadcastResults(io, repos, sessionId, sac);
      }
      cb(result.accepted ? { ok: true } : { ok: false, errorKey: result.errorKey });
    });

    socket.on('participant:qa:submit', (raw, cb) => {
      const pid = socket.data.participantId;
      const sessionId = socket.data.sessionId;
      if (!pid || !sessionId) return cb({ ok: false, errorKey: 'error.unauthorized' });
      const parsed = zSubmitQaQuestion.safeParse(raw);
      if (!parsed.success) return cb({ ok: false, errorKey: 'error.validation' });
      submitQuestion(getDb(), {
        sessionActivityId: parsed.data.activityId,
        participantId: parsed.data.anonymous ? null : pid,
        anonymous: parsed.data.anonymous,
        text: parsed.data.text,
      });
      broadcastQa(io, sessionId, parsed.data.activityId);
      cb({ ok: true });
    });

    socket.on('participant:qa:vote', (raw, cb) => {
      const pid = socket.data.participantId;
      const sessionId = socket.data.sessionId;
      if (!pid || !sessionId) return cb({ ok: false, errorKey: 'error.unauthorized' });
      const parsed = zQaVote.safeParse(raw);
      if (!parsed.success) return cb({ ok: false, errorKey: 'error.validation' });
      // Il faut connaître l'activité pour rediffuser : on la retrouve via la question.
      const row = getDb()
        .prepare('SELECT session_activity_id AS sid FROM qa_question WHERE id = ?')
        .get(parsed.data.questionId) as { sid: string } | undefined;
      voteQuestion(getDb(), parsed.data.questionId, pid);
      if (row) broadcastQa(io, sessionId, row.sid);
      cb({ ok: true });
    });

    /* ─────────── Déconnexion : présence ─────────── */

    socket.on('disconnect', () => {
      const pid = socket.data.participantId;
      const sessionId = socket.data.sessionId;
      if (pid && sessionId) {
        repos.participant.setConnected(pid, false, Date.now());
        broadcastParticipants(io, repos, sessionId);
      }
    });
  });

  startClock(io);
  return io;
}

/** Horloge globale : une fois par seconde, fait avancer les activités et diffuse le décompte. */
let clockTimer: NodeJS.Timeout | null = null;
function startClock(io: KaijuIo): void {
  if (clockTimer) return;
  const repos = getRepositories();
  clockTimer = setInterval(() => {
    const now = Date.now();
    for (const sessionId of repos.sessionActivity.activeSessionIds()) {
      const current = repos.sessionActivity.currentLocking(sessionId);
      if (!current) continue;
      const { changed, sac } = tickActivity(repos, current.id, now);
      if (changed) {
        broadcastActivity(io, sessionId, sac);
        if (sac.state === 'closed') broadcastResults(io, repos, sessionId, sac);
      } else if (sac.deadline_at) {
        const remainingMs = Math.max(0, sac.deadline_at - now);
        const tick = { activityId: sac.id, remainingMs };
        io.to(rooms.host(sessionId)).emit('activity:tick', tick);
        io.to(rooms.participant(sessionId)).emit('activity:tick', tick);
        io.to(rooms.projection(sessionId)).emit('activity:tick', tick);
      }
    }
  }, 1000);
  clockTimer.unref?.();
}

export function stopClock(): void {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}
