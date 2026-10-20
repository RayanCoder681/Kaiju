# Kaiju

Application web de **participation interactive en temps réel** pour mini-conférences,
cours et ateliers. **Local-first** : le serveur tourne sur l'ordinateur de l'organisateur,
les participants rejoignent depuis leur smartphone via le réseau local (code court ou QR),
sans compte ni installation.

> État : **Phase 1 — Fondations** (socle technique en place). Voir
> [`docs/decisions.md`](docs/decisions.md) pour les choix techniques et la section
> « Avancement » plus bas.

## Stack

| Couche        | Technologie                          |
| ------------- | ------------------------------------ |
| Frontend      | React + TypeScript + Vite + Tailwind |
| Backend       | Node.js + Express + TypeScript       |
| Temps réel    | Socket.IO                            |
| Base de données | SQLite (better-sqlite3) + migrations |
| Validation    | Zod (contrats partagés)              |
| Tests         | Vitest, Testing Library, Supertest   |

Monorepo npm workspaces : `packages/shared` (types/contrats/thème/i18n), `server`, `client`.

## Prérequis

- **Node.js 20 ou 22** (voir `.nvmrc`).
- npm 10+.
- Windows, macOS ou Linux. Windows est la cible prioritaire pour le poste organisateur.

## Installation

```bash
npm install
cp .env.example .env   # Windows : copy .env.example .env
```

## Lancer

Démo / usage réel (une commande — compile puis sert tout sur un seul port) :

```bash
npm start
```

Le serveur affiche alors l'URL LAN, le port et un QR code de connexion participant.

Développement (rechargement à chaud, deux terminaux) :

```bash
npm run dev:server   # API + Socket.IO (port 4000)
npm run dev:client   # Interface Vite (port 5173, proxy vers le serveur)
```

Surfaces : `/host` (organisateur), `/join` (participant), `/projection` (vidéoprojecteur).

## Vérifications

```bash
npm run typecheck   # types (shared + server + client)
npm run build       # build complet
npm test            # tests unitaires et d'intégration
npm run migrate     # applique les migrations SQLite
```

## Avancement

- [x] **Phase 0** — Inspection, décisions, point de contrôle Git.
- [x] **Phase 1** — Fondations : monorepo, types/contrats partagés, thèmes white + noir-ardoise,
      migrations SQLite, boot serveur + Socket.IO, routage 3 surfaces, i18n FR/EN, script de lancement.
- [x] **Phase 2** — MVP : auth organisateur (bcrypt, cookie), sessions + cycle de vie, code/QR LAN,
      entrée/reconnexion participant, bibliothèque d'activités + snapshots, quiz persistés. 3 surfaces câblées.
- [ ] **Phase 3** — Temps réel : synchronisation, minuteries serveur, scores, reconnexion.
- [ ] **Phase 4** — Résilience & sécurité : sauvegardes, limites, diagnostic, charge.
- [ ] **Phase 5** — Compléments : bibliothèque, import/export, archivage, médias, rapports.
- [ ] **Phase 6** — Livraison : docs, guide Windows, démo reproductible, rapport de tests.

Aucun déploiement en ligne n'est effectué sans autorisation explicite.
