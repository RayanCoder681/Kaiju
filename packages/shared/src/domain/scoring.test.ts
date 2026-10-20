import { describe, it, expect } from 'vitest';
import {
  computeQuizScore,
  rankEntries,
  DEFAULT_SCORE_RULES,
  type ScoreRules,
  type ScoreInput,
} from './scoring.js';

const baseInput = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  correctChoiceIndexes: [0],
  selectedChoiceIndexes: [0],
  totalTimeMs: 30_000,
  timeRemainingMs: 15_000,
  totalChoices: 4,
  ...over,
});

describe('computeQuizScore — choix unique', () => {
  it('attribue les points de base pour une bonne réponse, sans bonus par défaut', () => {
    const r = computeQuizScore(baseInput(), DEFAULT_SCORE_RULES);
    expect(r.total).toBe(100);
    expect(r.speedBonusAwarded).toBe(0);
  });

  it('attribue 0 pour une mauvaise réponse', () => {
    const r = computeQuizScore(baseInput({ selectedChoiceIndexes: [1] }), DEFAULT_SCORE_RULES);
    expect(r.total).toBe(0);
  });

  it('ne descend jamais sous 0 même avec pénalité', () => {
    const rules: ScoreRules = { ...DEFAULT_SCORE_RULES, wrongPenalty: 250 };
    const r = computeQuizScore(baseInput({ selectedChoiceIndexes: [1] }), rules);
    expect(r.total).toBe(0);
    expect(r.penaltyApplied).toBe(250);
  });
});

describe('computeQuizScore — bonus de rapidité', () => {
  it('répartit le bonus linéairement selon le temps restant', () => {
    const rules: ScoreRules = { ...DEFAULT_SCORE_RULES, speedBonusMax: 50 };
    // 15s restant sur 30s => moitié du bonus
    const r = computeQuizScore(baseInput(), rules);
    expect(r.speedBonusAwarded).toBe(25);
    expect(r.total).toBe(125);
  });

  it("n'accorde aucun bonus à une mauvaise réponse", () => {
    const rules: ScoreRules = { ...DEFAULT_SCORE_RULES, speedBonusMax: 50 };
    const r = computeQuizScore(baseInput({ selectedChoiceIndexes: [2] }), rules);
    expect(r.speedBonusAwarded).toBe(0);
    expect(r.total).toBe(0);
  });
});

describe('computeQuizScore — choix multiples & crédit partiel', () => {
  it('tout-ou-rien par défaut', () => {
    const r = computeQuizScore(
      baseInput({ correctChoiceIndexes: [0, 2], selectedChoiceIndexes: [0] }),
      DEFAULT_SCORE_RULES,
    );
    expect(r.total).toBe(0);
  });

  it('crédit partiel linéaire : une bonne sur deux => 50 %', () => {
    const rules: ScoreRules = { ...DEFAULT_SCORE_RULES, partialCredit: 'linear' };
    const r = computeQuizScore(
      baseInput({ correctChoiceIndexes: [0, 2], selectedChoiceIndexes: [0] }),
      rules,
    );
    expect(r.correctness).toBeCloseTo(0.5);
    expect(r.total).toBe(50);
  });

  it('crédit partiel linéaire : une bonne + une mauvaise => 0', () => {
    const rules: ScoreRules = { ...DEFAULT_SCORE_RULES, partialCredit: 'linear' };
    const r = computeQuizScore(
      baseInput({ correctChoiceIndexes: [0, 2], selectedChoiceIndexes: [0, 1] }),
      rules,
    );
    expect(r.total).toBe(0);
  });
});

describe('rankEntries — départage des égalités', () => {
  it('ordonne par score, puis temps cumulé, puis ordre d’arrivée', () => {
    const ranked = rankEntries([
      { participantId: 'c', totalScore: 100, cumulativeAnswerTimeMs: 5000, joinOrder: 3 },
      { participantId: 'a', totalScore: 100, cumulativeAnswerTimeMs: 4000, joinOrder: 1 },
      { participantId: 'b', totalScore: 100, cumulativeAnswerTimeMs: 4000, joinOrder: 2 },
      { participantId: 'd', totalScore: 150, cumulativeAnswerTimeMs: 9000, joinOrder: 4 },
    ]);
    expect(ranked.map((e) => e.participantId)).toEqual(['d', 'a', 'b', 'c']);
  });
});
