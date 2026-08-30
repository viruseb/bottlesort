# Défi entre amis et classement — spécification

> Statut : **spécification fonctionnelle v0.3** — document de conception, aucun code.
> Toute décision marquée `[À CONFIRMER]` doit être tranchée avant l'implémentation.
>
> - v0.1 : classement porté par les liens, sans serveur. **Abandonné** (§2).
> - v0.2 : Cloudflare Workers + KV. **Abandonné** — KV est le mauvais outil (§3.1), et le compte
>   AWS déjà en place enlève l'argument principal en faveur de Cloudflare.

---

## 1. Le besoin

Ce qui amuse à plusieurs n'est pas de jouer chacun dans son coin, c'est de **se mesurer sur un
puzzle donné** : qui le résoudra en le moins de coups.

1. un joueur envoie un lien sur WhatsApp ;
2. celui qui le reçoit ouvre **exactement le même puzzle** ;
3. on lui demande son pseudo s'il n'en a pas encore ;
4. à la victoire, son score rejoint un **classement** consultable depuis l'accueil.

---

## 2. Pourquoi un vrai serveur

La v0.1 faisait voyager le classement dans les liens : chaque lien portait la table connue de
son expéditeur, et le destinataire fusionnait. C'était astucieux, et c'est une mauvaise idée.

**Deux défauts rédhibitoires :**

- **Rafraîchir le site n'apporte rien.** Ouvrir le jeu normalement, ou recharger la page pour
  voir où en sont les amis, ne montre que ce qu'on savait déjà. Le classement n'avance qu'à
  réception d'un lien. C'est le contraire de ce qu'on attend d'un classement.
- **Le lien enfle.** Il grossit à chaque score accumulé, jusqu'à devenir un pavé illisible dans
  une conversation — au moment précis où le partage doit rester léger.

**GitHub ne peut pas servir de backend.** GitHub Pages ne sert que des fichiers statiques, sans
la moindre exécution côté serveur. Les Actions savent exécuter du code, mais se déclenchent sur
des évènements de dépôt : les appeler depuis un navigateur exigerait un jeton d'écriture embarqué
dans la page, donc public, donc utilisable par n'importe qui pour écrire dans le dépôt. Idem pour
l'API des issues ou des discussions. **Il n'existe pas de produit de fonctions serverless chez
GitHub.** GitHub reste l'hébergeur du site et le déclencheur du déploiement — pas le serveur.

---

## 3. Le choix : AWS Lambda + DynamoDB

Deux briques, pas une de plus :

- **Lambda avec une Function URL.** Pas d'API Gateway. Une Function URL expose directement la
  fonction en HTTPS, avec CORS configurable et sans facturation propre. API Gateway alourdit le
  montage et sa gratuité s'arrête au bout de douze mois, contrairement au million de requêtes
  Lambda mensuelles, gratuit sans limite de durée.
- **DynamoDB** pour le stockage, avec **écriture conditionnelle** (§3.1).

La Lambda tourne sous Node : elle **importe le moteur du jeu tel quel**. C'est le bénéfice d'une
contrainte posée au lot 1 — `src/engine/` est du TypeScript pur, sans référence au DOM. Aucune
réimplémentation des règles côté serveur, donc aucune divergence possible entre ce que le jeu
accepte et ce que le serveur valide.

### 3.1 Pourquoi pas un magasin clé-valeur simple

La v0.2 retenait Cloudflare KV. **C'était une erreur, et elle mérite d'être expliquée** parce
qu'elle se reproduirait avec n'importe quel magasin clé-valeur nu.

Mettre à jour un classement, c'est lire la liste, y insérer un score, trier, tronquer, réécrire.
Un magasin clé-valeur n'offre aucune atomicité sur cette séquence : deux joueurs qui terminent le
même puzzle en même temps lisent la même liste, et le second écrase le premier. **Un score
disparaît, sans erreur et sans trace.** C'est rare à trois joueurs, mais c'est un défaut
silencieux — la pire espèce.

DynamoDB règle le problème en un seul appel :

```
PutItem  condition:  attribute_not_exists(pseudo) OR moves > :nouveauScore
```

Atomique, sans lecture préalable, sans course. La règle « le meilleur gagne » est portée par la
base elle-même plutôt que par du code qui espère être seul à écrire.

### 3.2 Ce qui a été écarté

| Option | Écartée parce que |
|---|---|
| Cloudflare Workers + KV | KV ne sait pas faire d'écriture conditionnelle (§3.1) ; un compte de plus à créer |
| Cloudflare Workers + D1 ou Durable Objects | Corrigerait le défaut, mais l'argument « rien à créer » ne tient plus face à un compte AWS existant |
| Supabase | Clé publique dans le client, sécurité entièrement portée par les politiques d'accès ; projet gratuit mis en veille après inactivité — pénible pour un jeu utilisé par à-coups |
| Firebase | Même modèle de clé publique, SDK lourd dans le bundle |
| Lambda + API Gateway | API Gateway n'apporte rien ici et sa gratuité expire au bout d'un an |
| EC2, Fargate, RDS | Un serveur ou une base à administrer et à payer en continu, pour trois routes |

### 3.3 Coût

L'offre gratuite **permanente** couvre très largement l'usage visé : le million de requêtes
Lambda mensuelles et les 25 Go de DynamoDB n'ont pas de limite de durée. Un groupe d'amis en
consomme quelques dizaines par semaine.

`[À CONFIRMER]` Vérifier les offres en vigueur au moment de l'implémentation, elles bougent. Et
**poser une alerte de facturation** : c'est bon marché tant que personne n'abuse (§10).

---

## 4. Architecture

```
Navigateur (GitHub Pages, statique)
  |  GET  ?room=…&level=…        → le classement d'un niveau dans un salon
  |  POST { room, level, pseudo, moves }
  v
Lambda (Function URL)  ──  rejoue la partie sur le moteur  ──  DynamoDB
```

### 4.1 Salons

Un **salon** est un identifiant court et opaque partagé par un groupe d'amis, contenu dans le
lien de défi. Trois raisons :

- le classement d'un groupe reste entre ses membres, plutôt que d'être noyé dans un classement
  mondial où l'on ne connaît personne ;
- la surface d'abus est cloisonnée : polluer un salon ne pollue que lui ;
- aucune inscription — appartenir au groupe, c'est avoir le lien.

Créé à la volée à la première soumission, identifiant tiré au hasard, assez long pour ne pas se
deviner `[À CONFIRMER]`.

### 4.2 Déploiement

Depuis le workflow GitHub Actions existant, via **OIDC** : GitHub s'authentifie auprès d'AWS par
jeton éphémère. **Aucune clé d'accès longue durée ne doit être stockée en secret de dépôt** — une
clé qui fuite reste valable jusqu'à révocation, un jeton OIDC expire en quelques minutes.

`[À CONFIRMER]` Outil de description de l'infrastructure : SAM, CDK, Terraform ou simple appel
d'API. Le montage est assez petit pour que le plus léger suffise.

---

## 5. Le lien de défi

```
https://viruseb.github.io/bottlesort/#c=<niveau>&r=<salon>
```

**Court et de taille constante** — c'est tout l'intérêt du backend. Il ne contient plus que le
puzzle et le salon ; les scores viennent de l'API.

Le lien porte **le puzzle lui-même, et non une graine**. Une graine ne reproduit le même niveau
que si le code du générateur n'a pas bougé (§6.4 des règles) ; un lien vieux de deux versions
ouvrirait un autre puzzle et ruinerait la comparaison. Un niveau de onze bouteilles tient en une
soixantaine de caractères, il n'y a aucune raison de prendre ce risque.

Le fragment (`#`) plutôt qu'une chaîne de requête : il n'est pas transmis au serveur qui sert la
page, donc le contenu du défi ne finit pas dans les journaux de GitHub Pages.

**La clé du niveau est dérivée du puzzle** — une empreinte déterministe de son contenu, calculée
par le serveur et jamais par le client. Deux personnes qui résolvent le même puzzle, reçu par
deux liens différents, atterrissent ainsi sur la même ligne du classement, et personne ne peut
déclarer un score sur un niveau qu'il aurait inventé.

---

## 6. Vérification côté serveur, par rejeu

Un score soumis par un navigateur est, par construction, fabricable à la main. Le Worker
n'accorde donc **aucune confiance au nombre annoncé** : la soumission porte **la liste des coups
joués**, et le serveur la rejoue sur le moteur.

Un score n'est accepté que si :

1. tous les coups sont légaux au sens du §3.1 des règles ;
2. l'état final est gagné au sens du §5.1 ;
3. le nombre annoncé égale la longueur de la liste ;
4. la charge utile reste sous une taille plafond.

C'est ici que la pureté du moteur porte ses fruits : rejouer quinze coups coûte une fraction de
milliseconde, et le code qui valide est **exactement** celui qui joue.

> **Ce que cela ne protège pas**, et il faut le dire : rien n'empêche quelqu'un de faire résoudre
> le puzzle par un solveur et de soumettre la solution optimale — elle est parfaitement valide.
> Aucun serveur ne peut distinguer un humain doué d'un solveur, puisque le puzzle se résout côté
> client. On empêche le score **inventé**, pas le score **assisté**. Entre amis, c'est
> suffisant ; il faut simplement ne pas prétendre le contraire.

---

## 7. Le pseudo

- **Demandé à l'ouverture d'un lien de défi**, s'il n'est pas déjà en stockage local, avant de
  jouer. Modifiable ensuite depuis l'accueil.
- 2 à 16 caractères, espaces autorisés. Aucun compte, aucune adresse, aucun mot de passe.
- Un pseudo vide bascule sur un nom généré plutôt que de bloquer.

### 7.1 Le pseudo est une donnée hostile

Il arrive **par le réseau, écrit par quelqu'un d'autre**. Des deux côtés :

- **Serveur** : longueur bornée, caractères de contrôle et bidirectionnels retirés, avant
  écriture en KV.
- **Client** : jamais injecté via `innerHTML`, uniquement `textContent`. Sans cette règle, un
  pseudo contenant du balisage exécuterait du code chez tous les membres du salon.

L'assainissement se fait **aux deux bouts**. Celui du serveur protège les données, celui du
client protège l'affichage, et aucun des deux ne doit dépendre de l'autre.

---

## 8. Le classement

### 8.1 Modèle

Une ligne DynamoDB par score :

```
PK   : room#<salon>#level#<clé de niveau>
SK   : <pseudo>
moves: entier
at   : horodatage        // départage les ex aequo
ttl  : expiration        // ménage automatique des vieux salons
```

Une seule requête sur la clé de partition rend tous les scores d'un niveau ; le tri et la coupe
au podium se font en mémoire, les listes étant courtes.

Un seul score par couple (pseudo, niveau) : **le meilleur gagne**, garanti par l'écriture
conditionnelle (§3.1) plutôt que par une lecture suivie d'une écriture.

Le champ `ttl` laisse DynamoDB effacer seul les salons oubliés — pas de tâche de ménage à
écrire, pas de stockage qui gonfle indéfiniment. `[À CONFIRMER]` — durée de rétention.

Le client garde une **copie locale** du dernier classement reçu, avec la même lecture défensive
que la progression solo (§12.3 des règles) : l'écran affiche toujours quelque chose, même hors
ligne, et se met à jour dès que l'API répond.

### 8.2 Écran

Un bouton **« Classement »** sur l'accueil ouvre un tableau à quatre colonnes :

| Niveau | Or | Argent | Bronze |
|---|---|---|---|
| facile-003 | Sébastien — 8 | Marie — 9 | Paul — 11 |
| défi 7f2a91c4 | Marie — 12 | Sébastien — 13 | — |

- **Colonne 1** : la clé du niveau — son identifiant pour un niveau de campagne, l'empreinte
  courte du puzzle pour un défi.
- **Colonnes 2 à 4** : le podium, pseudo et nombre de coups. Or, argent, bronze — le cuivre
  d'abord envisagé se distingue trop mal du bronze à l'écran.
- Le joueur local est mis en évidence sur sa ligne ; une place vide affiche un tiret ; un niveau
  sans score n'apparaît pas.

---

## 9. Robustesse

Le réseau tombe, le Worker peut être indisponible, le joueur peut être dans le métro. **Rien de
tout cela ne doit gêner la partie en cours.**

- Une soumission qui échoue est **mise en file localement** et retentée à la prochaine ouverture.
  Le joueur voit son score, marqué « en attente d'envoi ».
- L'écran de classement affiche la copie locale, avec la date de dernière mise à jour, plutôt
  qu'une erreur.
- Le jeu reste entièrement jouable sans l'API. C'est un ajout, pas une dépendance.

---

## 10. Abus

Une route d'écriture publique se fait spammer un jour ou l'autre. Sans authentification, on
limite les dégâts plutôt que de prétendre les empêcher :

- **rejeu obligatoire** — un score sans partie valide n'entre jamais ;
- **plafond de taille** sur la charge utile, refusée avant même d'être analysée ;
- **concurrence réservée** sur la Lambda : même sous abus, la facture et la charge restent
  bornées. C'est le garde-fou le plus important, parce qu'il plafonne le coût ;
- **limitation de débit par adresse**, la Function URL exposant l'IP appelante ; un compteur à
  courte expiration en DynamoDB suffit, sans recourir à un pare-feu applicatif payant ;
- **cloisonnement par salon** — l'identifiant n'étant pas devinable, il faut le lien pour écrire ;
- **plafond d'entrées par salon**, pour qu'un salon ne puisse pas grossir indéfiniment ;
- **alerte de facturation**, pour être prévenu plutôt que surpris.

`[À CONFIRMER]` Faut-il un moyen d'effacer une entrée ou un salon ? Sans compte, seul un secret
d'administration côté Worker le permettrait.

---

## 11. Données personnelles

Ce que le backend change, et qu'il faut assumer : **des données quittent désormais l'appareil**.
Un pseudo choisi, un nombre de coups, une liste de coups, un horodatage. Ni adresse, ni compte,
ni traceur, ni identifiant publicitaire — mais ce n'est plus « rien ne sort ».

Trois conséquences : le stockage reste **minimal** — aucune adresse IP conservée au-delà de la
fenêtre de limitation de débit, qui expire d'elle-même ; les données ont une **durée de vie**
(§8.1) plutôt que d'être gardées indéfiniment ; et une phrase dans l'interface le dit au moment
où le joueur saisit son pseudo, plutôt que dans une page que personne ne lit.

`[À CONFIRMER]` Région AWS — une région européenne garde les données au plus près des joueurs et
simplifie la question.

---

## 12. Cas limites

| Cas | Comportement |
|---|---|
| API injoignable | Score mis en file, classement affiché depuis la copie locale |
| Lien tronqué ou corrompu | Message clair, retour à l'accueil. Jamais d'écran blanc |
| Format de lien inconnu | Refus explicite, invitation à recharger le jeu |
| Puzzle déjà terminé | On peut rejouer ; seul un meilleur score remplace l'ancien |
| Défi abandonné | Rien n'est soumis |
| Deux pseudos identiques dans un salon | Traités comme une seule personne. `[À CONFIRMER]` — un suffixe court tiré au hasard lèverait l'ambiguïté |
| `navigator.share` absent | Repli sur la copie dans le presse-papiers |
| Stockage local refusé | Le défi reste jouable ; le pseudo est redemandé à chaque fois |

---

## 13. Périmètre

**Dedans** : lien de défi, salons, pseudo, soumission vérifiée par rejeu, classement par niveau,
écran de classement, partage natif, file d'attente hors ligne.

**Dehors** : comptes, temps réel, jeu simultané, notifications, modération, classement mondial,
amitiés persistantes.

---

## 14. Décisions

### 14.1 Actées

| # | Question | Réf. | Décision |
|---|---|---|---|
| D1 | Classement porté par les liens ou par un serveur ? | §2 | **Un serveur.** Un classement qui n'avance pas au rafraîchissement n'est pas un classement |
| D2 | GitHub peut-il héberger le backend ? | §2 | **Non.** Pages est statique, les Actions exigeraient un jeton public. GitHub reste l'hébergeur du site |
| D7 | Hébergeur du backend | §3 | **AWS** — Lambda avec Function URL, sans API Gateway, plus DynamoDB |
| D8 | Magasin de données | §3.1 | **DynamoDB avec écriture conditionnelle.** Un magasin clé-valeur nu perd silencieusement un score en cas d'écriture simultanée |
| D9 | Authentification du déploiement | §4.2 | **OIDC**, jamais de clé d'accès longue durée en secret de dépôt |
| D3 | Podium | §8.2 | **Or, argent, bronze** |
| D4 | Contenu du lien | §5 | Le puzzle lui-même et le salon. Ni graine, ni scores |
| D5 | Confiance dans les scores | §6 | Aucune : rejeu obligatoire côté serveur |
| D6 | Le jeu dépend-il de l'API ? | §9 | Non. Le solo reste entièrement jouable sans réseau |

### 14.2 Ouvertes

| # | Question | Réf. | Proposition |
|---|---|---|---|
| Q1 | Région AWS | §11 | Une région européenne |
| Q2 | Outil d'infrastructure : SAM, CDK, Terraform ou appel d'API direct ? | §4.2 | Le plus léger qui fasse l'affaire |
| Q3 | Longueur de l'identifiant de salon | §4.1 | 10 à 12 caractères |
| Q4 | Nombre d'entrées conservées par niveau | §8.1 | Le podium plus quelques suivants, à calibrer |
| Q5 | Durée de rétention (`ttl`) d'un salon | §8.1 | À définir — quelques mois d'inactivité |
| Q6 | Effacement d'une entrée ou d'un salon à la demande | §10 | Sans compte, exigerait un secret d'administration |
| Q7 | Pseudo demandé à l'arrivée ou à la victoire ? | §7 | À l'arrivée, comme demandé |
| Q8 | Un défi peut-il porter sur un niveau de campagne ? | §5 | Oui, seule la clé diffère |
| Q9 | Suffixe aléatoire pour lever les homonymes dans un salon ? | §12 | Oui, affiché seulement en cas de collision |
| Q10 | Seuils de limitation de débit et concurrence réservée | §10 | À calibrer, prudents au départ |
