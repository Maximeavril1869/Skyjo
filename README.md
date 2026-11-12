# Skyjo

Skyjo en application web (PWA) pour iPad : 2 à 8 joueurs, avec ordinateur à trois niveaux (débutant, normal, fort).

## Modes

- **Contre l'ordinateur** : toi + 1 à 7 adversaires.
- **À deux, on se passe l'appareil** : deux joueurs, plus 0 à 6 ordinateurs. Un écran « passe l'iPad » s'affiche quand la main change.
- **À deux, face à face** : iPad posé à plat, une grille devant chacun, retournements du début simultanés.

- **En ligne, chacun son appareil** : deux humains au maximum, chacun sur son appareil (iPhone, iPad, téléphone Android…), plus 0 à 6 ordinateurs pour compléter la table. Il faut un compte (le même que pour les autres applications) ; on crée une partie, on reçoit un code à 4 lettres, l'autre joueur le tape. Les mains cachées sont masquées à l'écran mais présentes dans les données : le jeu repose sur la confiance entre les deux joueurs.
- **Plateau (iPad posé au milieu)** : dans l'accueil, en mode En ligne, taper le code de la partie puis « Afficher en plateau ». L'écran montre les grilles de tous, la pioche, la défausse et le tour en cours, sans y jouer ; chaque joueur joue sur son téléphone. Le plateau n'occupe aucun siège et ne compte pas parmi les deux humains.
- Les anciens modes « on se passe l'appareil » et « face à face » sont masqués ; `?anciens=1` à la fin de l'adresse les réaffiche (provisoire, le temps de valider l'en ligne sur les appareils réels).

## Règles (officielles)

150 cartes (−2 ×5, −1 ×10, 0 ×15, 1 à 12 ×10), 12 cartes par joueur en 4 colonnes de 3. Trois cartes identiques visibles dans une colonne : la colonne est retirée. La manche s'arrête quand un joueur n'a plus de carte cachée (les autres jouent un dernier tour) ; qui a fini sans avoir le score strictement le plus bas voit son score doublé s'il est positif. La partie s'arrête quand un total atteint 100 : le plus bas gagne.

## Installer sur l'iPad

Ouvrir l'adresse GitHub Pages dans Safari, puis Partager → « Sur l'écran d'accueil ». Fonctionne ensuite hors ligne.

## Développement

```
node --test tests/engine.test.js     # moteur et niveaux de l'ordinateur
python3 -m http.server 8123          # puis : python3 tests/e2e/solo.py solo 3
python3 tests/e2e/en_ligne.py        # deux appareils simulés + faux serveur Supabase (53 vérifications)
```

Voir `ARCHITECTURE.md` (structure) et `CARNET_DE_BORD.md` (historique et suite).

## Licence

Tous droits réservés © Maximeavril1869. Code publié pour consultation uniquement ; toute réutilisation exige l'autorisation écrite de l'auteur. Voir le fichier `LICENSE`.
