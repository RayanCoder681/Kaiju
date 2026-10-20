import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useI18n } from '../../ui/I18nProvider.js';
import { Card, Button, Input, Field, Badge } from '../../ui/primitives.js';
import type { SessionState } from '@kaiju/shared';

interface SessionView {
  id: string;
  code: string;
  title: string;
  state: SessionState;
  createdAt: number;
}

export function Dashboard({ organizerName }: { organizerName: string }) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (): Promise<void> => {
    const res = await api.get<{ sessions: SessionView[] }>('/api/sessions');
    setSessions(res.sessions);
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async (e: FormEvent, quickStart: boolean): Promise<void> => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/sessions', { title: title.trim(), quickStart });
      setTitle('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Bonjour {organizerName}</h1>
          <p className="text-sm text-muted">Vos sessions interactives</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/host/diagnostics"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-elevated"
          >
            Diagnostic
          </Link>
          <LogoutButton />
        </div>
      </div>

      <Card className="mb-8">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Nouvelle session — titre">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="TD Systèmes Distribués"
                maxLength={140}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={(e) => create(e, true)} disabled={busy || !title.trim()}>
              Démarrer maintenant
            </Button>
            <Button variant="secondary" onClick={(e) => create(e, false)} disabled={busy || !title.trim()}>
              Préparer
            </Button>
          </div>
        </form>
      </Card>

      <h2 className="mb-3 font-display text-lg font-semibold">Historique</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted">{t('common.loading') === '' ? '' : 'Aucune session pour le moment.'}</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                to={`/host/sessions/${s.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-elevated"
              >
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="font-mono text-xs text-muted">{t(`session.state.${s.state}` as const)}</div>
                </div>
                <Badge>{s.code}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LogoutButton() {
  const logout = async (): Promise<void> => {
    await api.post('/api/auth/logout');
    window.location.reload();
  };
  return (
    <Button variant="secondary" onClick={logout}>
      Déconnexion
    </Button>
  );
}
