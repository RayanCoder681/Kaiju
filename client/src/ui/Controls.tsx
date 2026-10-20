import { useTheme } from './ThemeProvider.js';
import { useI18n } from './I18nProvider.js';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Passer en thème clair' : 'Passer en thème sombre'}
      className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-fg"
    >
      {isDark ? 'Thème · Dark' : 'Thème · White'}
    </button>
  );
}

export function LocaleToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
      aria-label="Changer de langue"
      className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-fg"
    >
      {locale.toUpperCase()}
    </button>
  );
}
