import { useSearchParams } from 'react-router-dom';
import { Shell } from '../ui/Shell.js';
import { useI18n } from '../ui/I18nProvider.js';

/**
 * Entrée participant — coquille de la Phase 1.
 * La connexion réelle (validation du code, pseudonyme, jeton de reconnexion)
 * est implémentée en Phase 2.
 */
export function Join() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';

  return (
    <Shell surfaceLabel="Participant">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-2xl font-bold tracking-tight">{t('common.join')}</h1>
        {code && (
          <p className="mt-2 text-sm text-muted">
            Code :{' '}
            <span className="font-mono text-base tracking-widest text-fg">{code}</span>
          </p>
        )}
        <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm text-muted">
          <p className="font-mono text-xs uppercase tracking-wider text-brand">Phase 1 — Fondations</p>
          <p className="mt-2">
            La saisie du pseudonyme et l'entrée en session seront actives en Phase 2.
          </p>
        </div>
      </div>
    </Shell>
  );
}
