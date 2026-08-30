# bottlesort

Puzzle de tri de liquides colorés (famille *Water Sort / Ball Sort*), avec des bouteilles
de **capacités hétérogènes**.

## Documentation

- [`docs/01-regles-du-jeu.md`](docs/01-regles-du-jeu.md) — définition des règles (spécification
  fonctionnelle v0.1). Point de départ ; le plan d'implémentation viendra ensuite.

## Site

Publié automatiquement sur GitHub Pages à chaque push sur `main` :
**https://viruseb.github.io/bottlesort/**

Le workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) installe les
dépendances, lance les tests, construit le site et publie `dist/`. Le site étant servi depuis le
sous-chemin `/bottlesort/`, `vite.config.ts` fixe `base: '/bottlesort/'` — sans quoi les chemins
d'assets pointeraient sur la racine du domaine et la page resterait blanche.

## Développement

```sh
npm install
npm run dev     # serveur de développement
npm test        # tests unitaires (Vitest)
npm run build   # vérification TypeScript puis build de production
```

La version de Node est épinglée dans `.nvmrc` et reprise par la CI, pour qu'une génération
locale et une génération en CI produisent le même résultat.

## Structure

| Dossier | Rôle |
|---|---|
| `src/engine/` | Moteur de règles, solveur, générateur. TypeScript pur, aucune dépendance au DOM : le même code sert au jeu et aux outils sous Node. |
| `src/game/` | Interface : plateau, sélection, session de jeu. |
| `scripts/` | Outils hors ligne — génération de niveaux, mesure du solveur. |
| `levels/` | Niveaux produits hors ligne et versionnés, inlinés au build. |
| `docs/` | Définition des règles. |

## Génération de niveaux

```sh
npm run levels:gen -- --preset facile --count 8 --seed 20260830
npm run measure     # passage à l'échelle du solveur
npm run audit:par   # recalcule chaque par par un BFS nu et le compare au par publié
npm run solutions   # solutions optimales, pour rejouer un niveau de bout en bout
```

La solvabilité est acquise par construction : la génération part de l'état résolu et remonte par
coups inverses. Le solveur ne sert donc pas à prouver qu'un niveau est jouable, mais à mesurer
s'il est intéressant.

## État

Le jeu est jouable de bout en bout : campagne de huit niveaux avec déverrouillage progressif,
barème d'étoiles et sauvegarde locale, génération aléatoire dans le navigateur, animation de
versement et mode motifs pour l'accessibilité.

Reste à faire : étoffer le jeu de niveaux — les préréglages `moyen` et `difficile` du générateur
ne sont pas encore éprouvés — et brancher le workflow de génération en CI.
