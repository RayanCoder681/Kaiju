# Protocole WebSocket de Kaiju (V1)

Référence normative entre `server.js`, `src/` et `public/`. Toute évolution du protocole se fait ici d'abord, puis dans le code et les tests, dans cet ordre.

## Sommaire
1. Principes
2. Machine à états d'une session
3. Messages client vers serveur
4. Messages serveur vers client
5. Codes d'erreur
6. Règles de temps
7. Reconnexion
8. Cycle de vie et nettoyage
9. Limites et validation

## 1. Principes

- Transport : WebSocket (`ws`) sur le même port que le HTTP statique. URL côté client : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`. Ne jamais coder une IP ou un port en dur.
- Format : JSON, un objet par message, champ `type` obligatoire. Pas de binaire.
- **Le serveur fait autorité** sur : la question courante, l'échéance, la bonne réponse, les points, le classement, la phase. Le client affiche ; il ne calcule ni ne décide rien qui compte.
- La bonne réponse (`correctIndex`) **n'est jamais envoyée avant la phase `reveal`**.
- Chaque message entrant est validé (type connu, champs attendus, phase compatible, rôle autorisé). Un message invalide reçoit `error`, il ne fait jamais planter le processus.
- Messages personnalisés : `reveal` et `podium` contiennent un bloc `you` propre à chaque joueur, donc envoyés socket par socket, pas en broadcast identique.

## 2. Machine à états d'une session

```
LOBBY ──host:start──▶ QUESTION ──(tous ont répondu | échéance | host:close)──▶ REVEAL
                         ▲                                                    │
                         └──────────────host:next (reste des questions)───────┤
                                                                              │
                         PODIUM ◀──────host:next (dernière question)──────────┘
   (toute phase) ──host:end──▶ PODIUM
```

- Les transitions sont des méthodes d'une classe `Game` qui vérifient la phase courante et ne font rien si la transition est invalide (retour `false` + erreur `WRONG_PHASE` côté appelant).
- `closeQuestion()` est **idempotente** : un drapeau `closed` empêche la double exécution lorsque la dernière réponse et le minuteur arrivent dans la même milliseconde. Elle annule le minuteur (`clearTimeout`) avant tout le reste.
- « Tous ont répondu » = toutes les réponses des joueurs **connectés au moment du calcul**. Recalculer à chaque réponse et à chaque déconnexion pendant `QUESTION`.
- **Délai de grâce** (`DISCONNECT_GRACE_MS = 5000`) : un joueur qui se déconnecte pendant `QUESTION` sans avoir répondu reste attendu 5 s (sans jamais dépasser l'échéance). S'il revient, il peut répondre ; sinon il est retiré du décompte et la clôture est réévaluée. Les minuteurs de grâce sont annulés à la clôture et à la suppression de la session.

## 3. Messages client vers serveur

| type | rôle | charge utile | phases | effet |
|---|---|---|---|---|
| `host:create` | tous | `{ quizText: string, settings?: { defaultTimeSec?: number } }` | — | parse, crée la session, la socket devient hôte |
| `host:resume` | tous | `{ code, hostToken }` | toutes | réattache la socket comme hôte |
| `host:start` | hôte | `{}` | LOBBY (≥ 1 joueur) | passe à la question 0 |
| `host:close` | hôte | `{}` | QUESTION | clôture anticipée |
| `host:next` | hôte | `{}` | REVEAL | question suivante ou podium |
| `host:end` | hôte | `{}` | LOBBY, QUESTION, REVEAL | podium immédiat |
| `host:kick` | hôte | `{ playerId }` | LOBBY | retire le joueur, bannit son pseudo pour la session |
| `player:join` | tous | `{ code, nickname, playerToken? }` | toutes sauf PODIUM | rejoint ou reprend sa place |
| `player:answer` | joueur | `{ questionIndex, choiceIndex }` | QUESTION | enregistre une réponse unique |
| `ping` | tous | `{}` | toutes | répond `pong` (en plus du ping/pong natif WebSocket) |

## 4. Messages serveur vers client

| type | destinataire | charge utile |
|---|---|---|
| `host:created` | hôte | `{ code, hostToken, questionCount }` |
| `joined` | joueur | `{ playerId, playerToken, nickname, resumed: boolean }` |
| `state` | une socket | instantané complet envoyé après `joined` / `host:resume` : `{ phase, code, questionCount, players?, question?, remainingMs?, you? }` |
| `lobby` | tous | `{ players: [{ id, nickname, connected }] }` |
| `question` | tous | `{ index, total, text, choices: string[], durationMs, remainingMs }` |
| `answer:ack` | joueur | `{ questionIndex, choiceIndex }` (la réponse est enregistrée, sans dire si elle est juste) |
| `progress` | hôte | `{ answered, expected }` |
| `reveal` | chacun | `{ index, correctIndex, counts: number[], leaderboard: [{ nickname, score, rank }] /* top 5 */, you?: { answered, correct, points, score, rank } }` |
| `podium` | chacun | `{ leaderboard: [{ nickname, score, rank }] /* complet pour l'hôte, top 3 pour les joueurs */, you?: { score, rank } }` |
| `kicked` | joueur | `{}` puis fermeture de la socket |
| `error` | une socket | `{ code, message, details? }` |
| `pong` | une socket | `{}` |

## 5. Codes d'erreur

| code | quand |
|---|---|
| `BAD_REQUEST` | JSON invalide, `type` inconnu, champ manquant ou mal typé |
| `QUIZ_INVALID` | erreurs du parseur ; `details` = tableau `{ block, line, message }` |
| `ROOM_NOT_FOUND` | code inconnu (y compris après redémarrage du serveur) |
| `ROOM_ENDED` | session au podium ou supprimée |
| `NICK_INVALID` | pseudo vide, trop long, caractères de contrôle |
| `NICK_TAKEN` | pseudo utilisé par un joueur **connecté** (ou banni après kick) |
| `NOT_HOST` | action d'hôte sans être l'hôte de cette session |
| `WRONG_PHASE` | action impossible dans la phase courante |
| `ALREADY_ANSWERED` | seconde réponse à la même question |
| `TOO_LATE` | réponse après l'échéance + tolérance, ou à une question déjà close |
| `STALE_QUESTION` | `questionIndex` différent de la question courante |
| `INVALID_CHOICE` | `choiceIndex` hors de `[0, choices.length)` ou non entier |
| `RATE_LIMITED` | trop de messages (la socket est ensuite fermée) |

Les messages d'erreur (`message`) sont en français, courts, affichables tels quels.

## 6. Règles de temps

- Le serveur note `startedAt = now()` au moment où il diffuse `question`, et `endsAt = startedAt + durationMs`.
- Le client reçoit `remainingMs` (pas une date absolue : les horloges des téléphones divergent) et calcule son échéance locale avec `performance.now() + remainingMs`.
- À la réception d'une réponse : `elapsed = now() - startedAt`. Recevable si `now() <= endsAt + ANSWER_GRACE_MS` (300 ms) et si la question n'est pas close. Points : `computePoints()` de `scripts/scoring.js`, avec `elapsed` borné à `durationMs`.
- Le minuteur serveur (`setTimeout(closeQuestion, durationMs + ANSWER_GRACE_MS)`) est la seule source de vérité de la fin. Le compte à rebours du client est décoratif.
- Pour les tests, `Game` reçoit une horloge injectable : `{ now: () => number, setTimeout, clearTimeout }`.

## 7. Reconnexion

Objectif fonctionnel du projet : un participant qui perd la connexion retrouve sa place avec le même code et le même pseudo. Mise en œuvre proportionnée :

1. À la première connexion, le serveur génère `playerToken = crypto.randomBytes(16).toString('hex')` et l'envoie dans `joined`. Le client le stocke dans `localStorage` sous la clé `kaiju:<code>` avec le pseudo. **Ne pas** utiliser `crypto.randomUUID()` côté navigateur : indisponible hors contexte sécurisé, donc en HTTP sur IP locale.
2. Reprise par jeton : `player:join` avec un `playerToken` connu de la session restaure le joueur (score, réponses), quel que soit le pseudo saisi.
3. Reprise par pseudo seul (téléphone changé, stockage effacé) : autorisée **uniquement si le joueur portant ce pseudo est actuellement déconnecté**. Sinon `NICK_TAKEN`.
4. Limite assumée : un tiers qui connaît le code et le pseudo d'un joueur déconnecté peut prendre sa place. C'est acceptable en classe (l'animateur voit la liste et peut exclure), ce n'est pas une authentification. À documenter dans le README.
5. Une nouvelle connexion avec le même jeton ferme proprement l'ancienne socket (un seul socket actif par joueur).
6. Côté client : reconnexion automatique avec backoff (1 s, 2 s, 4 s, plafond 10 s) sur `close`, et tentative immédiate sur `visibilitychange` quand la page redevient visible. Sur `ROOM_NOT_FOUND`, effacer `kaiju:<code>` et revenir à l'accueil avec un message clair.
7. L'hôte a le même mécanisme avec `hostToken` et `host:resume`.

## 8. Cycle de vie et nettoyage

- Sessions en mémoire dans une `Map<code, Game>`. **Un redémarrage du serveur efface toutes les parties** : c'est un choix du projet (aucune base de données), à rappeler dans l'interface hôte et le README.
- Balayage périodique (`setInterval(..., 60_000).unref()`) : suppression d'une session au podium depuis plus de 30 min, ou sans aucune socket connectée depuis plus de 2 h.
- Heartbeat : ping natif `ws` toutes les 25 s ; une socket sans `pong` au tour suivant est terminée (`terminate()`) et le joueur passe `connected: false`.

## 9. Limites et validation

- `new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 })`.
- Quiz : limites de `scripts/quiz-parser.js` (`LIMITS`).
- Pseudo : `trim()`, normalisation NFC, 1 à 20 caractères, refus des caractères de contrôle (`/[\u0000-\u001F\u007F]/`), comparaison d'unicité insensible à la casse (`toLocaleLowerCase('fr')`).
- Débit : au-delà de 20 messages par seconde et par socket, `RATE_LIMITED` puis fermeture.
- Mise en ligne (Render, Railway) : vérifier l'en-tête `Origin` à l'upgrade quand `ALLOWED_ORIGINS` est défini ; en LAN, ne pas bloquer.
- Affichage : tout texte venant d'un utilisateur (pseudos, énoncés, réponses) est inséré avec `textContent`, jamais `innerHTML`.

## 10. Précisions et ajouts de l'implémentation V1

Ajouts compatibles avec les sections précédentes (aucun champ retiré, aucun message renommé).

**Champs supplémentaires**
- `host:created` : `joinUrl` (URL à donner aux participants, avec `?code=`). L'URL de base vaut `PUBLIC_URL` si défini, sinon l'hôte par lequel l'animateur est venu, sinon la meilleure IPv4 locale (cas où l'animateur ouvre `localhost`).
- `state` : `role` (`host` ou `player`) ; pour l'hôte `progress`, `reveal` ou `podium` selon la phase, et `joinUrl` après `host:resume` ; pour un joueur `you: { playerId, nickname, score, rank, answeredChoice? }` et `reveal` ou `podium` selon la phase. Un téléphone qui se reconnecte en pleine correction ou au podium retrouve donc le bon écran.
- `joined` : `code`.
- `reveal` : `total`, `text`, `choices`, `isLast`, et `you.choiceIndex`.
- `podium` : `playerCount`.
- `lobby` : l'hôte reçoit `{ id, nickname, connected }` ; les participants reçoivent `{ nickname, connected }` sans identifiant.

**Règles précisées**
- « Tous ont répondu » exige au moins un joueur connecté : si plus personne n'est en ligne, on attend la fin du temps.
- `progress.expected` = joueurs connectés + joueurs déconnectés qui ont déjà répondu + joueurs en délai de grâce.
- Les points d'une question sont ajoutés au score à la clôture (pas à la réception), pour qu'un instantané pris pendant la question ne révèle pas si la réponse est juste.
- `host:end` pendant `QUESTION` : les réponses déjà reçues comptent, puis podium.
- `player:answer` en `REVEAL` : `TOO_LATE` si c'est la question qui vient d'être close, `STALE_QUESTION` sinon ; en `LOBBY` ou `PODIUM` : `WRONG_PHASE` ; depuis une socket qui n'a pas rejoint : `BAD_REQUEST`.
- Un participant peut rejoindre en cours de partie (0 point au départ).
- À l'arrêt propre du serveur, aucun `ROOM_ENDED` n'est envoyé : les clients se reconnectent et reçoivent `ROOM_NOT_FOUND`, ce qui permet d'afficher « le serveur a peut-être redémarré ».

**Code d'erreur ajouté**

| code | quand |
|---|---|
| `ROOM_FULL` | 300 participants déjà inscrits dans la session |

**Codes de fermeture WebSocket**

| code | sens | reconnexion automatique du client |
|---|---|---|
| 4001 | une autre socket a repris la même place (même jeton) | non |
| 4002 | participant exclu par l'animateur | non |
| 4003 | limite de débit dépassée | oui (backoff) |
| 1009 | message plus gros que 64 Ko (fermeture par `ws`) | oui |

**Routes HTTP** (liste blanche, aucune résolution de chemin) : `/`, `/index.html`, `/app.js`, `/style.css`, `/favicon.svg`, `/lib/quiz-parser.js` (le même parseur que le serveur), `/qr.svg?code=XXXX` (SVG généré localement par `qrcode-generator`), `/healthz`. Les autres méthodes que GET et HEAD reçoivent 405.
