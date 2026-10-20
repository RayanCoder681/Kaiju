import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { useI18n } from '../../ui/I18nProvider.js';
import { Card, Button, Input, Field } from '../../ui/primitives.js';
import type { MessageKey } from '@kaiju/shared';

/** Connexion organisateur, ou création du compte au premier démarrage. */
export function Login({ needsSetup, onDone }: { needsSetup: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (needsSetup) {
        await api.post('/api/auth/setup', { username, password });
      }
      await api.post('/api/auth/login', { username, password });
      onDone();
    } catch (err) {
      const key = err instanceof ApiError ? err.errorKey : 'error.internal';
      setError(t(key as MessageKey));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 font-display text-2xl font-bold tracking-tight">
        {needsSetup ? 'Créer le compte organisateur' : 'Connexion organisateur'}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {needsSetup
          ? 'Premier démarrage : définissez l’identifiant et le mot de passe du compte local.'
          : 'Accédez à votre console de pilotage.'}
      </p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Identifiant">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} />
          </Field>
          <Field label="Mot de passe">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              required
              minLength={needsSetup ? 8 : 1}
            />
          </Field>
          {needsSetup && (
            <p className="text-xs text-muted">Mot de passe : 8 caractères minimum.</p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t('common.loading') : needsSetup ? 'Créer et se connecter' : t('common.join')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
