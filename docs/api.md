# API REST et événements Socket.IO

Toutes les réponses d'erreur ont la forme `{ "ok": false, "errorKey": "error.xxx" }` (clé i18n).
Les actions d'organisateur exigent le cookie de session `kaiju_sid` (obtenu via `/api/auth/login`).
Le code de session ne confère **jamais** de droits d'administration.

## REST

### Authentification — `/api/auth`

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/setup-status` | — | `{ setupNeeded }` : le compte reste-t-il à créer |
| POST | `/setup` | — (1re fois) | Crée l'unique compte organisateur `{ username, password, displayName? }` |
| POST | `/login` | — | Connexion `{ username, password }` → pose le cookie |
| POST | `/logout` | — | Déconnexion (invalide le jeton) |
| GET | `/me` | host | Organisateur courant |

### Sessions — `/api/sessions`

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/` | host | Liste des sessions |
| POST | `/` | host | Crée `{ title, description?, plannedAt?, contentLocale?, anonymous?, quickStart? }` |
| GET | `/:id` | host | Détail d'une session |
| GET | `/:id/connection` | host | `{ code, lanIp, port, joinUrl, qrDataUrl }` (URL LAN, jamais localhost) |
| POST | `/:id/transition` | host | `{ to }` — transition de cycle de vie (serveur-autoritaire) |
| GET | `/:id/participants` | host | Présence |
| GET | `/:id/activities` | host | Activités attachées (snapshots) |
| POST | `/:id/activities` | host | Attache `{ libraryId }` ou `{ draft }` |
| GET | `/:id/teams` · POST `/:id/teams` | host | Équipes |
| POST | `/:id/participants/:pid/team` | host | Affecte une équipe `{ teamId }` |
| GET | `/:id/ranking` | host | Classement individuel + équipe |
| GET | `/:id/report` | host | Rapport de session |
| GET | `/:id/export/results.csv` | host | Export CSV des résultats |
| GET | `/:id/export/bundle.json` | host | Export complet JSON |

### Participant (public) — `/api/join`

| Méthode | Route | Description |
|---|---|---|
| GET | `/preview/:code` | Aperçu de la session (titre, état) |
| POST | `/` | Rejoindre `{ code, pseudonym, avatar?, reconnectToken? }` → `{ participantId, reconnectToken }` |

### Activités (bibliothèque) — `/api/activities`

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/` | host | Bibliothèque |
| POST | `/` | host | Crée une activité (validée Zod) |
| PUT | `/:id` | host | Édite (refusé si déjà utilisée — dupliquer) |
| POST | `/:id/duplicate` | host | Duplique |
| GET | `/export.json` | host | Export JSON |
| POST | `/import` | host | Import JSON (rapport par ligne) |

### Médias — `/api/media`

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/` | host | Upload image (champ `image`) — type réel validé par signature |
| GET | `/:id` | public | Lecture d'une image |

### Maintenance — `/api/maintenance`

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/diagnostics` | host | État serveur/BDD, participants, erreurs récentes, limites |
| GET | `/backups` · POST `/backup` | host | Liste / création de sauvegarde |

## Événements Socket.IO

Contrats typés et partagés (`packages/shared/src/contracts/events.ts`). Toute charge entrante
est **revalidée Zod** et **autorisée côté serveur**. Les clients rejoignent une salle par surface.

### Établissement

| Événement (client → serveur) | Charge | Effet |
|---|---|---|
| `host:hello` | `{ sessionId }` | Rejoint la salle host (cookie vérifié) |
| `participant:hello` | `{ code, reconnectToken }` | Rejoint la salle participant, marque connecté |
| `projection:hello` | `{ code }` | Rejoint la salle projection |

### Commandes organisateur

`host:activity:start` `{ activityId, countdownSec? }` · `host:activity:close` · `host:activity:pause`
· `host:activity:resume` · `host:results:publish` `{ activityId, toProjection }` ·
`host:qa:moderate` `{ questionId, activityId, status?, projected? }`.

### Soumissions participant (rate-limitées, persistées avant accusé)

`participant:quiz:submit` · `participant:poll:submit` · `participant:qa:submit` ·
`participant:qa:vote`. Chacune reçoit un `submission:ack { clientSubmissionId, accepted, reason? }`.

### Diffusions (serveur → client)

`activity:changed` · `activity:tick { remainingMs }` · `results:update` (selon visibilité et salle)
· `qa:update` · `participants:update` · `notice` · `submission:ack`.

> Règle de visibilité : les corrigés et les résultats non publiés ne sont émis qu'aux salles
> autorisées (console toujours ; participants si visibilité immédiate ; projection après publication).
