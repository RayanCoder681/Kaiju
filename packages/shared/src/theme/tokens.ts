/**
 * Identité visuelle Kaiju — source de vérité unique des couleurs.
 *
 * Deux thèmes :
 *  - « white » : extrait des maquettes de référence (fond clair, vert Kaiju).
 *  - « dark »  : noir-ardoise (slate) associé, pivot = le vert de marque.
 *
 * Les variables CSS de client/src/index.css reflètent ces valeurs
 * (mêmes clés, préfixe --kj-). La parité est vérifiée par theme.test.ts.
 */

export type ThemeName = 'white' | 'dark';

export interface ThemeTokens {
  /** Couleurs sémantiques (valeurs CSS : hex ou rgba). */
  color: {
    'bg': string; // fond application
    'surface': string; // cartes
    'surface-elevated': string; // sur-couche / contrôles
    'border': string;
    'text': string; // texte principal
    'text-muted': string; // texte secondaire
    'brand': string; // vert Kaiju primaire
    'brand-hover': string;
    'brand-contrast': string; // texte sur fond vert plein
    'brand-soft': string; // halo / fond de pastille vert
    'accent': string; // indigo secondaire
    'danger': string; // rouge cinabre (urgence/alerte)
    'success': string;
    'warning': string;
  };
}

/** Thème clair — repris fidèlement des 5 maquettes. */
export const WHITE_THEME: ThemeTokens = {
  color: {
    'bg': '#F8FAFC',
    'surface': '#FFFFFF',
    'surface-elevated': '#F1F5F9',
    'border': '#E2E8F0',
    'text': '#0F172A',
    'text-muted': '#64748B',
    'brand': '#16A34A',
    'brand-hover': '#15803D',
    'brand-contrast': '#FFFFFF',
    'brand-soft': '#DCFCE7',
    'accent': '#6366F1',
    'danger': '#DC2626',
    'success': '#16A34A',
    'warning': '#D97706',
  },
};

/** Thème sombre — noir-ardoise (slate neutre), pivot vert de marque remonté pour le contraste. */
export const DARK_THEME: ThemeTokens = {
  color: {
    'bg': '#0B0F14', // noir-ardoise
    'surface': '#111820',
    'surface-elevated': '#1A232D',
    'border': '#26323E',
    'text': '#E6EDF3',
    'text-muted': '#8B9AA7',
    'brand': '#22C55E', // remonté pour rester lisible sur fond sombre
    'brand-hover': '#16A34A',
    'brand-contrast': '#04120A',
    'brand-soft': 'rgba(34, 197, 94, 0.14)',
    'accent': '#818CF8',
    'danger': '#F87171',
    'success': '#22C55E',
    'warning': '#FBBF24',
  },
};

export const THEMES: Record<ThemeName, ThemeTokens> = {
  white: WHITE_THEME,
  dark: DARK_THEME,
};

/** Échelle verte de marque (identique aux deux thèmes — c'est le pivot de l'identité). */
export const BRAND_GREEN_SCALE = {
  50: '#F0FDF4',
  100: '#DCFCE7',
  200: '#BBF7D0',
  300: '#86EFAC',
  400: '#4ADE80',
  500: '#22C55E',
  600: '#16A34A',
  700: '#15803D',
  800: '#166534',
  900: '#14532D',
} as const;

/** Rayons, typographie et élévations partagés (non dépendants du thème). */
export const DESIGN = {
  radius: { sm: '6px', md: '10px', lg: '16px', pill: '9999px' },
  font: {
    /** Titres : grotesque gras (signature des maquettes). */
    display: "'Space Grotesk', 'Segoe UI', system-ui, sans-serif",
    /** Corps : sans-serif neutre. */
    body: "'Inter', 'Segoe UI', system-ui, sans-serif",
    /** Détails techniques / codes / labels (signature monospace des maquettes). */
    mono: "'JetBrains Mono', 'Cascadia Code', ui-monospace, monospace",
  },
} as const;

/** Construit la table de variables CSS (--kj-*) pour un thème donné. */
export function themeCssVariables(theme: ThemeName): Record<string, string> {
  const t = THEMES[theme];
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(t.color)) {
    out[`--kj-color-${key}`] = value;
  }
  return out;
}
