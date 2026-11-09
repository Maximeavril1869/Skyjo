# Architecture

Application web statique, sans compilation ni serveur : HTML + JavaScript « classique » (ni module ni framework), comme les autres jeux du même auteur. Tout l'état est dans le navigateur (`localStorage`). Aucune bibliothèque tierce.

## Fichiers

```
index.html            Écrans (accueil, partie, face à face), styles, modales (règles, scores, menu), voile et fin de manche
engine.js             Moteur pur : cartes, déroulement d'une manche, scores, ordinateur (3 niveaux). Testable sous Node
app.js                Interface : accueil, modes, mise en page, rendu, sauvegarde
sw.js                 Service worker : cache hors ligne (réseau d'abord, cache en secours)
manifest.webmanifest, icons/    PWA
tests/engine.test.js            Tests du moteur (node --test)
tests/e2e/solo.py               Parcours navigateur (Playwright) : solo, passe, duo
```

Ordre de chargement : `engine.js`, `app.js`.

## Moteur (`engine.js`)

Une manche est un objet JSON `R` (donc sauvegardable tel quel) :

```
grids[p]   12 cases { v, up, gone } ; indice = 3 × colonne + ligne (4 colonnes de 3)
deck, discard   pioche et défausse (le dessus = dernier élément)
turn, phase     'init' (chacun retourne 2 cartes) | 'draw' | 'place' | 'flip' | 'over'
hand, src       carte en main et origine ('deck' ou 'discard')
endedBy, remaining   joueur qui a fini la manche, tours restants aux autres
seen            nombre de cartes de chaque valeur déjà vues (pour l'ordinateur)
scores, doubled résultat de la manche
events/prevEvents    actions du tour en cours / du dernier tour terminé (affichage « dernier coup »)
```

Déroulement d'un tour : `takeDiscard` (puis `place` obligatoire) ou `drawDeck` (puis `place`, ou `discardDrawn` suivi de `flip`). `place`/`flip` terminent l'action : retrait des colonnes de trois cartes identiques visibles, détection de la fin de manche, passage au joueur suivant. `finishRound` retourne tout, calcule les scores et double celui de qui a fini sans être strictement le plus bas (s'il est positif).

Ordinateur (`aiInit`, `aiTurn`) : il ne triche pas (il ne lit que les cartes visibles et le comptage `seen`).
- niveau 1 : règles simples, un quart de coups au hasard ;
- niveau 2 : choisit la meilleure pose selon l'espérance de gain, avec garde-fou avant de finir une manche à score élevé (`L2_FINISH_MAX`) ;
- niveau 3 : comme le 2, avec comptage des cartes restantes, bonus de préparation de colonnes et gestion fine de la fin de manche.

Force mesurée en duels (tests) : le normal gagne ~88 % des manches contre le débutant ; le fort ~62 % contre le normal.

## État de partie (`G`, sauvegardé sous `skyjo_partie_v1`)

```
mode          'solo' | 'passe' | 'duo'
seats         [{ name, bot }]  bot = 0 pour un humain, sinon niveau 1 à 3 ; humains en premier
totals        totaux cumulés ; rounds : [{ s: scores, d: joueur doublé ou -1 }]
R, roundNo    manche courante
nextStarter   celui qui a fini la manche précédente (commence la suivante) ; -1 = plus forte somme initiale
view, veil    mode passe : joueur affiché, écran « passe l'iPad »
note, over    dernier coup décrit, partie terminée
```

`step()` est la boucle centrale : lance la manche quand tous ont retourné 2 cartes, comptabilise la fin de manche, gère le voile du mode passe, sauvegarde, dessine, puis programme le coup de l'ordinateur (1 s).

## Écrans

| Écran | Mode | Contenu |
|---|---|---|
| `#home` | tous | mode, nombre d'ordinateurs, niveau, prénoms, reprise |
| `#game` | solo, passe | adversaires en miniature, pioche / défausse / main, ma grille |
| `#duo` | duo | siège du haut tourné de 180°, pioche et défausse au milieu avec les ordinateurs en miniature, siège du bas |
| `#roundOver` | tous | scores de la manche, classement final ; en duo, une moitié par joueur |

Tailles de cartes calculées en JavaScript (`layout()` → `--cw`, `--mw`) selon l'écran et le nombre d'adversaires. Couleurs par valeur : −2/−1 indigo, 0 bleu ciel, 1–4 vert, 5–8 jaune, 9–12 rouge ; indices dans deux coins pour la lecture à l'envers.

## Sauvegardes (localStorage)

| Clé | Contenu |
|---|---|
| `skyjo_partie_v1` | état `G` (reprise après fermeture) |
| `skyjo_prefs_v1` | mode, nombre d'ordinateurs, niveau, prénoms |
