import type { Config } from 'tailwindcss';

/**
 * Les couleurs pointent vers les variables CSS --kj-* définies dans src/index.css,
 * elles-mêmes alignées sur packages/shared/src/theme/tokens.ts (source de vérité).
 * Le basculement white/dark se fait via l'attribut data-theme sur <html>.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--kj-color-bg)',
        surface: {
          DEFAULT: 'var(--kj-color-surface)',
          elevated: 'var(--kj-color-surface-elevated)',
        },
        border: 'var(--kj-color-border)',
        fg: 'var(--kj-color-text)',
        muted: 'var(--kj-color-text-muted)',
        brand: {
          DEFAULT: 'var(--kj-color-brand)',
          hover: 'var(--kj-color-brand-hover)',
          contrast: 'var(--kj-color-brand-contrast)',
          soft: 'var(--kj-color-brand-soft)',
        },
        accent: 'var(--kj-color-accent)',
        danger: 'var(--kj-color-danger)',
        success: 'var(--kj-color-success)',
        warning: 'var(--kj-color-warning)',
      },
      fontFamily: {
        display: ['Space Grotesk', 'Segoe UI', 'system-ui', 'sans-serif'],
        body: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        md: '10px',
        lg: '16px',
      },
    },
  },
  plugins: [],
} satisfies Config;
