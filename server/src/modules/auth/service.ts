import type { Repositories } from '../../db/repositories.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { newId, newToken } from '../../lib/ids.js';
import { Errors } from '../../lib/errors.js';

/** Durée de validité d'une session organisateur : 12 heures. */
export const AUTH_TTL_MS = 12 * 60 * 60 * 1000;

export function setupNeeded(repos: Repositories): boolean {
  return repos.organizer.count() === 0;
}

/** Crée l'unique compte organisateur. Autorisé seulement si aucun n'existe. */
export async function setupOrganizer(
  repos: Repositories,
  input: { username: string; password: string; displayName?: string },
): Promise<{ id: string }> {
  if (!setupNeeded(repos)) throw Errors.conflict();
  const id = newId('org');
  repos.organizer.create({
    id,
    username: input.username,
    password_hash: await hashPassword(input.password),
    display_name: input.displayName ?? null,
    created_at: Date.now(),
  });
  return { id };
}

export interface LoginResult {
  token: string;
  expiresAt: number;
  organizer: { id: string; username: string; displayName: string | null };
}

export async function login(
  repos: Repositories,
  input: { username: string; password: string },
  now: number = Date.now(),
): Promise<LoginResult> {
  const org = repos.organizer.findByUsername(input.username);
  // Vérifie toujours un hash pour limiter l'oracle temporel (compte inexistant vs mauvais mdp).
  const hash = org?.password_hash ?? '$2a$10$0000000000000000000000000000000000000000000000000000';
  const ok = await verifyPassword(input.password, hash);
  if (!org || !ok) throw Errors.unauthorized();

  const token = newToken();
  const expiresAt = now + AUTH_TTL_MS;
  repos.authSession.create(token, org.id, now, expiresAt);
  return {
    token,
    expiresAt,
    organizer: { id: org.id, username: org.username, displayName: org.display_name },
  };
}

export function logout(repos: Repositories, token: string): void {
  repos.authSession.delete(token);
}

/** Retourne l'id organisateur si le jeton est valide, sinon null. Rafraîchit last_seen. */
export function authenticate(
  repos: Repositories,
  token: string | undefined,
  now: number = Date.now(),
): string | null {
  if (!token) return null;
  const row = repos.authSession.findValid(token, now);
  if (!row) return null;
  repos.authSession.touch(token, now);
  return row.organizer_id;
}
