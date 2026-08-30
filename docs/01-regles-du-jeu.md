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
- **Spécificité de cette variante : le collecteur.** Le plateau se compose de `N` **bouteilles
  standard** de capacité **uniforme** `C = 4` et d'**un collecteur** unique — la colonne de
  gauche — de capacité `K = 4 x C = 16`. Les silhouettes des bouteilles standard varient
  (habillage graphique) mais **pas** leur capacité : seul le nombre de couches compte.
- **Le collecteur n'est pas une simple grande bouteille.** Il est associé à une **couleur de
  collecte** fixée par le niveau. Quand une bouteille standard se retrouve **pleine de cette
  couleur**, elle ne se bouche pas : son contenu part **automatiquement** dans le collecteur et
  la bouteille redevient vide. Le collecteur ne se bouche qu'une fois plein. C'est le cœur
  tactique du jeu : la couleur de collecte se rassemble par lots de `C`, et chaque lot expédié
  **libère une bouteille** — la ressource la plus rare du puzzle.

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
| **Collecteur** | L'unique bouteille de capacité `K`, dédiée à une seule couleur. |
| **Couleur de collecte** | La couleur associée au collecteur, fixée par le niveau. |
| **Transfert automatique** | Vidage automatique d'une bouteille standard pleine de la couleur de collecte vers le collecteur. Ce n'est pas un coup du joueur. |

### 2.1 État du jeu

```
Level {
  colors        : liste des couleurs utilisées
  bottles       : liste de Bottle        // l'ordre définit la position à l'écran
  collectorId   : id de la bouteille collecteur
  collectColor  : Color                  // couleur associée au collecteur
}

Bottle {
  id         : entier                    // stable, sert de référence dans l'historique
  capacity   : entier > 0                // C pour les standard, K pour l'unique grande
  content    : liste de Color            // du fond vers le goulot, len <= capacity
}
```

Le modèle porte volontairement `capacity` **par bouteille** plutôt qu'une constante globale :
c'est la structure la plus simple qui décrit à la fois les standard et la grande, et elle
n'interdit pas d'introduire plus tard d'autres tailles. La contrainte « toutes les standard
partagent la même capacité » est une règle de **validité de niveau** (§6.1), pas une contrainte
du modèle.

Invariants permanents (à vérifier par assertion en dev) :

- **I1** — `0 <= len(content) <= capacity` pour toute bouteille.
- **I2** — Pour chaque couleur `c` : `total(c)` (nombre d'unités de `c` sur le plateau) est
  **constant** tout au long de la partie. Aucune unité n'est créée ni détruite.
- **I3** — Chaque couleur dispose d'un contenant capable de l'accueillir entièrement :
  `total(c) = C` pour toute couleur ordinaire, `total(collectColor) = K` pour la couleur de
  collecte. Voir §6.1.
- **I4** — Le collecteur ne contient jamais que la couleur de collecte, et son remplissage est
  monotone croissant (aucun coup n'en retire d'unité).

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
   tête de `source` ;
6. `source` n'est pas le collecteur : celui-ci est un **puits**, il se remplit mais ne se vide
   jamais (invariant I4).

Le collecteur **est** en revanche une destination manuelle valide : le joueur peut y verser
directement depuis une bouteille standard, sans attendre d'en avoir rempli une entièrement. La
condition 5 s'y applique normalement, ce qui revient — le collecteur ne contenant jamais que la
couleur de collecte — à n'accepter que celle-ci. `[À CONFIRMER]` Lorsque le collecteur démarre
**vide**, la condition 5 laisserait passer n'importe quelle couleur : il faut alors la
restreindre explicitement à `collectColor`.

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

## 4. Résolution après un coup : bouchon ou transfert automatique

Après chaque coup, le moteur applique une **phase de résolution** déterministe, qui n'est pas
un coup du joueur et ne se compte pas dans le score. Deux cas s'excluent mutuellement.

### 4.1 Bouchon (couleurs ordinaires)

Une bouteille standard **pleine et monochrome d'une couleur autre que la couleur de collecte**
passe à l'état **complétée** :

- elle reçoit un **bouchon en liège** ;
- elle est **verrouillée** : plus jamais source ni destination.

Une bouteille monochrome mais **non pleine** n'est pas complétée et reste jouable — cohérent
avec les captures, où une bouteille remplie au tiers d'une seule couleur ne porte pas de
bouchon.

### 4.2 Transfert automatique (couleur de collecte)

Une bouteille standard **pleine de la couleur de collecte** ne se bouche **pas**. À la place :

1. animation de versement de la bouteille vers le collecteur ;
2. ses `C` unités sont déplacées dans le collecteur ;
3. la bouteille standard redevient **vide** et immédiatement réutilisable.

Le transfert est **automatique et obligatoire** : le joueur ne le déclenche ni ne le refuse.
Il automatise un coup que le joueur pourrait faire à la main (§3.1) — son intérêt est
d'économiser une manipulation et de rendre la bouteille disponible immédiatement. C'est cette
libération de bouteilles qui alimente la suite du puzzle.

**Pas d'enchaînement possible** : un transfert vide une bouteille, il ne peut donc pas rendre
une autre bouteille pleine. La phase de résolution converge en une seule passe.

**Débordement : impossible par construction.** Le collecteur ne peut pas manquer de place pour
un transfert. Démonstration : sous V1 (§6.1) `total(collectColor) = K`, et le collecteur ne
contient que cette couleur ; s'il lui reste `f` unités libres, alors `K - f` unités y sont déjà
et les `f` restantes sont réparties ailleurs sur le plateau. Une bouteille standard pleine de
la couleur de collecte en contient `C`, donc `f >= C`. Le repli — transfert partiel laissant le
reste dans la bouteille standard — ne doit donc jamais s'observer ; s'il se déclenche, c'est un
bug de génération de niveau et il doit remonter comme tel.

### 4.3 Bouchon du collecteur

Le collecteur reçoit son bouchon lorsqu'il est **plein** (`K` unités de la couleur de collecte).
Il est alors verrouillé, comme une bouteille complétée ordinaire. La couleur de collecte est
définitivement rangée.

### 4.4 État initial

Un niveau ne doit **pas** contenir, à l'état initial, de bouteille standard déjà pleine de la
couleur de collecte : ce serait un transfert automatique gratuit avant le premier coup. C'est
une règle de validité du générateur (§6.1), pas un cas à traiter à l'exécution.

### 4.5 Annulation

L'annulation restaure l'état exact précédent, **bouchons et transferts automatiques compris** :
annuler le coup qui a rempli une bouteille de la couleur de collecte remet ces `C` unités dans
la bouteille standard et les retire du collecteur. Un coup et sa résolution forment donc **une
seule entrée d'historique** indivisible.

---

## 5. Conditions de fin de partie

### 5.1 Victoire

La partie est gagnée quand **toute couleur est entièrement regroupée** : pour chaque couleur `c`,
toutes ses unités se trouvent dans une seule et même bouteille.

Formulation équivalente et plus simple à tester : **chaque bouteille est vide ou monochrome**.
Pour la couleur de collecte, cela revient à dire que le collecteur est plein et bouché (§4.3),
puisque toutes ses unités doivent s'y trouver.

> ⚠️ Ne **pas** exiger que chaque bouteille pleine soit la condition de victoire. Une couleur
> peut légitimement terminer dans la grande bouteille sans la remplir (si `total(c) < K`), ou
> dans une standard partiellement remplie. La condition « monochrome » est la bonne ; la
> condition « pleine » ne sert qu'à décider du bouchon (§4).

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

- **V1** — Structure du plateau : `N` bouteilles standard de capacité `C = 4` et **un**
  collecteur de capacité `K = 16`. Pour chaque couleur ordinaire `total(c) = C` ; pour la
  couleur de collecte `total(collectColor) = K` exactement — assez pour remplir le collecteur,
  et pas davantage, faute de quoi le reliquat resterait orphelin dans une bouteille standard.
  Corollaire : `(nb_couleurs - 1) * C + K` unités à trier.
- **V1b** — Le contenu initial du collecteur est **exclusivement** de la couleur de collecte et
  strictement inférieur à `K` (sinon le niveau démarre déjà résolu pour cette couleur). Aucune
  contrainte de congruence n'est nécessaire : le versement manuel (§3.1) permet de compléter le
  collecteur par n'importe quelle quantité, là où le transfert automatique procède par lots
  de `C`.
- **V1c** — Aucune bouteille standard n'est, à l'état initial, pleine de la couleur de collecte
  (§4.4), ni pleine et monochrome d'une couleur ordinaire.
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
| Rapport `K / C` | Volume à acheminer vers le collecteur (l'équivalent de `4` bouteilles standard pour `K = 4C`). |
| Remplissage initial du collecteur | 0 unité = 4 lots à constituer (dur) ; 12 unités = 1 seul lot (facile). Levier le plus lisible pour la courbe de progression. |
| Part de la couleur de collecte | Elle occupe `K` unités, soit bien plus qu'une couleur ordinaire : elle sature le plateau au départ et le libère progressivement. |
| Fragmentation initiale | Nombre de blocs par couleur : plus il y a de blocs éparpillés, plus c'est long. |
| Couleurs proches visuellement | À **éviter** — c'est de la difficulté perçue comme injuste, et un problème d'accessibilité (§8). |

### 6.3 Génération

Méthode retenue : **génération par marche arrière**.

1. Partir de l'état résolu : chaque couleur ordinaire groupée dans une bouteille standard, la
   couleur de collecte entièrement dans le collecteur (`K` unités).
2. Appliquer des **coups inverses** valides (mélange), en refusant ceux qui ramènent à un état
   déjà visité. Deux familles de coups inverses :
   - inverse d'un transvasement : reprendre `q` unités du sommet d'une bouteille et les rendre
     à une autre ;
   - **inverse d'un versement vers le collecteur** : retirer `q <= C` unités du collecteur et
     les rendre à une bouteille standard. Le cas `q = C` vers une bouteille vide est l'inverse
     du transfert automatique ; il faut ensuite continuer à disperser ces unités, faute de quoi
     V1c serait violée.
3. Vérifier V1–V4 ; relancer le solveur pour obtenir la longueur optimale.

Ce procédé garantit la solvabilité par construction, contrairement à un tirage aléatoire qui
doit être filtré a posteriori.

### 6.4 Format de niveau (proposition)

```json
{
  "id": "level-0042",
  "name": "Harder than you think",
  "colors": ["orange", "green", "blue", "dark", "white"],
  "standardCapacity": 4,
  "collectorId": 0,
  "collectColor": "orange",
  "bottles": [
    { "id": 0, "capacity": 16, "content": ["orange", "orange", "orange", "orange"] },
    { "id": 1, "capacity": 4,  "content": ["green", "dark", "dark", "dark"] },
    { "id": 2, "capacity": 4,  "content": [] }
  ],
  "par": 38
}
```

- `content` est listé **du fond vers le goulot**.
- `capacity` reste explicite sur chaque bouteille ; `standardCapacity` sert au validateur, qui
  vérifie qu'exactement une bouteille s'en écarte — le collecteur, désigné par `collectorId`.
- `collectColor` est redondante avec le contenu initial du collecteur quand celui-ci n'est pas
  vide, mais doit rester explicite : un collecteur peut démarrer à 0 unité (V1b).
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
- **Fonction successeur** : appliquer le coup **puis** la phase de résolution (§4) — bouchon et
  transfert automatique font partie de la transition, pas d'un état intermédiaire. Un état du
  graphe est donc toujours un état « stabilisé ».
- **Heuristique admissible** proposée : `sum(nb_blocs(c) - 1)` sur toutes les couleurs — chaque
  bloc surnuméraire d'une couleur exige au minimum un versement. Les unités déjà dans le
  collecteur comptent pour un seul bloc, ce qui reste admissible.
- **Élagage propre au collecteur** : verser la couleur de collecte vers le collecteur ne réduit
  jamais les possibilités (le collecteur est un puits monotone, invariant I4). Quand un tel coup
  est disponible, il est toujours au moins aussi bon que les autres : on peut le jouer
  d'autorité sans perdre l'optimalité. C'est l'élagage le plus rentable du solveur.
- **Canonisation d'état** indispensable : les bouteilles standard, toutes de capacité `C`, sont
  permutables entre elles → les trier par contenu avant de hacher. Le collecteur n'est **pas**
  permutable (capacité et rôle distincts) : le représenter à part, et comme il ne contient
  qu'une couleur, son état se résume à un entier — son remplissage. Clé d'état :
  `(remplissage_collecteur, contenus_standard_triés)`.
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
| Q10 | Le collecteur peut-il être **source** d'un versement ? | §3.1 | Non — c'est un puits (I4) |
| Q11 | Collecteur démarrant **vide** : accepte-t-il n'importe quelle couleur, ou seulement `collectColor` ? | §3.1 | Seulement `collectColor`, restriction explicite |
| Q12 | `K = 16` et `C = 4` sont-ils constants sur tous les niveaux, ou variables selon la difficulté ? | §6.1 | Paramètres de niveau, `K = 16` par défaut |
| Q13 | Un niveau peut-il avoir **plusieurs** collecteurs, ou zéro ? | §2.1 | Exactement un en v1 |
| Q14 | Le transfert automatique compte-t-il dans le nombre de coups affiché / le `par` ? | §4 | Non |

---

## 11. Hors périmètre de ce document

Progression et carte des niveaux, monétisation, publicités, sauvegarde et synchronisation,
sons et habillage, classements. À traiter séparément une fois le cœur de jeu figé.
