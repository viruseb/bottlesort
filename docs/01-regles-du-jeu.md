# Bottle Sort — Définition des règles du jeu

> Statut : **spécification fonctionnelle v0.1** — document de référence avant tout code.
> Toute décision marquée `[À CONFIRMER]` doit être tranchée avant la phase d'implémentation.

---

## 1. Vue d'ensemble

Bottle Sort est un puzzle de tri de liquides colorés, de la famille des *Water Sort Puzzle* /
*Ball Sort Puzzle*. Le plateau présente un ensemble de bouteilles contenant des couches de
liquide de plusieurs couleurs, empilées dans le désordre. Le joueur transvase le contenu d'une
bouteille vers une autre jusqu'à ce que chaque couleur soit regroupée dans une seule bouteille.

Caractéristiques du jeu :

- **Aucun hasard en cours de partie.** L'état initial est fixé par le niveau ; tous les coups
  sont déterministes. C'est un puzzle d'information parfaite, pas un jeu de chance.
- **Aucune limite de temps ni de nombre de coups** (par défaut).
- **Difficulté par blocage** : un mauvais enchaînement mène à une position insoluble, d'où la
  nécessité d'un système d'annulation (*undo*) et d'un garde-fou de détection de blocage.
- **Spécificité de cette variante : les bouteilles ont des capacités différentes.** C'est le
  point qui distingue le plus ce jeu d'un Water Sort classique (où toutes les tubes ont 4 unités)
  et qui conditionne toute la conception : génération de niveaux, solveur, rendu.

---

## 2. Glossaire et modèle de données

| Terme | Définition |
|---|---|
| **Unité** | Plus petite quantité de liquide indivisible. Une couche visible = 1 unité. |
| **Couleur** | Identifiant d'un liquide. Deux liquides de même couleur sont interchangeables. |
| **Bouteille** (*container*) | Récipient de capacité `capacity` unités, contenant une pile ordonnée d'unités. |
| **Pile** | Contenu d'une bouteille, ordonné du **fond** (index 0) vers le **goulot** (dernier index). |
| **Sommet** | Unité au goulot ; c'est la seule accessible. |
| **Bloc de tête** (*top run*) | Suite maximale d'unités consécutives de même couleur au sommet. |
| **Espace libre** | `capacity - len(pile)`. |
| **Bouteille vide** | `len(pile) == 0`. |
| **Bouteille pleine** | `len(pile) == capacity`. |
| **Bouteille monochrome** | Toutes les unités de la même couleur (une bouteille vide est un cas particulier). |
| **Bouteille complétée** | Pleine **et** monochrome → elle est bouchée (liège) et verrouillée. |
| **Transvasement** (*pour*) | Un coup : déplacement d'unités d'une bouteille source vers une destination. |

### 2.1 État du jeu

```
Level {
  colors     : liste des couleurs utilisées
  bottles    : liste de Bottle           // l'ordre définit la position à l'écran
}

Bottle {
  id         : entier                    // stable, sert de référence dans l'historique
  capacity   : entier > 0                // capacité en unités — HÉTÉROGÈNE
  content    : liste de Color            // du fond vers le goulot, len <= capacity
}
```

Invariants permanents (à vérifier par assertion en dev) :

- **I1** — `0 <= len(content) <= capacity` pour toute bouteille.
- **I2** — Pour chaque couleur `c` : `total(c)` (nombre d'unités de `c` sur le plateau) est
  **constant** tout au long de la partie. Aucune unité n'est créée ni détruite.
- **I3** — Pour chaque couleur `c`, il existe au moins une bouteille de capacité
  `>= total(c)`, sinon le niveau est insoluble par construction. *(Conséquence directe des
  capacités hétérogènes ; voir §6.)*

---

## 3. Règle de transvasement (le coup)

Un coup est un couple `(source, destination)` avec `source != destination`.

### 3.1 Conditions de légalité

Le coup est **légal** si et seulement si **toutes** les conditions suivantes sont réunies :

1. `source` n'est pas vide ;
2. `source` n'est pas complétée (bouchée) — voir §4 ;
3. `destination` n'est pas complétée (bouchée) ;
4. `destination` a au moins 1 unité d'espace libre ;
5. `destination` est vide **ou** la couleur de son sommet est égale à la couleur du bloc de
   tête de `source`.

Un coup illégal est refusé sans modifier l'état (et sans consommer de coup, ni d'annulation).

### 3.2 Quantité transvasée

Soit `n = taille du bloc de tête de source` et `f = espace libre de destination`.
La quantité effectivement versée est :

```
q = min(n, f)
```

- Le versement est **partiel** si `f < n` : il reste `n - q` unités de cette couleur dans la
  source. C'est un comportement voulu et un ressort tactique majeur, renforcé ici par les
  capacités hétérogènes.
- On ne verse **jamais** au-delà du bloc de tête, même si l'unité suivante est de même couleur
  après coup (par définition du bloc de tête maximal, ce cas ne peut pas se produire).

### 3.3 Effet

Retirer `q` unités du sommet de `source`, empiler `q` unités de cette couleur au sommet de
`destination`. Puis appliquer la règle de complétion (§4).

### 3.4 Restriction « versement inutile » `[À CONFIRMER]`

Proposition : interdire (ou au minimum ne pas compter comme un coup) le transvasement d'une
bouteille **monochrome vers une bouteille vide**, qui ne fait que déplacer le problème et
pollue l'historique. Deux options :

- **A** — l'autoriser (règle pure, plus permissive) ;
- **B** — l'interdire (anti-frustration, évite les boucles d'annulation stériles). **Recommandé.**

---

## 4. Complétion et verrouillage d'une bouteille

Après chaque coup, toute bouteille **pleine et monochrome** passe à l'état **complétée** :

- elle reçoit visuellement un **bouchon en liège** ;
- elle est **verrouillée** : elle ne peut plus être ni source ni destination.

`[À CONFIRMER]` Une bouteille monochrome mais **non pleine** n'est pas complétée et reste
jouable : c'est cohérent avec les captures de référence (une bouteille contenant une seule
couleur au tiers de sa hauteur n'y porte pas de bouchon).

`[À CONFIRMER]` Le verrouillage doit-il être réversible par *undo* ? **Oui** : l'annulation
restaure l'état exact précédent, bouchon compris.

---

## 5. Conditions de fin de partie

### 5.1 Victoire

La partie est gagnée quand **toute couleur est entièrement regroupée** : pour chaque couleur `c`,
toutes ses unités se trouvent dans une seule et même bouteille.

Formulation équivalente et plus simple à tester : **chaque bouteille est vide ou monochrome**.

> ⚠️ Ne **pas** exiger que chaque bouteille pleine soit la condition de victoire. Avec des
> capacités hétérogènes, une couleur peut légitimement terminer dans une bouteille plus grande
> qu'elle sans la remplir. La condition « monochrome » est la bonne ; la condition « pleine »
> ne sert qu'à décider du bouchon (§4).

### 5.2 Blocage (défaite douce)

Il n'y a pas de défaite : la partie est **bloquée** quand aucun coup légal ne modifie l'état de
façon utile. Détection : aucun couple `(i, j)` ne satisfait §3.1 (en excluant les coups exclus
par §3.4). Le jeu propose alors : **annuler**, **recommencer**, ou **ajouter une bouteille**
(§7.3).

`[À CONFIRMER]` Faut-il détecter aussi les positions *légales mais insolubles* (coups encore
possibles mais victoire hors d'atteinte) ? Cela demande un solveur complet à l'exécution ;
proposition : le faire **hors ligne** à la génération, et à l'exécution seulement en option
« assistance » (grisage des coups perdants).

---

## 6. Structure d'un niveau

### 6.1 Contraintes de validité

Un niveau est **valide** si :

- **V1** — Pour chaque couleur `c` : il existe une bouteille de capacité `>= total(c)`
  (invariant I3). Le cas le plus simple, et recommandé par défaut : `total(c)` est exactement
  la capacité d'une des bouteilles.
- **V2** — Il existe au moins une marge de manœuvre : somme des espaces libres initiaux `>= 1`,
  et en pratique une ou deux bouteilles vides (ou largement entamées) pour rendre le niveau
  jouable.
- **V3** — Le niveau est **prouvé soluble** par le solveur (§6.3). Aucun niveau ne doit être
  publié sans preuve de solvabilité.
- **V4** — Le niveau n'est pas trivial : longueur de la solution optimale supérieure à un seuil
  dépendant de la difficulté.

### 6.2 Paramètres de difficulté

| Levier | Effet |
|---|---|
| Nombre de couleurs | Principal facteur de complexité combinatoire. |
| Nombre de bouteilles | Plus il y en a par rapport aux couleurs, plus c'est facile. |
| Nombre de bouteilles vides / espace libre total | Le levier le plus sensible : 2 vides = confortable, 1 vide = difficile, 0 vide = très contraint. |
| Dispersion des capacités | Capacités très inégales = plus dur à planifier (versements partiels forcés). |
| Fragmentation initiale | Nombre de blocs par couleur : plus il y a de blocs éparpillés, plus c'est long. |
| Couleurs proches visuellement | À **éviter** — c'est de la difficulté perçue comme injuste, et un problème d'accessibilité (§8). |

### 6.3 Génération

Méthode retenue : **génération par marche arrière**.

1. Partir de l'état résolu (chaque couleur groupée dans sa bouteille cible).
2. Appliquer `N` coups inverses valides (mélange), en refusant ceux qui ramènent à un état déjà
   visité.
3. Vérifier V1–V4 ; en particulier relancer le solveur pour obtenir la longueur optimale.

Ce procédé garantit la solvabilité par construction, contrairement à un tirage aléatoire qui
doit être filtré a posteriori.

### 6.4 Format de niveau (proposition)

```json
{
  "id": "level-0042",
  "name": "Harder than you think",
  "colors": ["orange", "green", "blue", "dark", "white"],
  "bottles": [
    { "id": 0,  "capacity": 12, "content": ["orange", "orange", "orange"] },
    { "id": 1,  "capacity": 4,  "content": ["green", "dark", "dark", "dark"] },
    { "id": 2,  "capacity": 3,  "content": [] }
  ],
  "par": 38
}
```

- `content` est listé **du fond vers le goulot**.
- `par` = longueur de la solution optimale trouvée par le solveur, sert au barème d'étoiles.

---

## 7. Interactions et actions du joueur

### 7.1 Sélectionner et verser

Interaction en deux temps (*tap–tap*), pas de glisser-déposer :

1. Premier appui sur une bouteille non vide et non bouchée → elle est **sélectionnée** et se
   soulève légèrement.
2. Deuxième appui :
   - sur une destination valide → le transvasement s'exécute (animation de bascule + coulée) ;
   - sur la bouteille sélectionnée elle-même → désélection ;
   - sur une destination invalide → refus signalé (petite secousse), la sélection est
     conservée `[À CONFIRMER]` (alternative : re-sélectionner la nouvelle bouteille).

Pendant l'animation, les entrées sont ignorées ou mises en file `[À CONFIRMER]` — préférer la
mise en file pour ne pas pénaliser le joueur rapide.

### 7.2 Annuler (*undo*)

- Restaure exactement l'état précédent, y compris les bouchons.
- Historique complet de la partie `[À CONFIRMER]` (vs. profondeur limitée / quota d'annulations
  monétisé). Recommandé pour la version de base : **illimité**, un puzzle sans hasard n'a rien
  à gagner à punir l'exploration.
- **Recommencer** revient à l'état initial du niveau et vide l'historique.

### 7.3 Ajouter une bouteille

Action de secours qui ajoute une bouteille **vide** au plateau. Elle modifie la difficulté du
niveau et doit donc être limitée (une fois par niveau, ou via une récompense).
`[À CONFIRMER]` : capacité de la bouteille ajoutée (fixe ? égale à la plus grande couleur
restante ?) et interaction avec le décompte d'étoiles.

### 7.4 Indice (*hint*)

Propose le prochain coup d'une solution optimale calculée par le solveur. Nécessite que le
solveur tourne sur l'état **courant**, pas seulement sur l'état initial — donc un solveur
suffisamment rapide (§9).

---

## 8. Accessibilité

Point non négociable dans un jeu dont **toute** la mécanique repose sur la couleur :

- Palette distinguable en cas de deutéranopie / protanopie ; ne jamais faire cohabiter dans un
  même niveau deux couleurs proches en luminance et en teinte.
- Mode d'appoint : **motif ou symbole** par couleur, activable en option.
- Contraste suffisant entre liquide et fond de plateau.
- Aucune information critique portée uniquement par une animation.

---

## 9. Solveur (exigence transverse)

Le solveur n'est pas une fonctionnalité optionnelle : il est requis pour la génération (V3, V4),
le calcul du `par`, les indices (§7.4) et les tests de non-régression.

- **Recherche** : BFS pour l'optimalité sur petits niveaux, IDA*/A* avec heuristique pour les
  grands.
- **Heuristique admissible** proposée : `sum(nb_blocs(c) - 1)` sur toutes les couleurs — chaque
  bloc surnuméraire d'une couleur exige au minimum un versement.
- **Canonisation d'état** indispensable : deux bouteilles **de même capacité** et de même
  contenu sont interchangeables → trier les bouteilles par `(capacity, content)` avant de
  hacher. ⚠️ Ne jamais permuter des bouteilles de capacités différentes : contrairement au Water
  Sort classique, elles **ne sont pas** interchangeables ici.
- Limites de temps / nœuds explorés, avec repli sur une solution non optimale si dépassement.

---

## 10. Décisions à trancher (récapitulatif)

| # | Question | Réf. | Proposition |
|---|---|---|---|
| Q1 | Interdire le versement monochrome → bouteille vide ? | §3.4 | Oui (option B) |
| Q2 | Une bouteille monochrome non pleine est-elle bouchée ? | §4 | Non |
| Q3 | Le bouchon est-il réversible par *undo* ? | §4 | Oui |
| Q4 | Détecter à l'exécution les positions insolubles ? | §5.2 | Hors ligne + option d'assistance |
| Q5 | Comportement en cas de destination invalide (sélection conservée ?) | §7.1 | Conservée |
| Q6 | Entrées mises en file pendant l'animation ? | §7.1 | Oui |
| Q7 | *Undo* illimité ou limité ? | §7.2 | Illimité en v1 |
| Q8 | Capacité et coût de la bouteille ajoutée | §7.3 | À définir |
| Q9 | Barème d'étoiles / progression / méta-jeu | — | Hors périmètre v1 |
| Q10 | La très grande bouteille (colonne) a-t-elle une règle propre, ou est-ce une bouteille ordinaire de grande capacité ? | §2.1 | Bouteille ordinaire |

---

## 11. Hors périmètre de ce document

Progression et carte des niveaux, monétisation, publicités, sauvegarde et synchronisation,
sons et habillage, classements. À traiter séparément une fois le cœur de jeu figé.
