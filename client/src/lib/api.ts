import type { MessageKey } from '@kaiju/shared';

/** Erreur d'API portant une clé i18n traduisible. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorKey: MessageKey | string,
  ) {
    super(errorKey);
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function requestJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await parse(res)) as { ok?: boolean; errorKey?: string } | null;
  if (!res.ok || (data && data.ok === false)) {
    throw new ApiError(res.status, data?.errorKey ?? 'error.internal');
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => requestJson<T>('GET', url),
  post: <T>(url: string, body?: unknown) => requestJson<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => requestJson<T>('PUT', url, body ?? {}),
};
