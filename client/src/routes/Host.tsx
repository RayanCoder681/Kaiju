import { Shell } from '../ui/Shell.js';

/**
 * Console organisateur — coquille de la Phase 1.
 * Authentification, tableau de bord, création de session et éditeur
 * sont implémentés en Phase 2+. Aucune commande factice ici.
 */
export function Host() {
  return (
    <Shell surfaceLabel="Organisateur">
      <h1 className="font-display text-2xl font-bold tracking-tight">Console organisateur</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Interface de pilotage de la conférence : création d'activités, gestion du direct,
        contrôle des résultats et modération.
      </p>
      <div className="mt-6 rounded-lg border border-border bg-surface p-5 text-sm text-muted">
        <p className="font-mono text-xs uppercase tracking-wider text-brand">Phase 1 — Fondations</p>
        <p className="mt-2">
          Le socle (thème, routage, base de données, temps réel) est en place. L'authentification
          locale et la création de session arrivent en Phase 2.
        </p>
      </div>
    </Shell>
  );
}
