import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { makeRepositories, type Repositories } from '../db/repositories.js';
import { setupNeeded, setupOrganizer, login, authenticate, logout } from './auth/service.js';
import {
  createSession,
  generateUniqueCode,
  transitionSession,
} from './sessions/service.js';
import { joinSession } from './participants/service.js';
import {
  createLibraryActivity,
  attachActivity,
  updateLibraryActivity,
  duplicateLibraryActivity,
} from './activities/service.js';

let repos: Repositories;

function freshRepos(): Repositories {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return makeRepositories(db);
}

beforeEach(() => {
  repos = freshRepos();
});

const quizDraft = () => ({
  type: 'quiz' as const,
  title: 'Complexité',
  format: 'single' as const,
  question: 'Pire cas suppression tas de Fibonacci ?',
  choices: [{ text: 'O(1)' }, { text: 'O(log n)' }, { text: 'O(n)' }],
  correctIndexes: [1],
  timerSec: 30,
  scoreRules: { basePoints: 100, speedBonusMax: 0, partialCredit: 'none' as const, wrongPenalty: 0 },
});

describe('Auth organisateur', () => {
  it('nécessite une configuration initiale puis crée le compte unique', async () => {
    expect(setupNeeded(repos)).toBe(true);
    await setupOrganizer(repos, { username: 'prof', password: 'motdepasse1' });
    expect(setupNeeded(repos)).toBe(false);
  });

  it('refuse la création d’un second compte', async () => {
    await setupOrganizer(repos, { username: 'prof', password: 'motdepasse1' });
    await expect(
      setupOrganizer(repos, { username: 'autre', password: 'motdepasse2' }),
    ).rejects.toThrow();
  });

  it('login + authenticate fonctionnent, mauvais mot de passe rejeté', async () => {
    await setupOrganizer(repos, { username: 'prof', password: 'motdepasse1' });
    const res = await login(repos, { username: 'prof', password: 'motdepasse1' });
    expect(authenticate(repos, res.token)).toBe(res.organizer.id);

    await expect(login(repos, { username: 'prof', password: 'mauvais' })).rejects.toThrow();
    expect(authenticate(repos, 'jeton-bidon')).toBeNull();
  });

  it('logout invalide le jeton', async () => {
    await setupOrganizer(repos, { username: 'prof', password: 'motdepasse1' });
    const res = await login(repos, { username: 'prof', password: 'motdepasse1' });
    logout(repos, res.token);
    expect(authenticate(repos, res.token)).toBeNull();
  });
});

describe('Sessions — code et cycle de vie', () => {
  it('génère des codes uniques', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const s = createSession(repos, { title: `S${i}`, contentLocale: 'fr', anonymous: false });
      expect(codes.has(s.code)).toBe(false);
      codes.add(s.code);
    }
  });

  it('démarrage rapide crée une session active', () => {
    const s = createSession(repos, {
      title: 'Impro',
      contentLocale: 'fr',
      anonymous: false,
      quickStart: true,
    });
    expect(s.state).toBe('active');
    expect(s.started_at).not.toBeNull();
  });

  it('autorise preparation -> active -> closed, rejette une transition invalide', () => {
    const s = createSession(repos, { title: 'TD', contentLocale: 'fr', anonymous: false });
    expect(transitionSession(repos, s.id, 'active').state).toBe('active');
    expect(transitionSession(repos, s.id, 'closed').state).toBe('closed');
    // closed est terminal
    expect(() => transitionSession(repos, s.id, 'active')).toThrow();
  });
});

describe('Participants — entrée, reconnexion, verrouillage', () => {
  function activeSession() {
    return createSession(repos, {
      title: 'Cours',
      contentLocale: 'fr',
      anonymous: false,
      quickStart: true,
    });
  }

  it('refuse un code inconnu', () => {
    expect(() =>
      joinSession(repos, { code: 'ZZZZZZ', pseudonym: 'Alice' }),
    ).toThrow();
  });

  it('refuse l’entrée avant démarrage (preparation)', () => {
    const s = createSession(repos, { title: 'Prep', contentLocale: 'fr', anonymous: false });
    expect(() => joinSession(repos, { code: s.code, pseudonym: 'Alice' })).toThrow();
  });

  it('crée un participant et un jeton de reconnexion', () => {
    const s = activeSession();
    const r = joinSession(repos, { code: s.code, pseudonym: 'Alice' });
    expect(r.reconnected).toBe(false);
    expect(r.reconnectToken).toBeTruthy();
  });

  it('reconnexion : même identité, pas de doublon', () => {
    const s = activeSession();
    const first = joinSession(repos, { code: s.code, pseudonym: 'Alice' });
    const again = joinSession(repos, {
      code: s.code,
      pseudonym: 'Alice',
      reconnectToken: first.reconnectToken,
    });
    expect(again.reconnected).toBe(true);
    expect(again.participantId).toBe(first.participantId);
    expect(repos.participant.countBySession(s.id)).toBe(1);
  });

  it('bloque une nouvelle entrée pendant une activité en cours', () => {
    const s = activeSession();
    const sac = attachActivity(repos, s.id, { draft: quizDraft() });
    repos.sessionActivity.updateState(sac.id, 'running');
    expect(() => joinSession(repos, { code: s.code, pseudonym: 'Bob' })).toThrow();
  });
});

describe('Activités — bibliothèque, validation, snapshot immuable', () => {
  it('valide et crée une activité quiz', () => {
    const a = createLibraryActivity(repos, quizDraft());
    expect(a.type).toBe('quiz');
    expect(a.used).toBe(0);
  });

  it('rejette un quiz dont l’index correct est hors des choix', () => {
    expect(() =>
      createLibraryActivity(repos, { ...quizDraft(), correctIndexes: [9] }),
    ).toThrow();
  });

  it('interdit l’édition d’une activité déjà utilisée (duplication requise)', () => {
    const a = createLibraryActivity(repos, quizDraft());
    const s = createSession(repos, { title: 'X', contentLocale: 'fr', anonymous: false });
    attachActivity(repos, s.id, { libraryId: a.id });
    expect(() => updateLibraryActivity(repos, a.id, quizDraft())).toThrow();
    // la duplication, elle, est autorisée
    const copy = duplicateLibraryActivity(repos, a.id);
    expect(copy.id).not.toBe(a.id);
    expect(copy.used).toBe(0);
  });

  it('le snapshot de session est indépendant de la bibliothèque', () => {
    const a = createLibraryActivity(repos, quizDraft());
    const s = createSession(repos, { title: 'X', contentLocale: 'fr', anonymous: false });
    const sac = attachActivity(repos, s.id, { libraryId: a.id });
    // On duplique et on modifie la copie : le snapshot attaché ne doit pas changer.
    const snapBefore = repos.sessionActivity.findById(sac.id)!.snapshot_json;
    const copy = duplicateLibraryActivity(repos, a.id);
    updateLibraryActivity(repos, copy.id, { ...quizDraft(), title: 'MODIFIÉ' });
    const snapAfter = repos.sessionActivity.findById(sac.id)!.snapshot_json;
    expect(snapAfter).toBe(snapBefore);
    expect(snapAfter).not.toContain('MODIFIÉ');
  });
});
