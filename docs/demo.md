# Scénario de démonstration reproductible

Déroulé complet, réalisable hors ligne sur le réseau local. Durée ≈ 10 min.

## Préparation

1. Sur l'ordinateur organisateur : `npm start`.
2. Noter l'URL LAN et le port affichés. Autoriser Node.js dans le pare-feu si demandé (§4 du guide Windows).
3. (Optionnel) `npm run seed:demo` pour des activités [DÉMO] prêtes à l'emploi.

## Déroulé

1. **Lancement** — Le panneau de démarrage affiche l'URL LAN, le port, le code et le QR.
2. **Connexion organisateur** — Ouvrir `http://localhost:4000/host`, créer le compte (1re fois) ou se connecter.
3. **Création de session** — « Démarrer maintenant » avec un titre. Le code et le QR s'affichent dans le détail de session.
4. **Projection** — « Ouvrir la projection » dans un onglet branché au vidéoprojecteur.
5. **Connexion de 2+ participants** — Sur deux smartphones (ou onglets privés), scanner le QR ou saisir le code, choisir un pseudonyme. Ils apparaissent dans la liste de présence de la console.
6. **Quiz chronométré** — Ajouter un quiz (ou utiliser celui de démo), « Démarrer ». Le minuteur tourne sur les 3 surfaces. Les participants répondent. À la fin (ou « Clôturer »), publier les résultats : la projection affiche l'histogramme et la bonne réponse.
7. **Sondage** — Ajouter/démarrer un sondage ; les résultats s'affichent selon la visibilité choisie (immédiate pour la démo).
8. **Q&A** — Ajouter/démarrer une Q&A : les participants posent des questions (anonymes possible) et votent ; l'organisateur modère et choisit ce qui va à la projection.
9. **Rapport & export** — Consulter le classement (individuel/équipe) ; télécharger l'export CSV et le bundle JSON.
10. **Déconnexion/reconnexion** — Fermer puis rouvrir l'onglet d'un participant : il se reconnecte avec son pseudonyme et ses réponses confirmées, sans doublon, sans pouvoir répondre tardivement.
11. **Sauvegarde/restauration** — Diagnostic → « Sauvegarder maintenant ». (Restauration : voir `docs/exploitation.md`.)
12. **Clôture** — Clôturer la session ; consulter le rapport final.

## Checklist d'acceptation (critères minimaux de livraison)

- [x] L'application démarre localement avec des instructions reproductibles.
- [x] Le serveur crée et conserve une session et ses activités dans SQLite.
- [x] Un participant rejoint par code/QR depuis un appareil sur le LAN (URL LAN, jamais localhost).
- [x] Quiz, sondage et Q&A fonctionnent réellement.
- [x] Les trois interfaces sont séparées et synchronisées en temps réel.
- [x] Scores, délais, permissions et visibilité contrôlés côté serveur.
- [x] Les réponses confirmées survivent à un rechargement/reconnexion et au redémarrage (reprise).
- [x] L'export produit des fichiers lisibles et validés (CSV/JSON).
- [x] Les tests exécutés et non exécutés sont rapportés honnêtement (voir `docs/rapport-tests.md`).
- [x] Aucune fonctionnalité incomplète n'est présentée comme terminée.

## Nettoyage des données de démo

Les éléments de démo sont préfixés « [DÉMO] ». Pour repartir d'une base vierge : arrêter le serveur,
supprimer `server/data/kaiju.sqlite*`, relancer. (Une suppression ciblée depuis l'UI peut aussi être
utilisée pour les vraies sessions.)
