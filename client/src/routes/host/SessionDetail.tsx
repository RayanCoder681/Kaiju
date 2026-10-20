import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { connectSocket, emitAck, type KaijuSocket } from '../../lib/socket.js';
import { useI18n } from '../../ui/I18nProvider.js';
import { Card, Button, Badge } from '../../ui/primitives.js';
import {
  SESSION_TRANSITIONS,
  type SessionState,
  type ActivityState,
  type AggregateResults,
} from '@kaiju/shared';
import { QuizQuickForm } from './QuizQuickForm.js';

interface SessionView {
  id: string;
  code: string;
  title: string;
  state: SessionState;
}
interface Connection {
  code: string;
  joinUrl: string | null;
  qrDataUrl: string | null;
  lanAvailable: boolean;
  port: number;
  lanIp: string | null;
}
interface Participant {
  id: string;
  pseudonym: string;
  connected: boolean;
}
interface ActivityView {
  id: string;
  type: string;
  title?: string;
  state: ActivityState;
  snapshot: { title: string };
}

const TRANSITION_LABELS: Record<SessionState, string> = {
  preparation: 'Préparer',
  active: 'Démarrer',
  suspended: 'Suspendre',
  closed: 'Clôturer',
  cancelled: 'Annuler',
};

export function SessionDetail() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const [session, setSession] = useState<SessionView | null>(null);
  const [conn, setConn] = useState<Connection | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [liveResults, setLiveResults] = useState<AggregateResults | null>(null);
  const socketRef = useRef<KaijuSocket | null>(null);

  const loadSession = useCallback(async () => {
    const s = await api.get<{ session: SessionView }>(`/api/sessions/${id}`);
    setSession(s.session);
  }, [id]);

  const loadConnection = useCallback(async () => {
    const c = await api.get<Connection>(`/api/sessions/${id}/connection`);
    setConn(c);
  }, [id]);

  const loadParticipants = useCallback(async () => {
    const p = await api.get<{ participants: Participant[] }>(`/api/sessions/${id}/participants`);
    setParticipants(p.participants);
  }, [id]);

  const loadActivities = useCallback(async () => {
    const a = await api.get<{ activities: ActivityView[] }>(`/api/sessions/${id}/activities`);
    setActivities(a.activities);
  }, [id]);

  useEffect(() => {
    void loadSession();
    void loadConnection();
    void loadActivities();
  }, [loadSession, loadConnection, loadActivities]);

  // Connexion temps réel organisateur : présence, activité et résultats en direct.
  useEffect(() => {
    void loadParticipants();
    const socket = connectSocket();
    socketRef.current = socket;
    socket.on('connect', () => void emitAck(socket, 'host:hello', { sessionId: id }));
    socket.on('participants:update', ({ items }) => {
      if (items) setParticipants(items);
    });
    socket.on('results:update', (r) => setLiveResults(r));
    socket.on('activity:changed', () => {
      setLiveResults(null);
      void loadActivities();
    });
    return () => {
      socket.disconnect();
    };
  }, [id, loadParticipants, loadActivities]);

  const control = async (event: string, payload: unknown): Promise<void> => {
    if (socketRef.current) await emitAck(socketRef.current, event, payload);
    await loadActivities();
  };

  const transition = async (to: SessionState): Promise<void> => {
    if ((to === 'closed' || to === 'cancelled') && !confirm(`Confirmer : ${TRANSITION_LABELS[to]} la session ?`)) {
      return;
    }
    await api.post(`/api/sessions/${id}/transition`, { to });
    await loadSession();
  };

  if (!session) return <p className="text-muted">{t('common.loading')}</p>;

  const allowed = SESSION_TRANSITIONS[session.state];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/host" className="text-sm text-brand hover:underline">
            ← Sessions
          </Link>
          <h1 className="font-display text-xl font-bold tracking-tight">{session.title}</h1>
          <Badge tone={session.state === 'active' ? 'brand' : 'muted'}>
            {t(`session.state.${session.state}` as const)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-muted">Connexion participant</h2>
          <div className="text-center">
            <div className="font-mono text-3xl font-bold tracking-widest">{session.code}</div>
            {conn?.qrDataUrl ? (
              <img src={conn.qrDataUrl} alt="QR de connexion" className="mx-auto mt-3 h-40 w-40 rounded-md bg-white p-1" />
            ) : (
              <p className="mt-3 text-sm text-danger">
                Adresse LAN introuvable — vérifiez le Wi-Fi de cet ordinateur.
              </p>
            )}
            {conn?.joinUrl && <div className="mt-2 break-all font-mono text-xs text-muted">{conn.joinUrl}</div>}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-wider text-muted">Participants</h2>
            <Badge>{participants.length}</Badge>
          </div>
          {participants.length === 0 ? (
            <p className="text-sm text-muted">En attente de connexions…</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>{p.pseudonym}</span>
                  <span className={p.connected ? 'text-success' : 'text-muted'}>
                    {p.connected ? '● connecté' : '○ absent'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-muted">Cycle de vie</h2>
        <div className="flex flex-wrap gap-2">
          {allowed.length === 0 && <span className="text-sm text-muted">Session terminée.</span>}
          {allowed.map((to) => (
            <Button
              key={to}
              variant={to === 'closed' || to === 'cancelled' ? 'danger' : 'primary'}
              onClick={() => transition(to)}
            >
              {TRANSITION_LABELS[to]}
            </Button>
          ))}
          <a
            href={`/projection?code=${session.code}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-elevated"
          >
            Ouvrir la projection ↗
          </a>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted">Activités préparées</h2>
          <Badge>{activities.length}</Badge>
        </div>
        {activities.length > 0 && (
          <ul className="mb-4 space-y-2 text-sm">
            {activities.map((a) => (
              <li key={a.id} className="rounded-md bg-surface-elevated px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>
                    <span className="font-mono text-xs text-muted">{a.type}</span> — {a.snapshot.title}
                  </span>
                  <Badge tone={a.state === 'running' ? 'brand' : 'muted'}>
                    {t(`activity.state.${a.state}` as const)}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(a.state === 'prepared') && (
                    <Button onClick={() => control('host:activity:start', { activityId: a.id })}>
                      Démarrer
                    </Button>
                  )}
                  {a.state === 'running' && (
                    <>
                      <Button variant="secondary" onClick={() => control('host:activity:pause', { activityId: a.id })}>
                        Pause
                      </Button>
                      <Button variant="danger" onClick={() => control('host:activity:close', { activityId: a.id })}>
                        Clôturer
                      </Button>
                    </>
                  )}
                  {a.state === 'paused' && (
                    <Button onClick={() => control('host:activity:resume', { activityId: a.id })}>
                      Reprendre
                    </Button>
                  )}
                  {a.state === 'closed' && (
                    <Button
                      variant="secondary"
                      onClick={() => control('host:results:publish', { activityId: a.id, toProjection: true })}
                    >
                      Publier sur la projection
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {liveResults && (
          <div className="mb-4 rounded-md border border-border p-3">
            <p className="mb-2 font-mono text-xs uppercase tracking-wider text-muted">
              Résultats en direct — {liveResults.totalResponses} réponse(s)
            </p>
            {liveResults.choiceCounts?.map((count, i) => (
              <div key={i} className="mb-1 flex items-center gap-2 text-sm">
                <span className="w-6 font-mono text-xs text-muted">{i + 1}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-surface-elevated">
                  <div
                    className={`h-full ${liveResults.correctIndexes?.includes(i) ? 'bg-success' : 'bg-brand'}`}
                    style={{
                      width: `${
                        liveResults.totalResponses > 0
                          ? Math.round((count / liveResults.totalResponses) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-xs">{count}</span>
              </div>
            ))}
          </div>
        )}

        <QuizQuickForm sessionId={id} onAdded={loadActivities} />
      </Card>

      <RankingCard sessionId={id} />
    </div>
  );
}

function RankingCard({ sessionId }: { sessionId: string }) {
  const [individual, setIndividual] = useState<{ pseudonym: string; totalScore: number }[]>([]);
  const [teams, setTeams] = useState<{ name: string; totalScore: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async (): Promise<void> => {
    const r = await api.get<{
      individual: { pseudonym: string; totalScore: number }[];
      teams: { name: string; totalScore: number }[];
    }>(`/api/sessions/${sessionId}/ranking`);
    setIndividual(r.individual);
    setTeams(r.teams);
    setLoaded(true);
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted">Classement</h2>
        <Button variant="secondary" onClick={load}>
          Rafraîchir
        </Button>
      </div>
      {!loaded ? (
        <p className="text-sm text-muted">Chargez le classement calculé côté serveur.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-wider text-brand">Individuel</p>
            <ol className="space-y-1 text-sm">
              {individual.slice(0, 10).map((e, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {i + 1}. {e.pseudonym}
                  </span>
                  <span className="font-mono">{e.totalScore}</span>
                </li>
              ))}
              {individual.length === 0 && <li className="text-muted">Aucun score.</li>}
            </ol>
          </div>
          {teams.length > 0 && (
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-wider text-brand">Équipes</p>
              <ol className="space-y-1 text-sm">
                {teams.map((e, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {i + 1}. {e.name}
                    </span>
                    <span className="font-mono">{e.totalScore}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
