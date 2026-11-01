import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
      <section className="grid gap-10 py-6 md:min-h-[22rem] md:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)] md:items-stretch md:gap-12 md:py-10">
        <div className="landing-arrive flex flex-col justify-center">
          <p className="mb-4 font-mono text-xs uppercase text-brand">
            {t('app.tagline')}
          </p>
          <h1 className="font-display text-5xl font-bold leading-[1.02] md:text-6xl">
            <span className="block">{t('landing.headlineFirst')}</span>
            <span className="block text-brand">{t('landing.headlineSecond')}</span>
          </h1>

          <form onSubmit={onSubmit} className="mt-10 max-w-xl">
            <label htmlFor="code" className="block font-mono text-sm text-muted">
              {t('join.enterCode')}
            </label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="EX : 739421"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-[6px] border border-border bg-surface px-4 py-3 font-mono text-lg text-fg outline-none placeholder:text-muted focus:border-brand"
              />
              <button
                type="submit"
                className="rounded-[6px] bg-brand px-6 py-3 font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
              >
                {t('common.join')}
              </button>
            </div>
          </form>

        </div>

        <aside className="landing-arrive-delayed flex flex-col justify-between border-t border-border pt-6 md:border-l md:border-t-0 md:pl-8 md:pt-3">
          <div>
            <p className="font-mono text-xs uppercase text-muted">{t('landing.organizerLabel')}</p>
            <h2 className="mt-3 font-display text-2xl font-semibold">
              {t('landing.organizerTitle')}
            </h2>
          </div>
          <Link
            to="/host"
            className="mt-8 inline-flex w-fit items-center gap-3 border-b border-brand pb-2 font-semibold text-brand transition-colors hover:text-brand-hover"
          >
            {t('landing.organizerAction')}
            <span aria-hidden="true">→</span>
          </Link>
          <p className="mt-12 font-mono text-xs text-muted">KAIJU / LIVE</p>
        </aside>
      </section>
    </Shell>
  );
}
