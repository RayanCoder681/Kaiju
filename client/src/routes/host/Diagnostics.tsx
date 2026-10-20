import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Card, Button, Badge } from '../../ui/primitives.js';

interface Diag {
  uptimeSec: number;
  dbOk: boolean;
  activeSessions: number;
  connectedParticipants: number;
  lastBackupAt: number | null;
  recentErrors: { at: number; message: string }[];
  limits: Record<string, number>;
}
interface Backup {
  filename: string;
  kind: string;
  bytes: number;
  createdAt: number;
}

export function Diagnostics() {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, b] = await Promise.all([
      api.get<Diag>('/api/maintenance/diagnostics'),
      api.get<{ backups: Backup[] }>('/api/maintenance/backups'),
    ]);
    setDiag(d);
    setBackups(b.backups);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  const backupNow = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.post('/api/maintenance/backup');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const fmt = (ts: number | null): string => (ts ? new Date(ts).toLocaleString() : '—');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/host" className="text-sm text-brand hover:underline">
          ← Sessions
        </Link>
        <h1 className="font-display text-xl font-bold tracking-tight">Diagnostic</h1>
      </div>

      {diag && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Serveur" value={diag.dbOk ? 'OK' : 'Erreur BDD'} tone={diag.dbOk ? 'brand' : 'danger'} />
            <Stat label="Uptime" value={`${Math.floor(diag.uptimeSec / 60)} min`} />
            <Stat label="Sessions actives" value={String(diag.activeSessions)} />
            <Stat label="Connectés" value={String(diag.connectedParticipants)} />
          </div>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase tracking-wider text-muted">Sauvegardes</h2>
              <Button onClick={backupNow} disabled={busy}>
                Sauvegarder maintenant
              </Button>
            </div>
            <p className="mb-3 text-sm text-muted">Dernière : {fmt(diag.lastBackupAt)}</p>
            {backups.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {backups.slice(0, 8).map((b) => (
                  <li key={b.filename} className="flex items-center justify-between">
                    <span className="font-mono text-xs">{b.filename}</span>
                    <span className="text-muted">
                      {(b.bytes / 1024).toFixed(0)} Ko · {b.kind}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aucune sauvegarde.</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-muted">Erreurs récentes</h2>
            {diag.recentErrors.length === 0 ? (
              <p className="text-sm text-muted">Aucune erreur récente.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {diag.recentErrors.slice(-8).reverse().map((e, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="text-danger">{e.message}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{fmt(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'muted' }: { label: string; value: string; tone?: 'brand' | 'muted' | 'danger' }) {
  return (
    <div className="rounded-lg bg-surface-elevated p-3">
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1">
        <Badge tone={tone}>{value}</Badge>
      </div>
    </div>
  );
}
