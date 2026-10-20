import { getDb } from './db/connection.js';
import { makeRepositories, type Repositories } from './db/repositories.js';

let repos: Repositories | null = null;

/** Repositories construits sur la connexion SQLite partagée. */
export function getRepositories(): Repositories {
  if (!repos) repos = makeRepositories(getDb());
  return repos;
}

/** Réinitialise le cache (utilisé par les tests qui changent de base). */
export function resetRepositories(): void {
  repos = null;
}
