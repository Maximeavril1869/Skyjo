# Carnet de bord

Journal de toutes les opérations du projet, pour pouvoir le reprendre sans rien perdre. Les entrées les plus récentes sont en bas ; l'état courant est résumé en tête.

## État courant

- Trois modes jouables (ordinateur, passe-passe, face à face), 2 à 8 joueurs, ordinateur à 3 niveaux. Testé en navigateur simulé uniquement.
- **Non testé sur un vrai iPad.**
- Pas de mode téléphone pour l'instant (voir « À faire »).

## À faire

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
