# Carnet de bord

Journal de toutes les opérations du projet, pour pouvoir le reprendre sans rien perdre. Les entrées les plus récentes sont en bas ; l'état courant est résumé en tête.

## État courant

- Modes : contre l'ordinateur, et **En ligne** (2 humains max, chacun son appareil, ordinateurs en complément). Passe-passe et face à face **supprimés** (version 4). 2 à 8 joueurs, ordinateur à 3 niveaux. Testé en navigateur simulé uniquement.
- **Non testé sur un vrai iPad.**
- Pas de mode téléphone pour l'instant (voir « À faire »).

## À faire

- **Skyjo validé sur de vrais appareils (2 parties jouées)** : déployer `en-ligne.js` dans les autres jeux, un dépôt à la fois (5 Rois, 6 qui prend, Flip 7, Le Contrat, Bataille navale — mode téléphone PeerJS remplacé —, EnqueteManoir).

- Tester sur l'iPad et corriger ce qui sort des essais réels (taille des cartes, confort du face à face).
- Étendre le mode « iPad = plateau, téléphone = main » à Skyjo une fois la liaison validée sur la Bataille navale.
- Régler les niveaux de l'ordinateur d'après les parties réelles.

## 2026-11-09 / 2026-11-10

Décisions prises avec l'auteur :

- Règles officielles de Skyjo ; 2 à 8 joueurs ; humains + ordinateurs jusqu'à 8.
- Trois modes : contre l'ordinateur, passe-passe, face à face (iPad à plat).
- Trois niveaux d'ordinateur, à étendre ensuite aux autres jeux de cartes (un dépôt par conversation).
- Pas de mode téléphone dans cette première version.

Opérations :

1. Lecture du socle des autres jeux (PWA, `engine.js` / `app.js`, licence « Tous droits réservés »).
2. `engine.js` et `tests/engine.test.js` (12 tests : paquet, distribution, début, tour, colonnes, fin de manche et doublement, égalités, scores négatifs, fin de partie, pioche recyclée, manches complètes de l'ordinateur à 2–8 joueurs, duels entre niveaux).
3. Réglage des niveaux : le 2 finissait trop tôt avec un score élevé (doublé) → garde-fou ; le 1 rendu volontairement plus faible. Mesures : normal bat débutant 88 % des manches, fort bat normal 62 %.
4. `index.html` et `app.js` : accueil, trois modes, miniatures des adversaires, face à face avec siège du haut retourné, voile du passe-passe, fin de manche, scores, règles, sauvegarde.
5. Icônes, `manifest.webmanifest`, `sw.js`, `LICENSE`, `README.md`, `ARCHITECTURE.md`.
6. Parcours Playwright (`tests/e2e/solo.py`) : parties complètes dans les trois modes ; captures iPad portrait et paysage, iPhone, 8 joueurs.
7. Corrections pendant les essais : face à face (carte en main qui agrandissait l'en-tête et faisait déborder la grille), tailles de cartes, rangée unique d'adversaires en paysage.
8. Premier envoi sur GitHub (branche `main`).

## 2026-11-12 — Mode « En ligne » (pilote)

Décisions : seulement les jeux à plusieurs ; 2 humains maximum, chacun sur son appareil (iPhone, iPad, téléphone Android de la deuxième personne) ; ordinateurs possibles ; l'en ligne remplace passe-passe et face à face ; mains cachées par confiance ; Skyjo choisi comme pilote.

Opérations :

1. `en-ligne.js` : connexion partagée, création / lecture / écriture à version, liste, suppression, surveillance par interrogation de la version.
2. `index.html` : bouton « En ligne », panneau de connexion / code / parties en cours, salle d'attente, bannière « Hors ligne » ; anciens modes masqués (`?anciens=1`).
3. `app.js` : actions rejouables (`applyAction`, `jouer`), `flush()` avec rejeu après conflit, création / jonction / reprise, tour imposé, ordinateurs joués par l'hôte seulement.
4. `sw.js` : cache `skyjo-v2`, `en-ligne.js` ajouté.
5. `tests/e2e/en_ligne.py` : 42 vérifications avec deux contextes navigateur et un faux Supabase (connexion refusée, code inconnu, troisième personne refusée, retournements simultanés avec conflits rejoués, cartes cachées, coup hors ligne envoyé au retour du réseau, reprise après rechargement, partie complète avec mêmes scores, rejouer, suppression vue par l'autre appareil).
6. Corrigé pendant les essais : test hors ligne (Playwright répond aux requêtes interceptées sans réseau, il faut couper le faux serveur) ; placeholder du code tronqué.

Plateau (même jour, version 3) : sur demande, l'iPad peut servir de plateau commun quand les joueurs sont ensemble, en **affichage seul** (décision de l'auteur) ; les téléphones jouent. Skyjo n'ayant pas de main cachée, le téléphone ne sert qu'à jouer sa grille. Ajouts : écran `#plateau`, bouton « Afficher en plateau (iPad) », 11 vérifications (53 au total : code inconnu, aucune carte cliquable, aucune valeur cachée, pas de siège pris, suit la partie, hors ligne, quitter, suppression).

Limites : pas testé avec le vrai Supabase ni sur de vrais appareils.

## 2026-11-12 (suite) — Version 4 : suppression des anciens modes

Après validation réelle (2 parties jouées sur appareils), suppression de « on se passe l'appareil » et « face à face » : écran `#duo`, voile, champ du deuxième prénom, `renderDuo`, `?anciens=1`, styles associés. Une partie locale enregistrée dans un ancien mode est ignorée. Le plateau est conservé (utile surtout avec beaucoup d'ordinateurs). Tests : moteur 12/12, solo, en ligne 52 vérifications. Cache `skyjo-v4`.
