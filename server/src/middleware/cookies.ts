import type { Request, Response } from 'express';

export const AUTH_COOKIE = 'kaiju_sid';

/** Lit un cookie depuis l'en-tête (sans dépendance cookie-parser). */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

/** Pose le cookie de session organisateur (httpOnly, SameSite=Lax). */
export function setAuthCookie(res: Response, token: string, maxAgeMs: number): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
    // secure non activé : parcours LAN en HTTP. À activer derrière HTTPS (voir docs déploiement).
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}
