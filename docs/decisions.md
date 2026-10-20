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

## ADR-009 — Authentification organisateur : cookie opaque + bcrypt

- **Contexte** : un seul compte organisateur local, pas de fournisseur externe, parcours LAN HTTP.
- **Décision** : mot de passe haché bcrypt (bcryptjs) ; à la connexion, jeton opaque aléatoire (32 octets) persisté en table `auth_session` avec expiration (12 h) ; cookie `kaiju_sid` httpOnly, SameSite=Lax. Autorisation vérifiée côté serveur à chaque action admin (`requireHost`). Premier démarrage : endpoint `setup` autorisé uniquement si aucun compte n'existe.
- **Conséquence** : pas de JWT ni de dépendance de session lourde ; révocation immédiate (suppression du jeton). `secure` à activer derrière HTTPS lors d'un éventuel déploiement en ligne.

## ADR-010 — Snapshots d'activité indépendants de la bibliothèque

- **Contexte** : règle d'historique immuable — modifier une activité de bibliothèque ne doit pas altérer les sessions passées.
- **Décision** : attacher une activité à une session copie sa définition dans `session_activity.snapshot_json` ; la bibliothèque est marquée `used` et n'est plus éditable directement (duplication obligatoire pour corriger).
- **Conséquence** : chaque session conserve une copie figée ; vérifié par test (le snapshot ne change pas après modification d'une copie de bibliothèque).

## ADR-011 — Temps réel à autorité serveur (Socket.IO)

- **Contexte** : synchroniser 3 surfaces, garantir délais, idempotence, visibilité et refus des réponses tardives.
- **Décision** : moteur pur et testable (`realtime/engine.ts`) — démarrage/clôture, horloge (`tickActivity`), scoring, agrégation, classements — piloté par une couche Socket.IO fine (`realtime/socket.ts`). Salles par surface (`host:` / `part:` / `proj:`) pour isoler les résultats non publiés. Horloge globale (1 s) qui bascule countdown→running→closed à l'échéance officielle. Soumissions revalidées Zod, persistées AVANT accusé, uniques par (activité, participant) ; réponse tardive refusée même après reconnexion.
- **Conséquence** : le client n'a aucune autorité ; la logique est testée unitairement (moteur) et sur le fil (socket.io-client). La visibilité des corrigés est strictement contrôlée par salle.
