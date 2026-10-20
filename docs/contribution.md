# Guide de contribution

Pour un autre développeur ou agent IA reprenant Kaiju.

## Structure

```
kaiju/
├─ packages/shared/   @kaiju/shared — source de vérité : domaine, contrats Zod,
│                     événements Socket.IO typés, thème (tokens), i18n FR/EN
├─ server/            @kaiju/server — Express + Socket.IO + SQLite
│  └─ src/
│     ├─ db/          connexion, migrations (.sql), repositories
│     ├─ realtime/    engine (logique pure) + socket (couche fine) + live (diffusion)
│     ├─ modules/     auth, sessions, participants, activities, teams, qa,
│     │               maintenance, exchange, media, demo
│     ├─ middleware/  handle (async+Zod), requireHost, cookies
│     └─ lib/         ids, password, logger, rateLimit, errors, limiters
└─ client/            @kaiju/client — React + Vite + Tailwind
   └─ src/
      ├─ routes/      Landing, Host (+ host/*), Join (+ participant/*), Projection
      ├─ ui/          Theme/I18n providers, Shell, primitives
      └─ lib/         api (REST), socket (Socket.IO), useAuth
```

## Principes

- **Le serveur fait autorité** sur les états, délais, scores, visibilité. Le client n'impose rien.
- **Logique métier dans `@kaiju/shared` et `server/.../engine.ts`** : pure, testable sans UI.
- **Validation Zod partout** côté serveur (REST et Socket.IO), schémas partagés.
- **Idempotence par contraintes SQL** (voir `docs/schema.md`), pas seulement applicative.
- **Snapshots immuables** : une activité attachée à une session ne change jamais après coup.

## Conventions

- TypeScript strict ; imports ESM avec extension `.js` côté serveur/shared.
- Un module métier = `service.ts` (logique) + `routes.ts` (HTTP), testé au niveau service.
- Messages utilisateur via clés i18n (`error.*`, `notice.*`) — jamais de texte en dur dans les erreurs.
- Couleurs via les tokens de thème (`packages/shared/src/theme/tokens.ts`) et les variables CSS `--kj-*`.

## Ajouter…

- **une migration** : `server/src/db/migrations/NNN_*.sql` (ne jamais éditer une migration appliquée).
- **un type d'activité** : étendre `domain/types.ts` + schémas `contracts/schemas.ts`, gérer dans
  `engine.ts` (soumission/résultats) et l'UI éditeur/participant/projection.
- **un événement temps réel** : le déclarer dans `contracts/events.ts`, l'implémenter (revalidé +
  autorisé) dans `realtime/socket.ts`.

## Vérifications avant commit

```bash
npm run typecheck && npm run build && npm test
```

Commits significatifs ; créer un point de contrôle Git avant une modification importante.
