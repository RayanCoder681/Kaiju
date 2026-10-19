# Kaiju

Quiz en direct dans l'esprit de Kahoot : l'animateur lance la séance depuis un ordinateur ou un vidéoprojecteur, les participants répondent depuis leur téléphone dans une simple page web, sans rien installer. Conçu pour une salle de classe ou un atelier, sur le Wi-Fi local ou le point d'accès de l'ordinateur, y compris sans Internet.

Version 0.1 : première version, à tester en conditions réelles.

## Démarrer

Prérequis : Node.js 18 ou plus récent (22 LTS conseillé).

```
npm install     # installe ws et qrcode-generator (aucune autre dépendance)
npm start       # lance le serveur sur le port 3000
```

Le terminal affiche l'adresse à donner aux participants, par exemple :

```
Participants : http://192.168.137.1:3000/
Animateur    : http://192.168.137.1:3000/?host   (ou http://localhost:3000/?host sur cet ordinateur)
```

Autre port : `PORT=4000 npm start` (PowerShell : `$env:PORT=4000; npm start`).

## Déroulement d'une séance

1. L'animateur ouvre `/?host`, colle ses questions et clique sur **Créer la session**. Les erreurs de format s'affichent avant la création, avec le numéro de question et de ligne.
2. L'écran affiche l'adresse, un **code à 4 chiffres** et un **QR code**.
3. Chaque participant ouvre l'adresse (ou scanne le QR code), entre le code et un pseudo.
4. L'animateur clique sur **Démarrer**. La question s'affiche partout avec un compte à rebours et 4 grands boutons de couleur et de forme différentes (triangle, losange, cercle, carré).
5. Quand tous les participants connectés ont répondu, ou à la fin du temps, les résultats s'affichent : bonne réponse, votes par option, classement. Sur le téléphone : juste ou faux, points gagnés, score, rang.
6. **Question suivante**, jusqu'au **podium** final.

L'animateur peut aussi clore une question avant la fin du temps, terminer la partie à tout moment, et retirer un participant en salle d'attente (son pseudo est alors bloqué pour la session).

## Format des questions

Un bloc par question, séparés par une ligne vide. Première ligne : l'énoncé. Puis 2 à 4 réponses, la bonne marquée d'une étoile.

```
Quelle est la capitale du Cameroun ?
Douala
*Yaoundé
Bafoussam

Combien font 2 + 2 ? [10s]
3
*4
```

- `[30s]` en fin d'énoncé : durée de la question (5 à 240 s). Sinon, la durée par défaut choisie à la création (20 s si rien n'est changé).
- Numéros (`1.`, `Q3)`), puces (`-`, `•`) et préfixes `A)` `B)` sont retirés automatiquement : on peut coller un texte venant de Word ou d'un PDF.
- `Yaoundé *` et `B) *Yaoundé` marquent aussi la bonne réponse ; `\*` donne une étoile littérale.
- Limites : 100 questions, 200 caractères par énoncé, 80 par réponse, 20 000 caractères au total.

## Score

Une bonne réponse rapporte entre 500 et 1000 points selon la rapidité : 1000 si elle arrive dans la première demi-seconde, puis décroissance linéaire jusqu'à 500 à la dernière seconde (`1000 × (1 − t/T/2)`). Une mauvaise réponse ou une absence de réponse rapporte 0. Le temps est mesuré par le serveur, jamais par le téléphone. Une tolérance réseau de 300 ms est accordée après la fin du temps (la réponse vaut alors 500).

En cas d'égalité de score, le classement départage par le temps cumulé des bonnes réponses, puis par l'ordre d'arrivée.

## Réseau local : Wi-Fi ou point d'accès

Le serveur écoute sur toutes les interfaces (`0.0.0.0`). La page ne charge **aucune ressource externe** : tout vient de l'ordinateur, donc une salle sans Internet suffit, et les téléphones consomment très peu de données.

| Réseau | Capacité | Remarques |
|---|---|---|
| Wi-Fi existant | celle du routeur | les Wi-Fi invités, de campus ou d'hôtel isolent souvent les appareils entre eux : les téléphones ne voient alors pas l'ordinateur |
| Point d'accès mobile Windows (adresse `192.168.137.1`) | **8 appareils maximum** | simple, mais limité |
| Partage de connexion d'un téléphone | souvent une dizaine, variable | vérifier le nombre maximal de connexions dans les réglages |
| Routeur Wi-Fi dédié sans Internet | 20 à 50+ | le plus fiable pour une classe entière |

Sous Windows, la première fois, autoriser Node.js sur les **réseaux privés**, ou lancer en administrateur :

```
powershell -ExecutionPolicy Bypass -File .\scripts\windows-firewall.ps1 -Port 3000
```

Le script ajoute une règle entrante limitée au profil Privé. Il ne désactive jamais le pare-feu.

Autres outils :
- `npm run lan` liste les adresses IPv4 de l'ordinateur, classées de la plus probable à la moins probable (les cartes virtuelles WSL, Hyper-V, VirtualBox et Docker sont écartées).
- `node scripts/load-bots.js ws://<IP>:3000/ws <code> 40` simule 40 participants, à lancer de préférence depuis un autre ordinateur du même réseau, avant une vraie séance.

Si un téléphone affiche « pas d'accès à Internet », choisir **Rester connecté**.

## Perte de connexion et reprise

Un participant qui perd la connexion (Wi-Fi coupé, écran verrouillé, page rechargée) est reconnecté automatiquement (nouvelle tentative après 1 s, 2 s, 4 s, puis toutes les 10 s au plus, et immédiatement quand la page redevient visible). Il retrouve sa place, son score et la question en cours.

Comment cela fonctionne : à la première connexion, le serveur génère un jeton aléatoire que le téléphone garde dans `localStorage`. Si ce jeton est perdu (autre téléphone, navigation privée), le participant peut aussi revenir avec **le même code et le même pseudo**, à condition que le joueur portant ce pseudo soit déconnecté à ce moment-là.

**Limite assumée** : ce n'est pas une authentification. Quelqu'un qui connaît le code et le pseudo d'un participant déconnecté peut prendre sa place. C'est acceptable en classe (l'animateur voit la liste des participants), pas pour un enjeu sérieux.

L'animateur dispose du même mécanisme : recharger `/?host` reprend la session en cours.

## Les parties vivent en mémoire

Il n'y a pas de base de données. **Arrêter ou redémarrer le serveur efface toutes les parties.** Les téléphones affichent alors « Cette partie n'existe plus » et reviennent à l'accueil. Une session au podium est supprimée après 30 minutes, une session sans aucune connexion après 2 heures.

## Mise en ligne (Render, Railway)

Le même code fonctionne en ligne : le port vient de `PORT`, la page construit l'adresse WebSocket à partir de l'adresse affichée (`wss://` en HTTPS), et un ping toutes les 25 s garde les connexions ouvertes. Variables utiles :

- `PUBLIC_URL` : adresse publique à mettre dans le QR code (par exemple `https://mon-kaiju.onrender.com`). Sans elle, l'adresse est déduite de la requête.
- `ALLOWED_ORIGINS` : liste d'origines autorisées, séparées par des virgules. À définir en ligne ; à laisser vide en réseau local.

Sur les offres gratuites, le service peut être mis en veille ou redémarré, ce qui efface les parties en cours. Vérifier les conditions actuelles sur la documentation de la plateforme.

## Sécurité

- Le serveur décide de tout ce qui compte : bonne réponse, temps, points, classement, phase. Le téléphone n'envoie que le numéro de la question et celui du choix ; tout autre champ est ignoré. La bonne réponse n'est envoyée qu'à la correction.
- Une seule réponse par participant et par question, vérifiée côté serveur.
- Messages limités à 64 Ko et à 20 par seconde et par connexion ; JSON invalide et messages inconnus refusés sans arrêter le serveur.
- Pseudos normalisés (1 à 20 caractères, sans caractères de contrôle, unicité insensible à la casse) et affichés uniquement comme texte (`textContent`), jamais interprétés comme du HTML.
- Seuls les fichiers de la page sont servis (liste blanche) ; en-têtes `Content-Security-Policy` et `X-Content-Type-Options`.

## Tests

```
npm test
```

Lanceur intégré `node --test`, sans dépendance supplémentaire. Les tests couvrent le parseur, le score, les codes, la machine à états d'une partie (avec une horloge simulée), la validation des messages, le nettoyage des sessions, le serveur HTTP, et des parties complètes avec de vrais clients WebSocket : plusieurs joueurs, double réponse, réponse tardive, déconnexion, reconnexion, sessions inconnues ou terminées, redémarrage, limite de débit, heartbeat.

## Structure

```
server.js            serveur HTTP + WebSocket (/ws), exporte createServer()
src/game.js          une partie : phases, réponses, points (sans réseau)
src/rooms.js         sessions en mémoire et nettoyage
src/protocol.js      validation des messages, erreurs, pseudos, limite de débit
src/quiz-parser.js   format texte des quiz (partagé avec la page)
src/scoring.js       points et classement
src/room-code.js     codes à 4 chiffres sans collision
src/lan-addresses.js détection des adresses locales
public/              page unique (index.html, app.js, style.css)
scripts/             test de charge, règle de pare-feu Windows
test/                tests node --test
test-utils/          outils de test (hors de test/ pour ne pas être lancés comme tests)
docs/protocol.md     spécification du protocole WebSocket
```

## Pistes pour la suite

Sondages sans bonne réponse, questions du public façon Slido, sauvegarde des quiz, export du classement final.
