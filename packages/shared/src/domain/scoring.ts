/**
 * Calcul de score — règle métier critique.
 *
 * Le SERVEUR est seul juge : cette fonction pure est exécutée côté serveur,
 * la formule est enregistrée avec l'activité (snapshot) et permet de recalculer
 * les scores de façon reproductible. Elle est testée (voir scoring.test.ts).
 *
 * Partagée afin que la console/projection puissent expliquer la formule,
 * mais jamais pour faire autorité côté client.
 */

/** Barème et options de score d'une activité quiz. */
export interface ScoreRules {
  /** Points de base pour une bonne réponse. */
  basePoints: number;
  /** Bonus de rapidité maximal (0 = désactivé). Réparti linéairement selon le temps restant. */
  speedBonusMax: number;
  /**
   * Crédit partiel pour les choix multiples :
   * - 'none'  : tout ou rien (toutes les bonnes cases, aucune mauvaise).
   * - 'linear': proportion de bonnes cases, moins les mauvaises cochées (borné à 0).
   */
  partialCredit: 'none' | 'linear';
  /** Pénalité pour mauvaise réponse (valeur positive soustraite). 0 par défaut. */
  wrongPenalty: number;
}

export const DEFAULT_SCORE_RULES: ScoreRules = {
  basePoints: 100,
  speedBonusMax: 0,
  partialCredit: 'none',
  wrongPenalty: 0,
};

export interface ScoreInput {
  /** Index des choix corrects (dans l'ordre de l'activité). */
  correctChoiceIndexes: number[];
  /** Index des choix sélectionnés par le participant. */
  selectedChoiceIndexes: number[];
  /** Temps total alloué en millisecondes (minuteur de l'activité). */
  totalTimeMs: number;
  /** Temps restant au moment de la soumission, en millisecondes (calculé serveur). */
  timeRemainingMs: number;
  /** Nombre total de choix proposés (pour le crédit partiel). */
  totalChoices: number;
}

export interface ScoreBreakdown {
  correctness: number; // 0..1
  basePointsAwarded: number;
  speedBonusAwarded: number;
  penaltyApplied: number;
  total: number; // jamais négatif
}

/** Correction exacte (tous les bons choix, aucun mauvais). */
function isFullyCorrect(correct: number[], selected: number[]): boolean {
  const c = new Set(correct);
  const s = new Set(selected);
  if (c.size !== s.size) return false;
  for (const v of c) if (!s.has(v)) return false;
  return true;
}

/** Fraction de justesse (0..1) selon la politique de crédit partiel. */
function correctnessFraction(input: ScoreInput, rules: ScoreRules): number {
  const correct = new Set(input.correctChoiceIndexes);
  const selected = input.selectedChoiceIndexes;

  if (rules.partialCredit === 'none') {
    return isFullyCorrect(input.correctChoiceIndexes, selected) ? 1 : 0;
  }

  // linear : (bonnes cochées - mauvaises cochées) / nb de bonnes, borné [0,1]
  if (correct.size === 0) return 0;
  let good = 0;
  let bad = 0;
  for (const idx of selected) {
    if (correct.has(idx)) good++;
    else bad++;
  }
  const frac = (good - bad) / correct.size;
  return Math.max(0, Math.min(1, frac));
}

/**
 * Calcule le score d'une soumission de quiz de façon déterministe.
 * Résultat arrondi à l'entier, borné à >= 0.
 */
export function computeQuizScore(input: ScoreInput, rules: ScoreRules): ScoreBreakdown {
  const correctness = correctnessFraction(input, rules);

  const basePointsAwarded = Math.round(rules.basePoints * correctness);

  // Bonus de rapidité : linéaire sur le temps restant, uniquement si réponse (au moins partiellement) correcte.
  let speedBonusAwarded = 0;
  if (rules.speedBonusMax > 0 && correctness > 0 && input.totalTimeMs > 0) {
    const ratio = Math.max(0, Math.min(1, input.timeRemainingMs / input.totalTimeMs));
    speedBonusAwarded = Math.round(rules.speedBonusMax * ratio * correctness);
  }

  // Pénalité : appliquée uniquement si la réponse est totalement fausse.
  let penaltyApplied = 0;
  if (rules.wrongPenalty > 0 && correctness === 0 && input.selectedChoiceIndexes.length > 0) {
    penaltyApplied = rules.wrongPenalty;
  }

  const total = Math.max(0, basePointsAwarded + speedBonusAwarded - penaltyApplied);

  return { correctness, basePointsAwarded, speedBonusAwarded, penaltyApplied, total };
}

/**
 * Départage des égalités (ordre de priorité, documenté et testé) :
 *   1. Score total décroissant.
 *   2. Temps de réponse cumulé croissant (plus rapide d'abord).
 *   3. Ordre d'arrivée croissant (premier inscrit d'abord) — tie-break final stable.
 */
export interface RankableEntry {
  participantId: string;
  totalScore: number;
  cumulativeAnswerTimeMs: number;
  joinOrder: number;
}

export function rankEntries<T extends RankableEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.cumulativeAnswerTimeMs !== b.cumulativeAnswerTimeMs)
      return a.cumulativeAnswerTimeMs - b.cumulativeAnswerTimeMs;
    return a.joinOrder - b.joinOrder;
  });
}
