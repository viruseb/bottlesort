import { isComplete, isFull, isMonochrome } from './bottle'
import { COLLECTOR, type Bottle, type ColorId, type GameState, type LevelSpec } from './types'

function parseContent(encoded: string): ColorId[] {
  return [...encoded].map((digit) => Number.parseInt(digit, 10))
}

export function toState(spec: LevelSpec): GameState {
  const collector: Bottle = {
    capacity: spec.collector.capacity,
    content: parseContent(spec.collector.content),
  }
  const standard: Bottle[] = spec.bottles.map((encoded) => ({
    capacity: spec.standardCapacity,
    content: parseContent(encoded),
  }))
  return { bottles: [collector, ...standard], collectColor: spec.collector.color }
}

/** Nombre d'unités de chaque couleur présentes sur le plateau. */
export function colorTotals(state: GameState): Map<ColorId, number> {
  const totals = new Map<ColorId, number>()
  for (const bottle of state.bottles) {
    for (const color of bottle.content) {
      totals.set(color, (totals.get(color) ?? 0) + 1)
    }
  }
  return totals
}

/**
 * Contraintes de validité d'un niveau (§6.1). Retourne la liste des problèmes ;
 * un niveau valide donne un tableau vide.
 *
 * Ces vérifications ne servent pas qu'au chargement : elles sont le garde-fou
 * du générateur, dont les états intermédiaires violent volontairement V1c.
 */
export function validateLevel(spec: LevelSpec): string[] {
  const problems: string[] = []
  const capacity = spec.standardCapacity
  const state = toState(spec)
  const totals = colorTotals(state)
  const collectColor = spec.collector.color

  if (capacity <= 0) problems.push('standardCapacity doit être strictement positif')
  if (spec.collector.capacity <= capacity) {
    problems.push('le collecteur doit être plus grand qu\'une bouteille standard')
  }
  if (collectColor < 0 || collectColor >= spec.palette.length) {
    problems.push(`collector.color ${collectColor} hors de la palette`)
  }

  for (const [color, total] of totals) {
    if (color < 0 || color >= spec.palette.length) {
      problems.push(`couleur ${color} hors de la palette`)
      continue
    }
    if (color === collectColor) {
      // V1 : assez d'unités pour remplir le collecteur, et pas davantage.
      if (total !== spec.collector.capacity) {
        problems.push(
          `V1 : la couleur de collecte totalise ${total} unités pour un collecteur de ${spec.collector.capacity}`,
        )
      }
    } else if (total % capacity !== 0) {
      // V1 : les totaux sont des multiples de la capacité, sans quoi une
      // bouteille finirait monochrome mais non pleine — donc jamais bouchée.
      problems.push(`V1 : la couleur ${color} totalise ${total} unités, non multiple de ${capacity}`)
    }
  }

  // V2 : la marge de manœuvre se mesure en espace libre, pas en nombre de
  // bouteilles. Un plateau dont toutes les bouteilles sont pleines n'offre
  // aucun coup, quel que soit le nombre de contenants.
  const freeSpaceTotal = state.bottles
    .filter((_, index) => index !== COLLECTOR)
    .reduce((sum, bottle) => sum + (bottle.capacity - bottle.content.length), 0)
  if (freeSpaceTotal < capacity) {
    problems.push(
      `V2 : ${freeSpaceTotal} unités d'espace libre pour une capacité de ${capacity}, aucune marge de manœuvre`,
    )
  }

  const collector = state.bottles[COLLECTOR]!
  if (collector.content.some((color) => color !== collectColor)) {
    problems.push('V1b : le collecteur contient une couleur autre que la couleur de collecte')
  }
  if (isFull(collector)) {
    problems.push('V1b : le collecteur démarre plein, la couleur de collecte est déjà rangée')
  }

  state.bottles.forEach((bottle, index) => {
    if (index === COLLECTOR) return
    if (bottle.content.length > bottle.capacity) {
      problems.push(`I1 : la bouteille ${index} déborde de sa capacité`)
    }
    if (isFull(bottle) && isMonochrome(bottle) && bottle.content[0] === collectColor) {
      // V1c : ce transfert automatique partirait avant le premier coup.
      problems.push(`V1c : la bouteille ${index} démarre pleine de la couleur de collecte`)
    } else if (isComplete(bottle)) {
      problems.push(`V1c : la bouteille ${index} démarre déjà bouchée`)
    }
  })

  return problems
}

export function loadLevel(spec: LevelSpec): GameState {
  const problems = validateLevel(spec)
  if (problems.length > 0) {
    throw new Error(`Niveau ${spec.id} invalide :\n- ${problems.join('\n- ')}`)
  }
  return toState(spec)
}
