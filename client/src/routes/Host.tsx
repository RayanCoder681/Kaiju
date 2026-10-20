import { Routes, Route } from 'react-router-dom';
import { Shell } from '../ui/Shell.js';
import { useAuth } from '../lib/useAuth.js';
import { Login } from './host/Login.js';
import { Dashboard } from './host/Dashboard.js';
import { SessionDetail } from './host/SessionDetail.js';

/** Console organisateur : gating d'authentification + routage interne. */
export function Host() {
  const { status, organizer, refresh } = useAuth();

  let content;
  if (status === 'loading') {
    content = <p className="text-muted">Chargement…</p>;
  } else if (status === 'needsSetup' || status === 'anonymous') {
    content = <Login needsSetup={status === 'needsSetup'} onDone={() => void refresh()} />;
  } else {
    content = (
      <Routes>
        <Route
          path="/"
          element={<Dashboard organizerName={organizer?.displayName || organizer?.username || ''} />}
        />
        <Route path="sessions/:id" element={<SessionDetail />} />
      </Routes>
    );
  }

  return <Shell surfaceLabel="Organisateur">{content}</Shell>;
}
