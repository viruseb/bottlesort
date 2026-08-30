# bottlesort

Puzzle de tri de liquides colorés (famille *Water Sort / Ball Sort*), avec des bouteilles
de **capacités hétérogènes**.

## Documentation

- [`docs/01-regles-du-jeu.md`](docs/01-regles-du-jeu.md) — définition des règles (spécification
  fonctionnelle v0.1). Point de départ ; le plan d'implémentation viendra ensuite.

## Site

Publié automatiquement sur GitHub Pages à chaque push sur `main` :
**https://viruseb.github.io/bottlesort/**

Le workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) publie le contenu
du dossier `web/`. L'étape de build sera branchée dedans quand l'application existera ; le site
étant servi depuis le sous-chemin `/bottlesort/`, le bundler devra être configuré avec cette
base.

## État

Définition des règles en cours. Le jeu n'est pas encore développé — `web/index.html` est une
page d'attente qui sert à valider la chaîne de publication.
