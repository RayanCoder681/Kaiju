# Rapport de tests

Dernière exécution : `npm test` (Vitest) + builds + essais runtime. Tous les résultats ci-dessous
ont été **réellement exécutés**.

## Synthèse

| Catégorie | Fichiers | Tests | Résultat |
|---|---|---|---|
| shared (domaine, thème, i18n) | 4 | 23 | ✅ réussi |
| server (métier, API, temps réel, maintenance, médias) | 12 | 55 | ✅ réussi |
| client (montage app) | 1 | 1 | ✅ réussi |
| **Total** | **17** | **79** | **✅ 79/79** |

- `npm run typecheck` : ✅ réussi (shared + server + client).
- `npm run build` : ✅ réussi (serveur compilé + client bundlé).

## Détail serveur

| Fichier | Tests | Couvre |
|---|---|---|
| `domain/scoring.test.ts` | 9 | scores, bonus de rapidité, crédit partiel, départage |
| `domain/states.test.ts` | 8 | machines à états, verrouillage d'entrée |
| `realtime/engine.test.ts` | 10 | horloge, soumissions, idempotence, réponses tardives, résultats, classements, équipes |
| `realtime/socket.e2e.test.ts` | 3 | synchro host↔participant sur le fil, clôture par l'horloge serveur (mesurée ~5,96 s), refus tardif |
| `modules/phase2.service.test.ts` | 16 | auth, sessions, participants, activités, snapshots |
| `app.e2e.test.ts` | 8 | parcours HTTP complet (setup→login→session→QR→join→quiz) |
| `modules/exchange/exchange.test.ts` | 4 | export CSV, export/import JSON, rapport |
| `modules/maintenance/*.test.ts` | 2 | reprise après incident, sauvegarde |
| `lib/rateLimit.test.ts` | 3 | limitation de débit |
| `modules/media/media.test.ts` | 3 | validation du type réel d'image |
| `db/migrate.test.ts` | 3 | migrations, idempotence, contraintes d'unicité |
| `app.test.ts`, `net/lan.test.ts` | 3 | santé API, URL LAN sans localhost |

## Essais runtime (hors suite automatisée, exécutés manuellement)

| Essai | Commande | Résultat |
|---|---|---|
| Démarrage réel | `node server/dist/index.js` | ✅ migrations, /api/health, client servi, QR LAN |
| Parcours HTTP complet | curl + cookies | ✅ 401 sans cookie, join public, quiz attaché |
| Upload média — vrai PNG | `curl -F image=@px.png` | ✅ accepté (image/png) |
| Upload média — faux .png (script) | `curl -F image=@fake.png` | ✅ refusé (HTTP 400) |
| Export activités JSON | GET `/api/activities/export.json` | ✅ schéma correct |
| Seed de démo | `npm run seed:demo` | ✅ idempotent |
| Charge ~40 participants (simulée) | `node scripts/loadtest.mjs --n 40` | ✅ 40/40 entrées et soumissions ; latence entrée p50/p95 86/100 ms, soumission 18/34 ms |

## Non exécuté / limites connues

- **Essai LAN multi-appareils réel** : NON exécuté (environnement de développement sans appareils
  physiques sur un réseau Wi-Fi). Le test de charge est une **simulation mono-machine**, pas une
  mesure de capacité réseau. À réaliser sur le réseau cible avant d'annoncer une capacité.
- **Compatibilité navigateurs** (Chrome Android/desktop, Edge, Firefox, Safari) : NON vérifiée
  automatiquement ; le client est standard (React/Vite) mais à tester sur les navigateurs cibles.
- **Tests UI composant** : couverture minimale côté client (montage de l'app). La logique critique
  est testée côté serveur, où elle fait autorité.
- **Audit de dépendances** : vulnérabilités `npm audit` concentrées dans l'outillage de build
  (non embarqué en production) ; non corrigées car les correctifs forcent des montées majeures
  cassantes. À réévaluer avant un déploiement en ligne.

## Reproduire

```bash
npm install
npm run typecheck
npm run build
npm test
```
