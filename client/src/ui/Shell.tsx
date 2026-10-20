import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo.js';
import { ThemeToggle, LocaleToggle } from './Controls.js';

/** En-tête commun aux surfaces organisateur/accueil (jamais sur la projection). */
export function Shell({ children, surfaceLabel }: { children: ReactNode; surfaceLabel?: string }) {
  return (
    <div className="min-h-full bg-bg text-fg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Logo />
            <span className="font-display text-lg font-bold tracking-tight">Kaiju</span>
            {surfaceLabel && (
              <span className="ml-2 rounded-md bg-brand-soft px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-brand">
                {surfaceLabel}
              </span>
            )}
          </Link>
          <div className="flex items-center gap-2">
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
