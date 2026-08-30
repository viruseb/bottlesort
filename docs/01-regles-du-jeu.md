# Bottle Sort — Définition des règles du jeu

> Statut : **spécification fonctionnelle v0.1** — document de référence avant tout code.
> Toute décision marquée `[À CONFIRMER]` doit être tranchée avant la phase d'implémentation.

---

## 1. Vue d'ensemble

Bottle Sort est un puzzle de tri de liquides colorés, de la famille des *Water Sort Puzzle* /
*Ball Sort Puzzle*. Le plateau présente un ensemble de bouteilles contenant des couches de
liquide de plusieurs couleurs, empilées dans le désordre. Le joueur transvase le contenu d'une
bouteille vers une autre jusqu'à ce que chaque bouteille ne contienne plus qu'une seule couleur.

**Une couleur occupe généralement plusieurs bouteilles.** Un plateau type comporte une trentaine
de bouteilles pour quatre ou cinq couleurs : chaque couleur ordinaire remplit donc `m` bouteilles
(typiquement 3 ou 4), et non une seule. C'est la lecture conforme aux captures de référence, où
le plateau est occupé aux deux tiers.

Caractéristiques du jeu :

- **Aucun hasard en cours de partie.** L'état initial est fixé par le niveau ; tous les coups
  sont déterministes. C'est un puzzle d'information parfaite, pas un jeu de chance.
- **Aucune limite de temps ni de nombre de coups** (par défaut).
- **Difficulté par blocage** : un mauvais enchaînement mène à une position insoluble, d'où
  l'importance du garde-fou de détection de blocage (§5.2), d'autant plus grande que la v1 se
  joue sans annulation (§7.2).
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
  collectorId   : id de la bouteille collecteur   // toujours present, exactement un
  collectColor  : Color                  // couleur associée au collecteur, explicite
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
- **I3** — Chaque couleur dispose d'assez de contenants pour l'accueillir entièrement :
  `total(c) = m_c * C` avec `m_c >= 1` bouteilles standard pour toute couleur ordinaire, et
  `total(collectColor) = K` pour la couleur de collecte. Les totaux sont des **multiples de la
  capacité** : à la fin, toute bouteille non vide est pleine. Voir §6.1.
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
directement depuis une bouteille standard, sans attendre d'en avoir rempli une entièrement.

**Le collecteur n'accepte que `collectColor`**, y compris lorsqu'il démarre vide. La condition 5
ne suffit pas à le garantir dans ce cas (un collecteur vide accepterait n'importe quoi) : la
restriction est donc **explicite** dans le moteur, et non déduite du contenu. Corollaire pour le
rendu : la couleur de collecte doit être lisible sur un collecteur vide — teinte du verre,
pastille au pied ou liseré. Sans ce repère, le joueur découvre la contrainte par essai-erreur.

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

### 3.4 Versement d'une monochrome vers une bouteille vide — **autorisé**

Déplacer une bouteille monochrome vers une bouteille vide est **permis**. La règle reste pure :
aucun cas particulier, aucune exception à expliquer au joueur.

Ce choix ne coûte rien au solveur. Toutes les bouteilles standard ayant la même capacité `C`,
un tel coup produit un état **identique après canonisation** (§9) : le multiensemble des
contenus est inchangé, seules deux bouteilles ont échangé leur rôle. C'est donc une boucle sur
elle-même dans le graphe de recherche, éliminée d'office sans traitement particulier.

Conséquence côté joueur en revanche : ce coup consomme un coup au compteur sans faire avancer le
puzzle. Le compteur affiché mesure les actions, pas les progrès.

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

La partie est gagnée quand **toute bouteille est vide ou complétée** — c'est-à-dire pleine et
monochrome, donc bouchée (§4). Le collecteur y compris : `total(collectColor) = K` garantit qu'il
finit plein.

Autrement dit : **le niveau est gagné quand tous les bouchons sont posés.** C'est la formulation
la plus simple à tester, et c'est aussi le signal visuel que le joueur lit déjà à l'écran.

> ⚠️ « Chaque bouteille est vide ou **monochrome** » ne suffit **pas**. Une couleur occupant
> plusieurs bouteilles (§1), cette condition plus faible accepterait une répartition dégénérée —
> 4, 4, 4, 3 puis 1 unité dans cinq bouteilles distinctes : toutes monochromes, aucune mélangée,
> mais la couleur reste éparpillée et deux bouteilles sont gaspillées. Exiger que chaque
> bouteille non vide soit **pleine** force le regroupement complet. C'est possible sans exception
> parce que tous les totaux sont des multiples de `C` (I3).

### 5.2 Blocage (défaite douce)

Il n'y a pas de défaite au sens strict : la partie est **bloquée** quand plus aucun coup ne fait
progresser le puzzle.

Attention à la définition. Le versement d'une monochrome vers une bouteille vide étant autorisé
(§3.4), « aucun coup légal disponible » ne se produit presque jamais : il reste presque toujours
un brassage stérile à jouer. Le critère correct est donc : **aucun coup légal ne change l'état
canonique** (§9) — autrement dit tous les coups possibles se réduisent à des permutations de
bouteilles. C'est ce test qu'il faut implémenter, pas le simple comptage de coups légaux.

Une fois bloqué, le seul recours en v1 est **recommencer** (§7.2) : ni annulation, ni bouteille
de secours.

`[À CONFIRMER]` Faut-il détecter aussi les positions *légales mais insolubles* — des coups
utiles restent jouables, mais la victoire est déjà hors d'atteinte ? Cela demande un solveur
complet à l'exécution. Proposition : vérification **hors ligne** à la génération, et à
l'exécution uniquement si l'on ajoute plus tard un mode assistance.

---

## 6. Structure d'un niveau

### 6.1 Contraintes de validité

Un niveau est **valide** si :

- **V1** — Structure du plateau : `N` bouteilles standard de capacité `C = 4` et **un**
  collecteur de capacité `K = 16`. Pour chaque couleur ordinaire `total(c) = m_c * C` avec
  `m_c >= 1` (typiquement 3 ou 4) ; pour la couleur de collecte `total(collectColor) = K`
  exactement — assez pour remplir le collecteur, et pas davantage, faute de quoi le reliquat
  resterait orphelin. Total à trier : `C * somme(m_c) + K` unités.
  Ordre de grandeur des captures : 4 couleurs ordinaires à `m_c = 3` ou `4` occupent 12 à 16
  bouteilles sur une trentaine, soit un plateau rempli aux deux tiers.
- **V1b** — Le contenu initial du collecteur est **exclusivement** de la couleur de collecte et
  strictement inférieur à `K` (sinon le niveau démarre déjà résolu pour cette couleur). Aucune
  contrainte de congruence n'est nécessaire : le versement manuel (§3.1) permet de compléter le
  collecteur par n'importe quelle quantité, là où le transfert automatique procède par lots
  de `C`.
- **V1c** — Aucune bouteille standard n'est, à l'état initial, pleine de la couleur de collecte
  (§4.4), ni pleine et monochrome d'une couleur ordinaire.
- **V2** — **Marge de manœuvre**, mesurée en **espace libre** et non en nombre de bouteilles :
  la somme des espaces libres des bouteilles standard vaut au moins `C`. Un plateau entièrement
  plein n'offre aucun coup, quel que soit le nombre de contenants ; à l'inverse, compter les
  bouteilles excédentaires ne dit rien, puisque les unités de la couleur de collecte encore en
  jeu occupent elles aussi de la place. En pratique, viser une à deux bouteilles vides.
- **V3** — Le niveau est **prouvé soluble** par le solveur (§6.3). Aucun niveau ne doit être
  publié sans preuve de solvabilité.
- **V4** — Le niveau n'est pas trivial : longueur de la solution optimale supérieure à un seuil
  dépendant de la difficulté.

### 6.2 Paramètres de difficulté

| Levier | Effet |
|---|---|
| Nombre de couleurs | Principal facteur de complexité combinatoire. |
| **Bouteilles par couleur (`m_c`)** | Plus une couleur s'étale sur de bouteilles, plus elle est fragmentée et plus le tri est long. Fait grossir l'espace d'états bien plus vite que le nombre de couleurs. |
| Nombre de bouteilles | Plus il y en a par rapport aux couleurs, plus c'est facile. |
| Nombre de bouteilles vides / espace libre total | Le levier le plus sensible : 2 vides = confortable, 1 vide = difficile, 0 vide = très contraint. |
| Rapport `K / C` | Volume à acheminer vers le collecteur (l'équivalent de `4` bouteilles standard pour `K = 4C`). |
| Remplissage initial du collecteur | 0 unité = 4 lots à constituer (dur) ; 12 unités = 1 seul lot (facile). Levier le plus lisible pour la courbe de progression. |
| Part de la couleur de collecte | Elle occupe `K` unités, soit bien plus qu'une couleur ordinaire : elle sature le plateau au départ et le libère progressivement. |
| Fragmentation initiale | Nombre de blocs par couleur : plus il y a de blocs éparpillés, plus c'est long. |
| **Fragmentation de la couleur de collecte** | Le levier le plus puissant, voir §6.3.3. Quatre blocs de `C` posés à plat = niveau mou ; des unités isolées coiffant d'autres couleurs = niveau tendu. |
| **Enfouissement** | Profondeur moyenne à laquelle une couleur est enterrée sous d'autres. C'est ce qui crée les dépendances entre couleurs. |
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
3. Vérifier V1–V4, puis **mesurer la qualité** du niveau obtenu (§6.3.3) et l'accepter ou le
   rejeter.

Ce procédé garantit la solvabilité par construction, contrairement à un tirage aléatoire qui
devrait être filtré a posteriori — avec un taux de rejet rédhibitoire.

### 6.3.1 Deux pièges de la marche arrière

Ces deux points font échouer la plupart des générateurs à rebours. Ils sont à traiter dès la
première version, pas après coup.

**Le coup inverse n'est pas la symétrie du coup direct.** Un versement direct vide *tout* le
bloc de tête de la source (sauf troncature par la place disponible en destination, §3.2). Si un
pas arrière rend `q` unités à une bouteille `A` dont le sommet porte déjà cette couleur, le bloc
de tête d'`A` devient plus grand que `q` : le coup direct correspondant en verserait davantage
et ne reproduirait pas l'état d'où l'on vient. La parade n'est pas un raisonnement symbolique
mais une **vérification effective** : à chaque pas arrière, reconstruire l'état antérieur, puis
contrôler que le coup direct y est légal **et** redonne exactement l'état suivant. Tout candidat
qui échoue est rejeté.

**Bouchon et transfert automatique sont des propriétés dérivées, jamais stockées dans l'état.**
La marche arrière traverse en permanence des états qui n'existent pas en jeu : défaire un
transfert automatique consiste précisément à créer une bouteille standard pleine de la couleur
de collecte, qui en marche avant se viderait aussitôt. Deux conséquences :

- ces états sont **interdits en sortie** : il faut continuer à disperser ces unités avant de
  s'arrêter, sans quoi V1c est violée ;
- le bouchon doit être **recalculé depuis le contenu** à chaque évaluation. S'il était mémorisé
  dans l'état, une bouteille bouchée par la marche arrière deviendrait une source illégale en
  marche avant, et le niveau produit serait insoluble tout en paraissant valide.

**Troisième piège, découvert à l'implémentation : la marche arrière consomme l'espace libre.**
Sortir des unités du collecteur les fait atterrir dans les bouteilles standard, et rien ne les
en fait ressortir. Sans garde-fou, un mélange un peu long produit des plateaux saturés que la
contrainte V2 rejette — après coup, donc en pure perte. Le filtre doit être appliqué **pendant**
la marche : un pas arrière qui ferait tomber l'espace libre sous `C` est écarté.

### 6.3.2 Le nombre de coups mélangés n'est pas la difficulté

La longueur de la marche arrière est un **majorant** de la longueur de solution, pas une mesure.
Un mélange de 40 pas peut produire un puzzle qui se dénoue en 12 : le chemin parcouru est *une*
solution, rarement la plus courte. Un générateur sans solveur produit donc des niveaux de
difficulté **inconnue**.

La marche arrière seule reste utile comme échafaudage (avoir de quoi remplir un écran pendant le
développement de l'interface), mais **aucun niveau publié ne se passe du solveur**.

### 6.3.3 Critères de qualité d'un niveau

La longueur optimale ne suffit pas : un niveau long peut n'être qu'une suite de coups forcés,
donc ennuyeux. Quatre mesures, toutes calculables avec le solveur :

| Critère | Mesure | Cible |
|---|---|---|
| **Profondeur** | Longueur de la solution optimale (`par`). | Au-dessus du seuil de difficulté (V4), et **court** en v1 : sans annulation (§7.2), un niveau long transforme l'erreur en punition. |
| **Largeur du chemin** | À chaque position de la solution, part des coups légaux qui préservent la solvabilité. | Ni 1 coup correct sur 20 (punitif), ni tous corrects (sans enjeu). C'est l'indicateur qui sépare un puzzle d'une corvée. |
| **Échec du glouton** | Faire jouer un agent qui choisit toujours le coup rassemblant le plus d'unités. | Le glouton doit **échouer** là où le solveur réussit. C'est la signature d'un niveau mémorable : la stratégie évidente mène dans le mur. |
| **Congestion** | Espace libre disponible au fil de la solution. | Doit passer par un creux : le moment où le plateau est le plus saturé est le cœur du niveau. |

**L'ordre des filtres décide du coût de la génération.** Une partie gloutonne coûte quelques
millisecondes, une recherche complète plusieurs secondes. Enchaîner solveur puis glouton fait
tourner la recherche sur des candidats voués au rejet et gaspille l'essentiel du temps. L'ordre
est donc : mesures bon marché, puis glouton, puis solveur en dernier.

### 6.3.4 Où se joue réellement l'intérêt : la couleur de collecte

**Correction (lot 2).** J'ai d'abord écrit ici que le collecteur n'apportait aucune profondeur
de décision, en raisonnant qu'y verser la couleur de collecte était toujours au moins aussi bon
que n'importe quel autre coup. **C'est faux, et deux contre-exemples trouvés en test le
montrent.**

Le transfert automatique est **gratuit** : compléter une bouteille de la couleur de collecte
expédie `C` unités sans dépenser de coup. Verser tout de suite dans le collecteur prive de cette
économie. Une bouteille portant déjà trois unités de collecte n'attend qu'une quatrième pour
partir sans rien coûter. Le collecteur crée donc une **vraie décision tactique** : expédier
maintenant, ou compléter une bouteille et expédier gratuitement.

Un solveur qui jouerait ce coup d'office s'en trouve doublement puni : il rend des solutions
plus longues qu'il croit optimales, et sur un plateau très contraint il se prive de tout
successeur et conclut à tort à l'insolubilité.

Le collecteur apporte en outre de la **congestion** : ses `K = 16` unités saturent le plateau au
départ, enterrent les autres couleurs, et libèrent des bouteilles au compte-gouttes. L'intérêt
d'un niveau se joue donc sur **la façon dont sa couleur est répartie et sur ce qu'elle
recouvre**, autant que sur le rythme des expéditions.

D'où la règle de génération la plus importante :

> Ne pas piloter la difficulté par le nombre de pas de mélange, mais par la **dispersion de la
> couleur de collecte**. Quatre blocs de `C` posés à plat au fond de quatre bouteilles donnent un
> niveau mou — quatre transferts automatiques immédiats, quatre bouteilles libérées, plus aucune
> tension. Les mêmes 16 unités éparpillées en unités isolées **coiffant** d'autres couleurs
> obligent à reconstituer chaque lot en manœuvrant, et c'est là que naît le puzzle.

Concrètement, le générateur pilote deux paramètres corrélés à la difficulté : le **nombre de
blocs** de la couleur de collecte (de 4 à 16) et la **part de ces blocs situés en sommet de
bouteille** (un bloc au sommet est immédiatement mobilisable, un bloc enterré ne l'est pas).

### 6.4 Format de niveau (proposition)

```json
{
  "id": "level-0042",
  "name": "Harder than you think",
  "palette": ["orange", "green", "blue", "dark", "white"],
  "standardCapacity": 4,
  "collector": { "capacity": 16, "color": 0, "content": "0000" },
  "bottles": ["1330", "24", "", "3142"],
  "par": 38,
  "seed": 918273645,
  "generator": "1.0.0"
}
```

- Chaque bouteille est une **chaîne de chiffres**, du fond vers le goulot, chaque chiffre
  indexant `palette`. Compact et lisible en diff : on voit d'un coup d'œil ce qui a changé.
- `bottles` ne contient que les bouteilles standard, toutes de capacité `standardCapacity` ; le
  collecteur est décrit à part, avec sa capacité et sa couleur.
- `collector.color` reste explicite même si le contenu initial la révèle : un collecteur peut
  démarrer vide (V1b).
- `seed` et `generator` sont des **traces de provenance**, pas un format de stockage : ils
  permettent de rejouer une génération, de comprendre un niveau anormal et de détecter les
  régressions du générateur. Le contenu du niveau reste stocké explicitement — une graine ne
  reproduit son niveau que si le code du générateur est resté rigoureusement identique.
- Un fichier par niveau dans `levels/` (historique git lisible), concaténés au build en un seul
  JSON inliné dans le bundle.
- `par` = longueur de la solution optimale trouvée par le solveur, sert au barème d'étoiles.

---

### 6.5 Outillage de génération

Le générateur et le solveur **vivent dans le dépôt**, en TypeScript, au-dessus du même moteur de
règles que le jeu — pas de seconde implémentation à maintenir en parallèle. Ils s'exécutent sous
Node via `npm run levels:gen`, et n'importe qui peut les relancer.

Deux points d'exécution :

- **En local**, pour le développement et les petits lots.
- **En intégration continue**, via un workflow `workflow_dispatch` paramétré (palier de
  difficulté, nombre de niveaux, graine). Le dépôt étant public, les runners GitHub sont gratuits
  et sans quota de minutes ; la recherche de candidats étant parallélisable, un job matriciel
  répartit le travail. Le workflow **ouvre une pull request** avec les niveaux produits et leurs
  métriques — jamais un push direct : une génération ratée ne doit pas partir en production sans
  relecture. Conséquence utile : les niveaux peuvent être régénérés depuis l'interface web de
  GitHub, sans poste de développement.

Deux conditions pour que la reproductibilité tienne :

- **Générateur pseudo-aléatoire maison** (type `mulberry32`, une vingtaine de lignes).
  `Math.random` n'accepte pas de graine et ruinerait toute traçabilité.
- **Version de Node épinglée** dans le workflow, pour que la CI produise exactement ce que
  produit une exécution locale.

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

### 7.2 Recommencer — seule action de secours en v1

**Décision : la v1 est un puzzle pur.** Pas d'annulation, pas de bouteille de secours, pas
d'indice. La seule action disponible est **recommencer**, qui remet le niveau à son état
initial.

Deux conséquences à assumer :

- **L'erreur est définitive.** Un mauvais enchaînement se paie par une reprise du niveau depuis
  le début. Cela rend la qualité de la génération (§6.1, V4) et la longueur des niveaux
  critiques : un niveau de 60 coups où l'on se bloque au 55ᵉ est une punition, pas un défi.
  Calibrer la longueur en conséquence, quitte à viser court et nerveux.
- **La détection de blocage devient une fonctionnalité de premier plan** (§5.2). Sans annulation,
  le joueur doit être averti immédiatement qu'il est bloqué, plutôt que de chercher en vain un
  coup qui n'existe plus.

**Le moteur conserve malgré tout l'historique complet des coups en mémoire.** Il est gratuit à
maintenir, indispensable aux tests et au rejeu, et il permettra d'activer l'annulation plus tard
sans retoucher le cœur du jeu. C'est une décision de produit, pas une contrainte technique — le
moteur reste prêt.

### 7.3 Hors v1 : annulation, bouteille de secours, indice

Conservés ici pour mémoire, à réévaluer une fois la v1 jouable :

- **Annuler** — restaurerait l'état exact précédent, bouchons et transferts automatiques compris
  (§4.5), un coup et sa résolution formant une seule entrée d'historique.
- **Ajouter une bouteille** — ajouterait une bouteille standard vide au plateau. Modifie la
  difficulté du niveau, donc à limiter et à articuler avec le barème.
- **Indice** — proposerait le prochain coup d'une solution optimale. Impose un solveur capable de
  tourner sur l'état **courant** et pas seulement à la génération (§9).

### 7.5 Écran d'accueil : deux modes

L'écran de départ propose deux entrées, aux promesses délibérément différentes :

| Mode | Source du niveau | Promesse |
|---|---|---|
| **Campagne** | Niveaux pré-générés, livrés avec le jeu | Difficulté calibrée, `par` mesuré, progression ordonnée |
| **Niveau aléatoire** | Généré dans le navigateur, à la demande | Variété infinie, toujours soluble, difficulté approximative |

Le mode aléatoire embarque **le générateur, pas le pipeline complet** : la marche arrière depuis
l'état résolu est instantanée et garantit la solvabilité à elle seule (§6.3), mais faire noter
des centaines de candidats par le solveur prendrait des minutes. Le bouton produit donc quelques
candidats, les classe avec les **critères bon marché** du pré-filtre (fragmentation de la couleur
de collecte, enfouissement, espace libre — ceux qui ne demandent pas de solveur) et retient le
meilleur. Le tout dans un *Web Worker*, avec un budget de temps de l'ordre de la seconde et un
repli sur le meilleur candidat trouvé, pour que l'interface ne se fige jamais.

Les libellés doivent refléter cet écart plutôt que suggérer deux boutons équivalents : le `par`
d'un niveau aléatoire est une estimation, pas une mesure.

**Code de partage.** Un niveau aléatoire affiche sa graine et la version du générateur sous forme
de code court. Le ressaisir reproduit exactement le même niveau, ce qui permet de le rejouer ou
de l'envoyer à quelqu'un. Avec la réserve du §6.4 : un code n'est valable que pour la version du
générateur qui l'a produit, et un code issu d'une version disparue doit être refusé proprement,
jamais silencieusement réinterprété.

---

## 8. Accessibilité

Point non négociable dans un jeu dont **toute** la mécanique repose sur la couleur :

- **Palette étagée en luminance, pas seulement en teinte.** Le premier jeu de couleurs plaçait
  l'orange et le vert — les deux plus fréquents — à des luminances relatives de 0,306 et 0,291 :
  sous deutéranopie, les deux couleurs dominantes du jeu devenaient indiscernables. La palette
  retenue les étage à 0,03 / 0,14 / 0,29 / 0,45 / 0,89, ce qui les sépare même sans perception
  de la teinte. L'écart minimal est **vérifié par un test** qui lit la feuille de style, plutôt
  que laissé à un commentaire qu'une retouche ferait mentir.
- **Mode motifs** activable : une trame distincte par couleur (diagonales opposées, lignes
  horizontales, verticales, pointillés). Préférence mémorisée localement, avec repli silencieux
  si le stockage est refusé.
- Contraste suffisant entre liquide et fond de plateau.
- Chaque bouteille est un bouton qui **décrit son contenu** du fond vers le goulot.
- Aucune information critique portée uniquement par une animation ;
  `prefers-reduced-motion` supprime bascule, filet et bouchon animés.

---

## 9. Solveur (exigence transverse)

Le solveur n'est pas une fonctionnalité optionnelle : il est requis pour la génération (V3, V4),
le calcul du `par`, les indices (§7.4) et les tests de non-régression.

- **Recherche** : BFS pour l'optimalité sur petits niveaux, IDA*/A* avec heuristique pour les
  grands.
- **Fonction successeur** : appliquer le coup **puis** la phase de résolution (§4) — bouchon et
  transfert automatique font partie de la transition, pas d'un état intermédiaire. Un état du
  graphe est donc toujours un état « stabilisé ».
- **Heuristique admissible**, somme de deux minorants portant sur des ensembles de coups
  **disjoints** — un versement ne déplace qu'une seule couleur :
  - couleurs ordinaires : `max(0, blocs(c) - m_c)`, un versement ne fusionnant au mieux qu'une
    paire de blocs de la couleur versée ;
  - couleur de collecte : **la moitié** du nombre de blocs restés hors du collecteur, arrondie
    au supérieur.

  ⚠️ Deux pièges, tous deux vérifiés par l'expérience. La formule naïve `sum(blocs(c) - 1)`
  suppose une bouteille par couleur et surestime le coût dès qu'une couleur en occupe
  plusieurs. Et le facteur deux sur la couleur de collecte n'est pas de la prudence : un
  versement peut résorber **deux** blocs d'un coup, en vidant celui de la source et en
  déclenchant le transfert automatique de la destination. Sans ce facteur, la recherche rend
  des solutions non optimales en les croyant optimales — un `par` faux, et rien pour le
  signaler.
- **Déduplication des coups équivalents** : les bouteilles standard de même contenu étant
  interchangeables, un seul représentant par classe suffit. ⚠️ Quand source et destination
  appartiennent à la **même** classe, il faut deux bouteilles distinctes de cette classe :
  verser une bouteille dans sa jumelle est un coup réel, pas une permutation. L'oublier rend
  insolubles les niveaux qui se terminent en fusionnant deux bouteilles à demi remplies.
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
- **Passage à l'échelle — mesuré (lot 2).** Sur `scripts/measure.ts` :

  | Plateau | Recherche exhaustive | Faisceau |
  |---|---|---|
  | 2 couleurs, 4 bouteilles | 7 coups, optimal prouvé, 17 nœuds | 7 coups |
  | 3 couleurs, 8 bouteilles | 13 coups, optimal prouvé, 15 nœuds | 13 coups |
  | 4 couleurs, 14 bouteilles | **échec** après 10 s | 21 coups, 0,3 s |
  | 4 couleurs, 30 bouteilles | **échec** après 10 s | 53 coups, 7 s |

  La conclusion est nette : **l'optimalité n'est prouvable qu'en deçà d'une dizaine de
  bouteilles.** Au-delà, on publie le `par` comme **meilleure solution connue**, marqué
  `parIsOptimal: false` dans le fichier de niveau. Il ne faut jamais présenter une borne
  supérieure comme un optimum.
- **Recherche en faisceau** pour les grands plateaux : à chaque profondeur, on ne garde que les
  `width` meilleurs états. Elle ne prouve rien, mais la solvabilité est déjà acquise par
  construction chez le générateur (§6.3) — le solveur ne sert qu'à **mesurer**.

---

## 10. Décisions

### 10.1 Actées

| # | Question | Réf. | Décision |
|---|---|---|---|
| D1 | Versement d'une monochrome vers une bouteille vide | §3.4 | **Autorisé** — règle pure, sans coût pour le solveur |
| D2 | Une bouteille monochrome non pleine est-elle bouchée ? | §4.1 | Non |
| D3 | Le collecteur peut-il être **source** ? | §3.1 | Non — c'est un puits (I4) |
| D4 | Couleur acceptée par un collecteur vide | §3.1 | `collectColor` uniquement, restriction explicite et signalée visuellement |
| D5 | Nombre de collecteurs par niveau | §2.1 | **Exactement un**, toujours présent |
| D6 | Le transfert automatique compte-t-il dans les coups / le `par` ? | §4 | Non |
| D7 | Aides du joueur en v1 | §7.2 | **Aucune** — puzzle pur, `recommencer` seul recours ; l'historique reste tenu en mémoire |
| D8 | Le bouchon est-il réversible en cas d'annulation ? | §4.5 | Oui — sans objet en v1, à respecter si l'annulation arrive |
| D9 | Détection des positions insolubles | §5.2 | Hors ligne, à la génération |
| D10 | Une couleur occupe-t-elle une seule bouteille ? | §1, §6.1 | **Non** — `m_c` bouteilles par couleur ordinaire, typiquement 3 ou 4 |
| D11 | Condition de victoire | §5.1 | **Toutes les bouteilles vides ou bouchées** — « monochrome » seul est insuffisant |
| D12 | Écran d'accueil | §7.5 | Deux modes : campagne pré-générée et niveau aléatoire généré dans le navigateur |
| D13 | Où vit le code de génération ? | §6.5 | Dans le dépôt, exécutable en local et en CI, sortie en pull request |
| D14 | Barème | §12 | Trois étoiles au `par` **ou mieux**, deux jusqu'à `par x 1,3`, une au-delà. Pas de note pour un niveau aléatoire |
| D15 | Déverrouillage | §12 | Séquentiel : le niveau suivant s'ouvre à la réussite du précédent |
| D16 | Sauvegarde | §12 | Locale, versionnée, lecture défensive, repli silencieux si le stockage est refusé |

### 10.2 Encore ouvertes

| # | Question | Réf. | Proposition |
|---|---|---|---|
| Q1 | `K = 16` et `C = 4` sont-ils constants, ou variables selon la difficulté ? | §6.1 | Paramètres de niveau, `K = 16` par défaut |
| Q2 | Comportement sur destination invalide : la sélection est-elle conservée ? | §7.1 | Conservée |
| Q3 | Entrées mises en file pendant l'animation ? | §7.1 | Oui, pour ne pas pénaliser le joueur rapide |
| Q4 | Longueur cible d'un niveau — décisive sans annulation (§7.2) | §6.2 | À calibrer par playtest |
| Q5 | Barème d'étoiles, progression, méta-jeu | — | Hors périmètre v1 |

Aucune de ces questions ne bloque le démarrage de l'implémentation : ce sont des réglages
(Q1, Q4), des détails d'interaction à éprouver au doigt (Q2, Q3) ou du hors-périmètre (Q5).

---

## 11. Hors périmètre de ce document

Monétisation, publicités, synchronisation entre appareils, sons, classements. À traiter
séparément une fois le cœur de jeu figé.

---

## 12. Progression

### 12.1 Barème

| Note | Condition |
|---|---|
| ★★★ | `coups <= par` |
| ★★ | `coups <= arrondi_sup(par x 1,3)` |
| ★ | au-delà |

Le seuil haut est **`<=` et non `=`**, volontairement. Au-delà d'une dizaine de bouteilles le
`par` n'est qu'une *meilleure solution connue* (§9) : un joueur peut légitimement faire mieux, et
ce serait absurde de l'en punir.

Un niveau **aléatoire n'est pas noté** : sa difficulté n'étant pas calibrée et son `par` inconnu,
toute étoile serait arbitraire. L'interface affiche le nombre de coups, rien de plus.

### 12.2 Déverrouillage

Séquentiel : le niveau `n + 1` s'ouvre dès que le niveau `n` est réussi, et tout niveau déjà
terminé reste rejouable. Le bouton **Campagne** reprend au premier niveau non terminé plutôt
qu'au début.

Le verrouillage ne peut pas piéger le joueur : tout niveau publié est prouvé soluble (V3), et
`recommencer` reste disponible à tout moment — c'est d'ailleurs le seul recours en v1 (§7.2).

### 12.3 Sauvegarde

Locale au navigateur, sous une clé versionnée. Trois exigences :

- **Repli silencieux.** Le stockage peut être indisponible — navigation privée, site data
  bloqué. La partie reste alors jouable, la progression n'étant simplement pas retenue.
- **Lecture défensive.** La sauvegarde vient du navigateur du joueur : elle peut être tronquée,
  d'une version antérieure ou trafiquée. Tout format inattendu repart d'une progression vide au
  lieu de faire planter le jeu ; une entrée aberrante est écartée sans jeter les autres.
- **Numéro de version.** Un changement de format se migre ou se rejette, il ne se devine pas.

Seul le **meilleur** nombre de coups par niveau est conservé : une partie moins bonne n'écrase
jamais un record.
