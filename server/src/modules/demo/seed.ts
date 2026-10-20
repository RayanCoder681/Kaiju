import type { Repositories } from '../../db/repositories.js';
import { createSession } from '../sessions/service.js';
import { createLibraryActivity, attachActivity } from '../activities/service.js';
import { setupOrganizer, setupNeeded } from '../auth/service.js';

/**
 * Données de démonstration — clairement identifiées (titres « [DÉMO] ») et supprimables.
 * Fonctionnent hors ligne. N'affectent pas les vraies sessions.
 * Idempotent : ne recrée pas si une session [DÉMO] existe déjà.
 */
export async function seedDemo(repos: Repositories): Promise<{ created: boolean; code?: string }> {
  // Compte organisateur de démo si aucun compte n'existe.
  if (setupNeeded(repos)) {
    await setupOrganizer(repos, {
      username: 'demo',
      password: 'demo-kaiju-2026',
      displayName: 'Organisateur Démo',
    });
  }

  const existing = repos.session.listRecent().find((s) => s.title.startsWith('[DÉMO]'));
  if (existing) return { created: false, code: existing.code };

  const session = createSession(repos, {
    title: '[DÉMO] TD Systèmes Distribués',
    description: 'Session de démonstration Kaiju',
    contentLocale: 'fr',
    anonymous: false,
    quickStart: false,
  });

  // Quiz de démo.
  const quiz = createLibraryActivity(repos, {
    type: 'quiz',
    title: '[DÉMO] Complexité algorithmique',
    format: 'single',
    question: 'Quelle est la complexité moyenne d’une recherche dans un arbre binaire équilibré ?',
    choices: [{ text: 'O(1)' }, { text: 'O(log n)' }, { text: 'O(n)' }, { text: 'O(n log n)' }],
    correctIndexes: [1],
    explanation: 'Un arbre équilibré a une hauteur en O(log n), d’où une recherche en O(log n).',
    timerSec: 30,
    scoreRules: { basePoints: 100, speedBonusMax: 50, partialCredit: 'none', wrongPenalty: 0 },
    presentation: 'both',
    resultVisibility: 'on_close',
    contentLocale: 'fr',
  });
  attachActivity(repos, session.id, { libraryId: quiz.id });

  // Sondage de démo.
  const poll = createLibraryActivity(repos, {
    type: 'poll',
    title: '[DÉMO] Baromètre de compréhension',
    format: 'scale',
    question: 'À quel point le concept de consensus distribué est-il clair pour vous ?',
    choices: [],
    timerSec: 60,
    presentation: 'both',
    resultVisibility: 'immediate',
    contentLocale: 'fr',
  });
  attachActivity(repos, session.id, { libraryId: poll.id });

  // Q&A de démo.
  const qa = createLibraryActivity(repos, {
    type: 'qa',
    title: '[DÉMO] Questions libres',
    allowAnonymous: true,
    contentLocale: 'fr',
  });
  attachActivity(repos, session.id, { libraryId: qa.id });

  return { created: true, code: session.code };
}
