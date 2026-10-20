import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Card, Button, Badge } from '../../ui/primitives.js';

interface LibItem {
  id: string;
  type: string;
  title: string;
  used: boolean;
}
interface ImportReport {
  imported: { title: string }[];
  duplicates: { title: string }[];
  errors: { index: number; error: string }[];
}

export function Library() {
  const [items, setItems] = useState<LibItem[]>([]);
  const [query, setQuery] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ activities: LibItem[] }>('/api/activities');
    setItems(r.activities);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const duplicate = async (itemId: string): Promise<void> => {
    await api.post(`/api/activities/${itemId}/duplicate`);
    await load();
  };

  const onImport = async (file: File): Promise<void> => {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setReport({ imported: [], duplicates: [], errors: [{ index: 0, error: 'JSON invalide' }] });
      return;
    }
    const r = await api.post<{ report: ImportReport }>('/api/activities/import', parsed);
    setReport(r.report);
    await load();
  };

  const filtered = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/host" className="text-sm text-brand hover:underline">
          ← Sessions
        </Link>
        <h1 className="font-display text-xl font-bold tracking-tight">Bibliothèque d'activités</h1>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-fg outline-none focus:border-brand"
          />
          <a
            href="/api/activities/export.json"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-elevated"
          >
            Exporter (JSON)
          </a>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Importer (JSON)
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }}
          />
        </div>

        {report && (
          <div className="mb-4 rounded-md border border-border p-3 text-sm">
            <p className="text-success">{report.imported.length} importée(s)</p>
            {report.duplicates.length > 0 && <p className="text-muted">{report.duplicates.length} doublon(s) ignoré(s)</p>}
            {report.errors.length > 0 && (
              <ul className="mt-1 text-danger">
                {report.errors.map((e, i) => (
                  <li key={i}>
                    Ligne {e.index + 1} : {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-sm text-muted">Aucune activité.</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-md bg-surface-elevated px-3 py-2">
                <span className="text-sm">
                  <span className="font-mono text-xs text-muted">{a.type}</span> — {a.title}
                  {a.used && (
                    <span className="ml-2">
                      <Badge tone="muted">utilisée</Badge>
                    </span>
                  )}
                </span>
                <Button variant="secondary" onClick={() => duplicate(a.id)}>
                  Dupliquer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
