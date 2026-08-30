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

## État

Les règles sont définies. Le jeu n'est pas encore développé — la page actuelle est une page
d'attente. Prochaine étape : le moteur de règles en TypeScript pur, avec ses tests.
