# Décisions techniques (ADR-lite)

Décisions qui affectent l'architecture, le périmètre, la capacité ou la sécurité.
Chaque entrée : contexte → décision → conséquence.

## ADR-001 — Monorepo npm workspaces

- **Contexte** : trois cibles (types partagés, serveur, client), besoin de partage de types sans publication de paquets, cible Windows avec connexion parfois lente.
- **Décision** : monorepo à trois workspaces npm (`packages/shared`, `server`, `client`). Pas de Lerna/Nx/pnpm.
- **Conséquence** : un seul `npm install` à la racine, outillage nul en plus, cross-platform. `@kaiju/shared` est compilé avant `server`/`client`.

## ADR-002 — SQLite via better-sqlite3

- **Contexte** : persistance locale fiable, transactions synchrones, écriture durable avant accusé de réception.
- **Décision** : `better-sqlite3` (API synchrone, transactions simples) + mode WAL, `foreign_keys = ON`, `synchronous = NORMAL`.
- **Conséquence** : module natif ; binaires pré-compilés disponibles pour Windows/Node 20-22. Chaîne de build (python/make/g++) nécessaire uniquement en repli de compilation.

## ADR-003 — Runner de migrations maison

- **Contexte** : éviter une grosse dépendance (Knex, Prisma) pour un besoin simple.
- **Décision** : runner lisant les fichiers `migrations/NNN_*.sql` par ordre alphabétique, appliqués en transaction, suivis dans `_migration` avec checksum SHA-256.
- **Conséquence** : migrations en SQL pur, versionnées. Interdiction d'éditer une migration déjà appliquée (le checksum divergent lève une erreur) : on crée une nouvelle migration.

## ADR-004 — Hachage des mots de passe : bcryptjs

- **Contexte** : un seul compte organisateur local ; priorité à l'installation reproductible sur Windows.
- **Décision** : `bcryptjs` (implémentation pure JavaScript de bcrypt), pas de compilation native.
- **Conséquence** : installation sans dépendance système, légèrement plus lent qu'une implémentation native — négligeable pour une authentification unique. Algorithme bcrypt robuste et éprouvé.

## ADR-005 — i18n maison centralisé

- **Contexte** : FR par défaut + EN, besoin partagé client/serveur, pas de traduction automatique.
- **Décision** : dictionnaires TypeScript dans `@kaiju/shared` + `translate()/makeTranslator()`. Test de parité des clés FR/EN.
- **Conséquence** : zéro dépendance i18n, clés typées, erreurs/états/notifications centralisés.

## ADR-006 — Thème : variables CSS pilotées par tokens partagés

- **Contexte** : deux thèmes (clair « white » issu des maquettes, sombre « noir-ardoise ») et personnalisation future.
- **Décision** : source de vérité unique dans `shared/theme/tokens.ts` ; miroir en variables CSS `--kj-*` dans `client/src/index.css` ; Tailwind mappe ses couleurs sur ces variables. Bascule via `data-theme` sur `<html>`. Parité vérifiée par test.
- **Conséquence** : un seul endroit pour les couleurs, bascule instantanée, documentation et projection cohérentes.

## ADR-007 — Autorité serveur sur l'état, les délais et les scores

- **Contexte** : règles métier critiques (réponses tardives, doublons, visibilité, scores).
- **Décision** : machines à états (`states.ts`), calcul de score (`scoring.ts`) et validation (Zod) centralisés et testés ; appliqués côté serveur. Idempotence garantie par contraintes SQL uniques. Les événements Socket.IO entrants sont revalidés serveur.
- **Conséquence** : le client ne fait jamais autorité ; la logique métier est testable indépendamment de l'UI.

## ADR-008 — Local-first mono-port

- **Contexte** : fonctionnement LAN sans Internet, QR accessible aux smartphones.
- **Décision** : en production/démo, le serveur Express sert le client compilé sur le même port ; détection IP LAN + QR vers l'URL LAN (jamais `localhost`). En développement, Vite proxifie `/api` et `/socket.io` vers le serveur.
- **Conséquence** : une seule origine côté navigateur, pas de CORS large, une seule adresse à communiquer aux participants.
