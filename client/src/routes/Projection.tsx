import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Logo } from '../ui/Logo.js';
import { useI18n } from '../ui/I18nProvider.js';
import type { SessionState } from '@kaiju/shared';

/**
 * Écran de projection — lisible de loin, SANS contrôle admin ni donnée privée.
 * Phase 2 : affiche le titre et le code. Le rendu des activités en direct arrive en Phase 3.
 */
export function Projection() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const code = (params.get('code') ?? '').toUpperCase();
  const [session, setSession] = useState<{ title: string; state: SessionState } | null>(null);

  useEffect(() => {
    if (!code) return;
    void (async () => {
      try {
        const p = await api.get<{ session: { title: string; state: SessionState } }>(
          `/api/join/preview/${code}`,
        );
        setSession(p.session);
      } catch {
        setSession(null);
      }
    })();
  }, [code]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-8 text-center text-fg">
      <div className="flex items-center gap-3">
        <Logo size={48} />
        <span className="font-display text-4xl font-bold tracking-tight">Kaiju</span>
      </div>

      {session ? (
        <>
          <h1 className="mt-10 font-display text-5xl font-bold leading-tight tracking-tight">
            {session.title}
          </h1>
          <p className="mt-4 font-mono text-sm uppercase tracking-[0.3em] text-muted">
            {t(`session.state.${session.state}` as const)}
          </p>
        </>
      ) : (
        <p className="mt-10 text-muted">En attente de la session.</p>
      )}

      {code && (
        <div className="mt-16">
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-brand">Code de connexion</p>
          <p className="mt-2 font-mono text-7xl font-bold tracking-[0.15em]">{code}</p>
        </div>
      )}
    </div>
  );
}
