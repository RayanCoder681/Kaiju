// Kaiju — calcul des points et classement (module pur, sans dépendance).
// Formule alignée sur celle documentée par Kahoot (support.kahoot.com, article "How points work") :
//   points = round(P × (1 − (t / T) / 2)), P = 1000 par défaut
// => 1000 pour une réponse immédiate (t < 500 ms), 500 à la toute fin du temps.
// t est TOUJOURS mesuré par le serveur (réception − diffusion de la question), jamais fourni par le client.

export const BASE_POINTS = 1000;
export const INSTANT_MS = 500;
export const ANSWER_GRACE_MS = 300; // tolérance réseau après l'échéance (LAN : quelques ms suffisent)

/**
 * @param {{correct: boolean, elapsedMs: number, durationMs: number, basePoints?: number}} p
 * @returns {number} entier entre 0 et basePoints
 */
export function computePoints({ correct, elapsedMs, durationMs, basePoints = BASE_POINTS }) {
  if (!correct || basePoints <= 0) return 0;
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError('durationMs doit être > 0');
  if (!Number.isFinite(elapsedMs)) throw new RangeError('elapsedMs invalide');
  const t = Math.min(Math.max(elapsedMs, 0), durationMs); // une réponse dans la grâce vaut le minimum, pas moins
  if (t < INSTANT_MS) return basePoints;
  return Math.round(basePoints * (1 - t / durationMs / 2));
}

/**
 * Une réponse est recevable si elle arrive avant l'échéance + la tolérance.
 * @param {{receivedAt: number, endsAt: number, graceMs?: number}} p  horloge du serveur (ms)
 */
export function isOnTime({ receivedAt, endsAt, graceMs = ANSWER_GRACE_MS }) {
  return receivedAt <= endsAt + graceMs;
}

/**
 * Classement déterministe :
 *   1. score décroissant
 *   2. temps cumulé des bonnes réponses croissant (le plus rapide gagne)
 *   3. ordre d'arrivée dans la partie (joinedAt) croissant
 * @param {Array<{id: string, nickname: string, score: number, correctTimeMs?: number, joinedAt?: number}>} players
 * @returns {Array<object>} copie triée avec un champ rank (1, 2, 3...)
 */
export function rankPlayers(players) {
  return [...players]
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.correctTimeMs ?? 0) - (b.correctTimeMs ?? 0) ||
        (a.joinedAt ?? 0) - (b.joinedAt ?? 0)
    )
    .map((p, i) => ({ ...p, rank: i + 1 }));
}
