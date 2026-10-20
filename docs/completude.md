# État de complétude des fonctionnalités

Légende : ✅ terminé et vérifié · 🟡 partiel · ⬜ absent (prévu plus tard).

## Cœur fonctionnel (MVP)

| Fonctionnalité | État | Notes |
|---|---|---|
| Compte organisateur local (bcrypt, cookie) | ✅ | compte unique, setup au 1er démarrage |
| Création de session (rapide / préparée) | ✅ | cycle de vie serveur-autoritaire |
| Code court + QR + URL LAN (jamais localhost) | ✅ | QR en console et au démarrage |
| Entrée participant (pseudonyme, sans compte) | ✅ | aperçu avant entrée |
| Reconnexion sans doublon ni réponse tardive | ✅ | jeton de reconnexion |
| Verrouillage d'entrée pendant activité | ✅ | |
| Mode anonyme (session) | 🟡 | champ présent ; masquage UI à étoffer |
| Quiz (choix unique/multiple, vrai-faux) | ✅ | minuteur, score serveur, corrigé contrôlé |
| Sondage (choix, texte, échelle, nuage de mots) | ✅ | visibilité configurable |
| Q&A (soumission, vote, modération, projection) | ✅ | anti-doublon de vote |
| Réponses ouvertes | 🟡 | schéma + stockage ; UI de modération dédiée à compléter |
| 3 interfaces synchronisées temps réel | ✅ | host / participant / projection |
| Minuteries à autorité serveur | ✅ | horloge globale, clôture auto |
| Scores + classement individuel | ✅ | départage documenté |
| Équipes simples + classement d'équipe | ✅ | affectation sans perte de score |
| Visibilité des résultats par surface | ✅ | corrigé jamais fuité |
| Persistance SQLite (avant accusé) | ✅ | transactions + contraintes d'unicité |

## Fiabilité & exploitation

| Fonctionnalité | État | Notes |
|---|---|---|
| Sauvegardes manuelles + automatiques | ✅ | copie cohérente + checksum |
| Reprise après redémarrage | ✅ | clôture des minuteurs expirés |
| Restauration | ✅ | procédure manuelle documentée |
| Limites configurables + rate-limiting | ✅ | capacité non désactivable |
| Panneau diagnostic | ✅ | état, erreurs, sauvegardes |
| Test de charge ~40 participants | ✅ | **simulé** (mono-machine), pas LAN réel |

## Compléments

| Fonctionnalité | État | Notes |
|---|---|---|
| Éditeur d'activités (quiz/sondage/Q&A) | ✅ | |
| Bibliothèque (recherche, duplication) | ✅ | édition par duplication si utilisée |
| Import/export JSON d'activités | ✅ | validé, rapport par ligne |
| Export CSV / bundle JSON des résultats | ✅ | |
| Rapport de session | ✅ | |
| Médias locaux (upload, type réel vérifié) | ✅ | insertion dans les activités : à câbler dans l'éditeur |
| Thème clair + sombre (noir-ardoise) | ✅ | bascule + persistance locale |
| i18n FR/EN | ✅ | interface ; contenu d'activité indépendant |
| Historique / archivage de sessions | 🟡 | liste des sessions ; archivage/restauration UI à étoffer |

## Prévu plus tard (hors MVP)

| Élément | État |
|---|---|
| Insertion d'images dans l'éditeur d'activité (back prêt) | ⬜ |
| Scores d'équipe avancés, podium animé | ⬜ |
| Personnalisation fine des thèmes (couleurs/arrière-plans) | ⬜ |
| Tableau de bord analytique multi-conférences | ⬜ (exclu du MVP par cahier) |
| Tests E2E navigateur + compatibilité multi-navigateurs | ⬜ |
| Fichiers de déploiement en ligne (Docker, etc.) | ⬜ (après autorisation) |

## Rien de factice

Aucun bouton essentiel n'est simulé ; aucune donnée simulée n'est présentée comme réelle. Les
éléments 🟡 sont fonctionnels au niveau back et exposés partiellement côté UI — signalés comme tels,
jamais masqués.
