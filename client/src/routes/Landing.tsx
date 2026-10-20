import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../ui/Shell.js';
import { useI18n } from '../ui/I18nProvider.js';

export function Landing() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean) navigate(`/join?code=${encodeURIComponent(clean)}`);
  };

  return (
    <Shell>
      <section className="mx-auto max-w-xl">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-brand">
          {t('app.tagline')}
        </p>
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight">
          Participez en direct.
        </h1>

        <form onSubmit={onSubmit} className="mt-8 rounded-lg border border-border bg-surface p-5">
          <label htmlFor="code" className="block font-mono text-xs uppercase tracking-wider text-muted">
            {t('join.enterCode')}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="EX : 739421"
              autoComplete="off"
              className="flex-1 rounded-md border border-border bg-bg px-3 py-2 font-mono text-lg tracking-widest text-fg outline-none focus:border-brand"
            />
            <button
              type="submit"
              className="rounded-md bg-brand px-5 py-2 font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              {t('common.join')}
            </button>
          </div>
        </form>

        <div className="mt-6 text-sm text-muted">
          <a href="/host" className="text-brand hover:underline">
            Accès organisateur →
          </a>
        </div>
      </section>
    </Shell>
  );
}
