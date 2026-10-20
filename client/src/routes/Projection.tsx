import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { connectSocket, emitAck, type KaijuSocket } from '../lib/socket.js';
import { Logo } from '../ui/Logo.js';
import { useI18n } from '../ui/I18nProvider.js';
import type { PublicActivityView, AggregateResults, SessionState } from '@kaiju/shared';

/**
 * Écran de projection — lisible de loin, SANS contrôle admin ni donnée privée.
 * Résultats et corrigés affichés uniquement après publication par l'organisateur.
 */
export function Projection() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const code = (params.get('code') ?? '').toUpperCase();
  const socketRef = useRef<KaijuSocket | null>(null);
  const [session, setSession] = useState<{ title: string; state: SessionState } | null>(null);
  const [activity, setActivity] = useState<PublicActivityView | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [results, setResults] = useState<AggregateResults | null>(null);

  useEffect(() => {
    if (!code) return;
    void api
      .get<{ session: { title: string; state: SessionState } }>(`/api/join/preview/${code}`)
      .then((p) => setSession(p.session))
      .catch(() => setSession(null));

    const socket = connectSocket();
    socketRef.current = socket;
    socket.on('connect', () => void emitAck(socket, 'projection:hello', { code }));
    socket.on('activity:changed', ({ activity: a }) => {
      setActivity(a);
      setResults(null);
    });
    socket.on('activity:tick', ({ remainingMs }) => setRemaining(remainingMs));
    socket.on('results:update', (r) => setResults(r));
    return () => {
      socket.disconnect();
    };
  }, [code]);

  const seconds = remaining !== null ? Math.ceil(remaining / 1000) : null;
  const total = results?.choiceCounts?.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-10 text-center text-fg">
      {!activity ? (
        <>
          <div className="flex items-center gap-3">
            <Logo size={48} />
            <span className="font-display text-4xl font-bold tracking-tight">Kaiju</span>
          </div>
          {session && (
            <>
              <h1 className="mt-10 font-display text-5xl font-bold leading-tight tracking-tight">
                {session.title}
              </h1>
              <p className="mt-4 font-mono text-sm uppercase tracking-[0.3em] text-muted">
                {t(`session.state.${session.state}` as const)}
              </p>
            </>
          )}
          {code && (
            <div className="mt-16">
              <p className="font-mono text-sm uppercase tracking-[0.3em] text-brand">Code de connexion</p>
              <p className="mt-2 font-mono text-7xl font-bold tracking-[0.15em]">{code}</p>
            </div>
          )}
        </>
      ) : (
        <div className="w-full max-w-4xl">
          <div className="mb-8 flex items-center justify-between">
            <span className="font-mono text-sm uppercase tracking-[0.3em] text-muted">
              {t(`activity.state.${activity.state}` as const)}
            </span>
            {activity.state === 'running' && seconds !== null && (
              <span className={`font-mono text-5xl font-bold ${seconds <= 5 ? 'text-danger' : 'text-brand'}`}>
                {seconds}s
              </span>
            )}
          </div>
          <h1 className="font-display text-5xl font-bold leading-tight tracking-tight">
            {activity.question}
          </h1>
          <div className="mt-10 space-y-3 text-left">
            {activity.choices?.map((c, i) => {
              const count = results?.choiceCounts?.[i] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const correct = results?.correctIndexes?.includes(i);
              return (
                <div
                  key={i}
                  className={`relative overflow-hidden rounded-lg border px-6 py-4 text-2xl ${
                    correct ? 'border-success' : 'border-border'
                  }`}
                >
                  {results && (
                    <div
                      className="absolute inset-y-0 left-0 bg-brand-soft"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                  )}
                  <div className="relative flex justify-between">
                    <span>{c.text}</span>
                    {results && <span className="font-mono text-muted">{pct}%</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {results?.explanation && (
            <p className="mt-8 rounded-lg bg-surface-elevated p-5 text-xl text-muted">
              {results.explanation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
