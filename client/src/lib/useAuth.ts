import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api.js';

export interface Organizer {
  id: string;
  username: string;
  displayName: string | null;
}

export type AuthStatus = 'loading' | 'needsSetup' | 'anonymous' | 'authed';

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [organizer, setOrganizer] = useState<Organizer | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<{ organizer: Organizer }>('/api/auth/me');
      setOrganizer(me.organizer);
      setStatus('authed');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const s = await api.get<{ setupNeeded: boolean }>('/api/auth/setup-status');
        setOrganizer(null);
        setStatus(s.setupNeeded ? 'needsSetup' : 'anonymous');
      } else {
        setStatus('anonymous');
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, organizer, refresh, setStatus };
}
