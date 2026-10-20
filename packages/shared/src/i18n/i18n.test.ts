import { describe, it, expect } from 'vitest';
import { DICTIONARIES, translate, makeTranslator } from './dictionaries.js';

describe('i18n', () => {
  it('FR et EN couvrent exactement les mêmes clés', () => {
    const fr = Object.keys(DICTIONARIES.fr).sort();
    const en = Object.keys(DICTIONARIES.en).sort();
    expect(en).toEqual(fr);
  });

  it('traduit selon la locale', () => {
    expect(translate('fr', 'session.state.active')).toBe('En direct');
    expect(translate('en', 'session.state.active')).toBe('Live');
  });

  it('le traducteur lié fonctionne', () => {
    const t = makeTranslator('fr');
    expect(t('common.save')).toBe('Enregistrer');
  });
});
