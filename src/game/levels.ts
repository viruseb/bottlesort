import type { LevelSpec } from '../engine/types'

/**
 * Les niveaux sont produits hors ligne et versionnés dans `levels/`. Vite les
 * inline dans le bundle : le jeu ne calcule rien au chargement.
 */
const modules = import.meta.glob<LevelSpec>('../../levels/**/*.json', {
  eager: true,
  import: 'default',
})

export const campaign: LevelSpec[] = Object.entries(modules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, spec]) => spec)
