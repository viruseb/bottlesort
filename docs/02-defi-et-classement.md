# Défi entre amis et classement — spécification

> Statut : **spécification fonctionnelle v0.1** — document de conception, aucun code.
> Toute décision marquée `[À CONFIRMER]` doit être tranchée avant l'implémentation.

---

## 1. Le besoin

Ce qui amuse à plusieurs n'est pas de jouer chacun dans son coin, c'est de **se mesurer sur un
puzzle donné** : qui le résoudra en le moins de coups. Le parcours visé :

1. un joueur envoie un lien sur WhatsApp ;
2. celui qui le reçoit ouvre **exactement le même puzzle** ;
3. on lui demande son pseudo s'il n'en a pas encore ;
4. à la victoire, son score rejoint un **classement** consultable depuis l'accueil.

Le classement présente, par niveau, le podium des meilleurs scores.

---

## 2. Le point dur : un classement partagé demande normalement un serveur

Le jeu est un site **statique** sur GitHub Pages : pas de base de données, pas d'API, rien qui
puisse retenir un score écrit par un joueur et le montrer à un autre. `localStorage` est
strictement local à un navigateur — il ne traverse jamais d'un téléphone à l'autre.

Il faut donc choisir. Trois options, par coût croissant.

| Option | Ce que ça donne | Ce que ça coûte |
|---|---|---|
| **A. Sans serveur, le classement voyage dans les liens** | Chacun voit le classement que les liens reçus lui ont apporté | Rien. Reste sur GitHub Pages |
| **B. Petit service serverless** (Cloudflare Workers + KV, Supabase, Firebase…) | Un classement mondial, unique et cohérent | Un compte, une clé d'API, du CORS, une facture éventuelle, de la modération |
| **C. GitHub comme base** (issues, fichier commité par une Action) | Persistance gratuite | Exige un jeton d'écriture côté client — **inacceptable**, il serait public |

**Recommandation : l'option A.** Non par défaut mais parce qu'elle correspond au besoin réel.
Le classement souhaité est celui d'un groupe WhatsApp, pas celui de la planète. L'option A part
en ligne aujourd'hui, ne coûte rien, n'expose aucune donnée à un tiers et ne demande à personne
de créer un compte. L'option B reste ouverte plus tard sans rien jeter : le modèle de données
ci-dessous est le même, seul le transport change.

### 2.1 Comment un classement peut voyager sans serveur

L'astuce tient en une phrase : **chaque lien transporte tout le classement connu de son
expéditeur**, et le destinataire fusionne.

```
Alice finit en 11 coups  → envoie un lien contenant [Alice 11]
Bob l'ouvre, finit en 10 → son lien contient       [Alice 11, Bob 10]
Chloé l'ouvre, finit en 12 → son lien contient     [Alice 11, Bob 10, Chloé 12]
```

Dans un groupe, le dernier message porte toujours la table la plus complète, et il suffit
d'ouvrir un lien récent pour se mettre à jour. La fusion est **commutative et idempotente** — on
garde le meilleur score par couple (niveau, pseudo) — donc l'ordre d'arrivée des liens n'a aucune
importance et un même lien peut être ouvert dix fois sans dégât.

C'est la propriété qui rend l'option A viable : sans elle, il faudrait que chacun clique sur le
lien de chacun.

---

## 3. Parcours

### 3.1 Défier

Depuis l'écran de victoire ou depuis un niveau en cours, un bouton **« Défier un ami »** :

1. construit le lien de défi (§4) ;
2. utilise l'**API de partage native** (`navigator.share`) quand elle existe — sur mobile, elle
   ouvre directement le sélecteur d'applications, WhatsApp compris ;
3. sinon, copie le lien dans le presse-papiers et le dit.

Le message proposé par défaut : *« Je fais ce puzzle en 11 coups. Tu fais mieux ? »*

### 3.2 Recevoir

À l'ouverture d'un lien de défi :

1. le puzzle est reconstruit depuis le lien, à l'identique ;
2. si aucun pseudo n'est enregistré localement, **on le demande** avant de jouer (§6) ;
3. le classement contenu dans le lien est fusionné dans le classement local ;
4. l'écran de jeu s'ouvre en mode défi, avec le score à battre affiché.

### 3.3 Publier son score

À la victoire en mode défi, l'écran propose **« Renvoyer mon score »**, qui construit un nouveau
lien de défi incluant le score qui vient d'être fait. La boucle se referme.

---

## 4. Le lien de défi

### 4.1 Ce qu'il doit contenir

- **Le puzzle lui-même**, et non une graine. Une graine ne reproduit le même niveau que si le
  code du générateur est resté rigoureusement identique (§6.4 des règles) : un lien vieux de deux
  versions ouvrirait un autre puzzle, ce qui ruinerait la comparaison. Le contenu est court, il
  n'y a aucune raison de prendre ce risque.
- **La clé du niveau**, qui sert de ligne au classement.
- **Les scores connus de l'expéditeur**, chacun avec sa liste de coups (§5).

### 4.2 Forme

```
https://viruseb.github.io/bottlesort/#d=<charge utile en base64url>
```

Le **fragment** (`#`) plutôt qu'une chaîne de requête : il n'est jamais envoyé au serveur, donc
les pseudos et les scores ne finissent pas dans les journaux de GitHub Pages.

La charge utile est un objet compact, sérialisé puis encodé en base64url :

```
v   version du format
l   le niveau : capacité standard, collecteur (capacité, couleur, contenu), bouteilles
k   clé du niveau — empreinte courte et déterministe de `l`
s   scores : [pseudo, nombre de coups, coups joués] par entrée
```

### 4.3 Taille

WhatsApp n'aime pas les liens interminables ; on vise **moins de 1 500 caractères**.

| Élément | Ordre de grandeur |
|---|---|
| Un niveau de 11 bouteilles | ~70 caractères |
| Un coup | 2 caractères |
| Une entrée de score (pseudo + coups + liste) | ~40 caractères |

Soit une trentaine d'entrées avant d'approcher la limite. **Plafond retenu** : les `N` meilleures
entrées par niveau et les `M` niveaux les plus récents `[À CONFIRMER]`, avec repli sur un lien
sans classement si la limite est malgré tout franchie.

---

## 5. Vérification par rejeu — l'anti-triche sans serveur

Un score qui arrive par une URL est, par construction, **fabricable à la main**. N'importe qui
peut annoncer 1 coup.

La parade ne demande pourtant aucun serveur : **chaque entrée transporte la liste des coups qui
l'ont produite**, et le destinataire la **rejoue sur le moteur**. Une entrée n'est acceptée que
si :

1. tous les coups sont légaux au sens du §3.1 des règles ;
2. l'état final est gagné au sens du §5.1 ;
3. le nombre de coups annoncé égale la longueur de la liste ;
4. ce nombre est `>=` à l'optimum connu, quand il est connu.

Une entrée qui échoue est **écartée silencieusement**, pas signalée : inutile d'accuser
quelqu'un dont le lien a simplement été tronqué par une messagerie.

C'est le point qui rend l'option A honnête plutôt que déclarative. Le moteur de règles existe
déjà, il est pur et tourne dans le navigateur : rejouer quinze coups coûte une fraction de
milliseconde. **Aucune entrée non vérifiée n'entre au classement.**

> Ce que cela ne protège pas : quelqu'un peut toujours faire résoudre le puzzle par le solveur et
> publier la solution optimale. Contre un ami déterminé à tricher, rien ne protège sans serveur —
> et un serveur ne protégerait pas davantage, puisque le puzzle est résolu côté client. On s'en
> tient donc à empêcher le score inventé, pas le score assisté.

---

## 6. Le pseudo

- **Demandé à l'ouverture d'un lien de défi**, s'il n'est pas déjà en stockage local, avant de
  jouer. `[À CONFIRMER]` — l'alternative est de ne le demander qu'à la victoire, ce qui réduit la
  friction à l'entrée mais oblige à saisir quelque chose au moment de savourer.
- **Modifiable** ensuite depuis l'accueil.
- **Contraintes** : 2 à 16 caractères, espaces autorisés, découpé à la longueur maximale.
- **Rien d'obligatoire ni de vérifié** : ce n'est pas un compte, aucune adresse, aucun mot de
  passe. Un pseudo vide bascule sur un nom généré (« Joueur 42 ») plutôt que de bloquer.

### 6.1 Sécurité — le pseudo est une donnée hostile

Un pseudo arrive **par une URL écrite par quelqu'un d'autre**. Il doit donc être traité comme
n'importe quelle entrée non fiable :

- **jamais** injecté via `innerHTML` — uniquement `textContent`. Sans cette règle, un pseudo
  contenant du balisage exécuterait du code chez tous les membres du groupe ;
- longueur bornée à la lecture, avant tout affichage ;
- caractères de contrôle et bidirectionnels retirés, faute de quoi un pseudo peut désordonner
  l'affichage du tableau.

### 6.2 Données personnelles

Rien ne quitte l'appareil sinon ce que le joueur envoie lui-même dans un lien. Aucun serveur,
aucun traceur, aucun identifiant persistant au-delà du pseudo choisi. C'est un argument à tenir :
l'option B y renoncerait en partie, et cela doit peser dans le choix.

---

## 7. Le classement

### 7.1 Modèle

```
Leaderboard {
  version : entier
  levels  : { [clé de niveau] : Entry[] }
}

Entry {
  pseudo  : texte
  moves   : entier          // nombre de coups
  proof   : liste de coups  // conservée, pour pouvoir la propager
  at      : horodatage      // départage les ex aequo
}
```

Stocké localement, sous une clé distincte de la progression solo, avec la même **lecture
défensive** que celle du §12.3 des règles : version inconnue ou format inattendu repart d'un
classement vide, entrée aberrante écartée sans jeter les autres.

### 7.2 Fusion

Pour chaque couple (niveau, pseudo), **le meilleur score gagne**. À égalité, le plus ancien —
celui qui l'a trouvé le premier. La fusion est ainsi commutative, associative et idempotente :
ouvrir les liens dans n'importe quel ordre, plusieurs fois, donne le même tableau.

### 7.3 Écran

Un bouton **« Classement »** sur l'accueil ouvre un tableau à quatre colonnes :

| Niveau | Or | Bronze | Cuivre |
|---|---|---|---|
| facile-003 | Sébastien — 8 | Marie — 9 | Paul — 11 |
| défi 7f2a91c4 | Marie — 12 | Sébastien — 13 | — |

- **Colonne 1** : la clé du niveau — son identifiant pour un niveau de campagne, son empreinte
  courte pour un puzzle reçu par lien.
- **Colonnes 2 à 4** : le podium, pseudo et nombre de coups.
- Le joueur local est mis en évidence sur sa ligne.
- Une place vide affiche un tiret plutôt que de disparaître.
- Un niveau sans aucun score n'apparaît pas.

`[À CONFIRMER]` **Le podium habituel est or / argent / bronze.** L'énoncé demandait
or / bronze / cuivre ; c'est retenu tel quel ici, mais la substitution de l'argent par le cuivre
surprendra, et le cuivre se distingue mal du bronze à l'écran. À trancher.

---

## 8. Cas limites

| Cas | Comportement |
|---|---|
| Lien tronqué ou corrompu | Message clair, retour à l'accueil. Jamais d'écran blanc |
| Lien d'une version de format inconnue | Refus explicite, avec invitation à recharger le jeu |
| Puzzle déjà terminé par le joueur | On peut rejouer ; seul un meilleur score remplace l'ancien |
| Le joueur abandonne un défi | Rien n'est publié ; le défi reste ouvert |
| Deux pseudos identiques dans un groupe | Traités comme une seule personne. `[À CONFIRMER]` — un suffixe court tiré au hasard à la création du pseudo lèverait l'ambiguïté |
| `navigator.share` absent (ordinateur de bureau) | Repli sur la copie dans le presse-papiers |
| Stockage local refusé | Le défi reste jouable ; le classement n'est simplement pas retenu |

---

## 9. Périmètre

**Dedans** : lien de défi, capture du pseudo, vérification par rejeu, classement local fusionné,
écran de classement, partage natif.

**Dehors** : classement mondial, comptes, temps réel, jeu simultané, notifications, modération
des pseudos, amitiés persistantes. Tout cela suppose l'option B et se décidera séparément.

---

## 10. Décisions à trancher

| # | Question | Réf. | Proposition |
|---|---|---|---|
| Q1 | Option de transport du classement | §2 | **A** — sans serveur, le classement voyage dans les liens |
| Q2 | Podium or / bronze / cuivre, ou or / argent / bronze ? | §7.3 | À trancher — l'argent est plus lisible que le cuivre |
| Q3 | Pseudo demandé à l'arrivée ou à la victoire ? | §6 | À l'arrivée, comme demandé |
| Q4 | Plafonds `N` entrées et `M` niveaux par lien | §4.3 | À calibrer sur la taille réelle des liens |
| Q5 | Suffixe aléatoire sur le pseudo pour lever les homonymes ? | §8 | Oui, discret, affiché seulement en cas de collision |
| Q6 | Un défi peut-il porter sur un niveau de campagne, ou seulement sur un puzzle généré ? | §4.1 | Les deux ; la clé diffère, le reste est identique |
