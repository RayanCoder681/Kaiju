# Guide d'installation et de lancement — Windows

Guide pas à pas pour lancer Kaiju sur un ordinateur Windows (poste organisateur)
et connecter des smartphones sur le même réseau Wi-Fi.

## 1. Prérequis

- **Node.js 20 ou 22** : télécharger l'installeur LTS sur <https://nodejs.org> et l'installer
  (options par défaut). Vérifier dans PowerShell :

  ```powershell
  node -v
  npm -v
  ```

- Les appareils des participants (smartphones, ordinateurs) doivent être sur le **même réseau
  Wi-Fi / LAN** que l'ordinateur organisateur.

## 2. Installation (une seule fois)

Dans PowerShell, placez-vous dans le dossier du projet puis :

```powershell
npm install
copy .env.example .env
```

> L'installation télécharge les dépendances depuis Internet. Une fois faite, Kaiju fonctionne
> **hors ligne** sur le réseau local. Pour préparer une machine sans Internet, voir
> « Installation hors ligne » plus bas.

## 3. Lancement

```powershell
npm start
```

Le serveur compile puis démarre et affiche un panneau :

```
  Console organisateur : http://localhost:4000/host
  Participants (LAN)   : http://192.168.x.x:4000/
  Adresse IP LAN       : 192.168.x.x
  Port                 : 4000
  QR de connexion participant : [QR code ASCII]
```

- Ouvrez **la console organisateur** sur l'ordinateur : `http://localhost:4000/host`.
- Les participants scannent le **QR** ou saisissent l'adresse LAN affichée (jamais « localhost »
  depuis un téléphone).
- Ouvrez **l'écran de projection** dans un onglet séparé branché au vidéoprojecteur :
  bouton « Ouvrir la projection » dans la console, ou `http://localhost:4000/projection?code=XXXXXX`.

Premier démarrage : la console vous demande de **créer le compte organisateur** (identifiant +
mot de passe). Ce compte est local, stocké haché dans la base.

## 4. Autoriser l'accès réseau — pare-feu Windows

Au premier lancement, Windows peut afficher une fenêtre « Alerte de sécurité Windows Defender ».
**Cochez « Réseaux privés »** et cliquez sur « Autoriser l'accès ». Sans cela, les téléphones ne
pourront pas se connecter.

Si vous avez refusé par erreur, ouvrez **Pare-feu Windows Defender → Autoriser une application**
et autorisez Node.js sur les réseaux privés. En dernier recours, ajoutez une règle entrante pour
le port 4000 (TCP).

## 5. Dépannage réseau

| Symptôme | Cause probable | Solution |
|---|---|---|
| Le téléphone n'ouvre pas la page | Pas sur le même Wi-Fi | Connecter le téléphone au même réseau que l'ordinateur |
| « localhost » dans le QR | — | Kaiju n'utilise jamais localhost pour le QR ; si l'IP LAN est introuvable, vérifier la connexion Wi-Fi/Ethernet de l'ordinateur |
| Connexion refusée / délai | Pare-feu Windows bloque | Autoriser Node.js (réseaux privés) — voir §4 |
| Les appareils ne se voient pas | « Isolation des points d'accès » (AP isolation) activée sur le routeur | Désactiver l'isolation des clients Wi-Fi dans les réglages du routeur, ou utiliser un partage de connexion dédié |
| Réseau Wi-Fi « public » | Windows bloque la découverte | Passer le réseau en « privé » : Paramètres → Réseau → Propriétés → Profil réseau → Privé |
| Adresse IP inconnue | — | `ipconfig` dans PowerShell : chercher « Adresse IPv4 » de l'adaptateur Wi-Fi |

## 6. Développement (optionnel, rechargement à chaud)

Deux fenêtres PowerShell :

```powershell
npm run dev:server    # API + temps réel (port 4000)
npm run dev:client    # interface (port 5173, proxy vers le serveur)
```

En développement, ouvrez `http://localhost:5173`.

## 7. Données de démonstration (optionnel)

```powershell
npm run seed:demo
```

Crée une session « [DÉMO] » avec un quiz, un sondage et une Q&A, plus un compte `demo` /
`demo-kaiju-2026`. Tout est préfixé « [DÉMO] » et supprimable sans toucher aux vraies sessions.

## 8. Installation hors ligne (salle sans Internet)

1. Sur une machine **avec** Internet, même version de Node et même système : lancer `npm install`
   dans le projet.
2. Copier le dossier complet **y compris `node_modules/`** sur une clé USB.
3. Sur la machine cible hors ligne : coller le dossier, puis `npm start` (aucun téléchargement
   nécessaire, les dépendances sont déjà présentes).

> `better-sqlite3` est un module natif : la machine source doit avoir le même système
> d'exploitation et la même version majeure de Node que la machine cible.

## 9. Sauvegarde et transfert

- Sauvegardes dans `server/backups/` (console → Diagnostic → « Sauvegarder maintenant », ou
  automatiques). Copiez ce dossier sur un support externe régulièrement.
- Pour **transférer vers un autre ordinateur** : voir `docs/exploitation.md` (restauration).
