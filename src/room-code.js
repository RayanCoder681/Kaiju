// Kaiju — génération des codes de session à 4 chiffres, sans collision.
import { randomInt } from 'node:crypto';

export const CODE_MIN = 1000; // pas de zéro initial : évite les confusions à la saisie
export const CODE_MAX = 9999;
export const CODE_SPACE = CODE_MAX - CODE_MIN + 1; // 9000 codes possibles

/**
 * @param {{has(code: string): boolean, size: number}} activeCodes  Map ou Set des sessions vivantes
 * @param {() => number} [rand]  injecter pour les tests ; par défaut crypto.randomInt
 * @returns {string}
 * Lève une erreur si l'espace est quasi saturé (bien au-delà d'un usage en classe).
 */
export function generateRoomCode(activeCodes, rand = () => randomInt(CODE_MIN, CODE_MAX + 1)) {
  if (activeCodes.size >= CODE_SPACE * 0.9) {
    throw new Error('Trop de sessions actives : impossible de générer un code libre.');
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = String(rand());
    if (!activeCodes.has(code)) return code;
  }
  // Repli déterministe : balayage depuis un point aléatoire.
  const start = rand() - CODE_MIN;
  for (let i = 0; i < CODE_SPACE; i++) {
    const code = String(CODE_MIN + ((start + i) % CODE_SPACE));
    if (!activeCodes.has(code)) return code;
  }
  throw new Error('Aucun code libre.');
}

export function isValidRoomCode(value) {
  return typeof value === 'string' && /^[1-9]\d{3}$/.test(value);
}
