import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { Shell } from '../ui/Shell.js';
import { useI18n } from '../ui/I18nProvider.js';
import { Card, Button, Input, Field, Badge } from '../ui/primitives.js';
import type { MessageKey, SessionState } from '@kaiju/shared';

interface Joined {
  participantId: string;
  reconnectToken: string;
  pseudonym: string;
  session: { id: string; title: string; state: SessionState };
}

function storageKey(code: string): string {
  return `kaiju-participant-${code}`;
}

export function Join() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const code = (params.get('code') ?? '').toUpperCase();
  const [pseudonym, setPseudonym] = useState('');
  const [joined, setJoined] = useState<Joined | null>(null);
  const [preview, setPreview] = useState<{ title: string; state: SessionState } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Aperçu de la session + reconnexion automatique si un jeton est stocké.
  useEffect(() => {
    if (!code) return;
    void (async () => {
      try {
        const p = await api.get<{ session: { title: string; state: SessionState } }>(
          `/api/join/preview/${code}`,
        );
        setPreview(p.session);
      } catch (err) {
        setError(err instanceof ApiError ? t(err.errorKey as MessageKey) : t('error.internal'));
        return;
      }
      const saved = localStorage.getItem(storageKey(code));
      if (saved) {
        try {
          const { reconnectToken, pseudonym: pn } = JSON.parse(saved) as {
            reconnectToken: string;
            pseudonym: string;
          };
          const res = await api.post<Joined>('/api/join', { code, pseudonym: pn, reconnectToken });
          setJoined(res);
        } catch {
          localStorage.removeItem(storageKey(code));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!pseudonym.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<Joined>('/api/join', { code, pseudonym: pseudonym.trim() });
      localStorage.setItem(
        storageKey(code),
        JSON.stringify({ reconnectToken: res.reconnectToken, pseudonym: res.pseudonym }),
      );
      setJoined(res);
    } catch (err) {
      setError(err instanceof ApiError ? t(err.errorKey as MessageKey) : t('error.internal'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell surfaceLabel="Participant">
      <div className="mx-auto max-w-md">
        {!code && <p className="text-danger">{t('error.codeInvalid')}</p>}

        {code && !joined && (
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              {preview?.title ?? t('common.join')}
            </h1>
            <p className="mt-1 font-mono text-sm tracking-widest text-muted">{code}</p>
            <Card className="mt-6">
              <form onSubmit={submit} className="space-y-4">
                <Field label={t('join.pseudonym')}>
                  <Input
                    value={pseudonym}
                    onChange={(e) => setPseudonym(e.target.value)}
                    maxLength={40}
                    required
                    autoFocus
                  />
                </Field>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? t('common.loading') : t('common.join')}
                </Button>
              </form>
            </Card>
          </>
        )}

        {joined && (
          <div className="text-center">
            <Badge>{joined.pseudonym}</Badge>
            <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">{joined.session.title}</h1>
            <p className="mt-2 text-muted">{t('join.waiting')}</p>
            <p className="mt-6 font-mono text-xs uppercase tracking-wider text-muted">
              {t(`session.state.${joined.session.state}` as const)}
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}
