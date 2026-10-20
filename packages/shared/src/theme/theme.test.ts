import { describe, it, expect } from 'vitest';
import { THEMES, themeCssVariables, WHITE_THEME, DARK_THEME } from './tokens.js';

describe('thèmes Kaiju', () => {
  it('les deux thèmes exposent exactement les mêmes clés de couleur', () => {
    const whiteKeys = Object.keys(WHITE_THEME.color).sort();
    const darkKeys = Object.keys(DARK_THEME.color).sort();
    expect(darkKeys).toEqual(whiteKeys);
  });

  it('génère des variables CSS --kj-color-* pour chaque thème', () => {
    const vars = themeCssVariables('dark');
    expect(vars['--kj-color-bg']).toBe('#0B0F14');
    expect(vars['--kj-color-brand']).toBe('#22C55E');
  });

  it('le thème clair reprend le vert de marque des maquettes', () => {
    expect(THEMES.white.color.brand).toBe('#16A34A');
  });
});
