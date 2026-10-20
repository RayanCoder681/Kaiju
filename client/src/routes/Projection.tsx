import { Logo } from '../ui/Logo.js';

/**
 * Écran de projection — surface dédiée, lisible de loin, SANS en-tête ni contrôle admin.
 * N'affiche jamais notes privées, données individuelles ni résultats non publiés.
 * Coquille de la Phase 1 ; le rendu en direct arrive en Phase 3.
 */
export function Projection() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg text-fg">
      <div className="flex items-center gap-3">
        <Logo size={56} />
        <span className="font-display text-5xl font-bold tracking-tight">Kaiju</span>
      </div>
      <p className="mt-6 font-mono text-sm uppercase tracking-[0.3em] text-muted">
        Écran de projection
      </p>
      <p className="mt-2 text-muted">En attente du démarrage de la session.</p>
    </div>
  );
}
