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
- [x] **Phase 3** — Temps réel : synchronisation des 3 surfaces (Socket.IO), minuteries à autorité
      serveur, visibilité des résultats, scores + classements individuel/équipe, pause/reprise,
      reconnexion, idempotence et refus des réponses tardives, Q&A en direct.
- [x] **Phase 4** — Résilience & sécurité : sauvegardes (manuelles + auto) et métadonnées,
      reprise après incident (clôture des minuteurs expirés), limites configurables, rate-limiting,
      panneau diagnostic, test de charge ~40 participants simulés. Restauration : procédure manuelle (voir ci-dessous).
- [ ] **Phase 5** — Compléments : bibliothèque, import/export, archivage, médias, rapports.
- [ ] **Phase 6** — Livraison : docs, guide Windows, démo reproductible, rapport de tests.

## Sauvegarde & restauration

- Sauvegardes créées depuis la console (Diagnostic → « Sauvegarder maintenant ») ou automatiquement
  toutes les `AUTO_BACKUP_MINUTES` minutes, dans `server/backups/` (copie SQLite cohérente + checksum).
- **Restauration (manuelle, sûre)** : arrêter le serveur, remplacer `server/data/kaiju.sqlite`
  par le fichier de sauvegarde voulu (renommé `kaiju.sqlite`), supprimer les fichiers `-wal`/`-shm`
  résiduels, puis relancer. Au démarrage, toute activité dont le minuteur avait expiré est clôturée
  (aucune réponse tardive acceptée) et les clients se resynchronisent.
- Copier régulièrement le dossier `server/backups/` vers un emplacement externe : une sauvegarde
  locale unique ne protège pas de toutes les pertes.

## Performance mesurée

Test de charge **simulé** sur une seule machine (`node scripts/loadtest.mjs --n 40`) :
40/40 entrées et 40/40 soumissions acceptées ; latence d'entrée p50/p95 ≈ 86/100 ms,
soumission p50/p95 ≈ 18/34 ms. **Ce n'est pas un essai LAN multi-appareils réel** — à mesurer
sur le réseau cible avant d'annoncer une capacité. Le rate-limiter d'entrée est **par IP** :
en LAN chaque appareil a sa propre IP ; une simulation depuis une seule machine doit relever
`RATE_MAX_ACTIONS` pour ne pas être bridée.

Aucun déploiement en ligne n'est effectué sans autorisation explicite.
