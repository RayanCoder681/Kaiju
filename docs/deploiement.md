# Préparation au déploiement en ligne (NON exécuté)

> **Aucun déploiement en ligne n'a été effectué.** Ce document prépare un éventuel hébergement et
> doit recevoir une **autorisation explicite** de l'utilisateur avant toute mise en ligne. Kaiju est
> conçu d'abord comme application **local-first** ; l'exposer sur Internet change le modèle de menace.

## Pré-requis avant exposition en ligne

À réaliser **avant** toute mise en ligne (pas encore faits) :

- **HTTPS obligatoire** : activer `secure` sur le cookie de session (`middleware/cookies.ts`),
  servir derrière un reverse-proxy TLS (ou terminaison TLS de l'hébergeur).
- **Secret de session** : fixer `SESSION_SECRET` via l'environnement de l'hébergeur (ne pas
  dépendre du fichier généré localement).
- **Durcissement** : réviser les limites (`MAX_PARTICIPANTS`, quotas), ajouter un en-tête de
  sécurité (CSP, HSTS) via le proxy, envisager une protection anti-abus au niveau du proxy.
- **CORS** : rester en même origine (le serveur sert le client) ; sinon configurer précisément.
- **Persistance** : SQLite exige un **disque persistant** (volume). Les hébergeurs à système de
  fichiers éphémère effaceraient la base à chaque redéploiement.
- **Médias et sauvegardes** : `server/uploads/` et `server/backups/` doivent être sur un volume
  persistant et sauvegardés hors de l'instance.

## Comparatif d'hébergements compatibles (Node + Socket.IO + stockage persistant)

| Option | Persistance | WebSocket | Coût indicatif | Contraintes |
|---|---|---|---|---|
| VPS (ex. petite instance) | Disque dédié ✅ | ✅ | Faible, fixe mensuel | Administration système à la charge de l'utilisateur ; TLS à configurer |
| Plateforme « apps » avec volume | Volume persistant ✅ | ✅ | Variable, selon volume/CPU | Vérifier que le disque n'est pas éphémère |
| Conteneur managé + volume | Volume ✅ | ✅ | Variable | Image Docker à produire |
| Hébergement « serverless » / edge | Éphémère ❌ | Souvent limité | — | **Inadapté** à SQLite et aux connexions longues Socket.IO |

> Les coûts réels dépendent de l'offre et de la région ; à chiffrer au moment du déploiement. Aucun
> abonnement n'a été souscrit.

## Étapes proposées (à exécuter seulement après autorisation)

1. Choisir l'hébergeur (persistance + WebSocket confirmés).
2. Provisionner un disque/volume persistant pour `server/data`, `server/uploads`, `server/backups`.
3. Configurer les variables d'environnement (`SESSION_SECRET`, `PORT`, chemins, limites).
4. Activer HTTPS et le cookie `secure`.
5. Déployer, lancer `npm run migrate`, puis démarrer.
6. Vérifier la persistance (redéploiement sans perte), les sauvegardes, et un parcours complet.
7. Documenter l'URL et les accès.

## Fichiers de déploiement

Non fournis par défaut (Dockerfile, manifeste de plateforme) : à générer selon l'hébergeur choisi
lors de l'étape 1, après autorisation.
