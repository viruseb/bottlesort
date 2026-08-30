import { freeSpace, isComplete, isFull, isMonochrome, topRun } from './bottle'
import { applyMove, canonicalKey } from './rules'
import type { Rng } from './rng'
import { COLLECTOR, type Bottle, type ColorId, type GameState, type LevelSpec } from './types'

export interface LevelShape {
  readonly standardCapacity: number
  readonly collectorCapacity: number
  /** Nombre de bouteilles occupées par chaque couleur ordinaire (`m_c`). */
  readonly bottlesPerColor: readonly number[]
  /** Bouteilles laissées vides dans l'état résolu : la marge de manœuvre. */
  readonly emptyBottles: number
}

/** État résolu : tout est rangé, tous les bouchons posés. Point de départ de la marche arrière. */
export function solvedState(shape: LevelShape): GameState {
  const collector: Bottle = {
    capacity: shape.collectorCapacity,
    content: Array<ColorId>(shape.collectorCapacity).fill(0),
  }

  const standard: Bottle[] = []
  shape.bottlesPerColor.forEach((count, index) => {
    const color = index + 1 // la couleur 0 est réservée au collecteur
    for (let n = 0; n < count; n += 1) {
      standard.push({
        capacity: shape.standardCapacity,
        content: Array<ColorId>(shape.standardCapacity).fill(color),
      })
    }
  })
  for (let n = 0; n < shape.emptyBottles; n += 1) {
    standard.push({ capacity: shape.standardCapacity, content: [] })
  }

  return { bottles: [collector, ...standard], collectColor: 0 }
}

function withContent(bottle: Bottle, content: readonly ColorId[]): Bottle {
  return { capacity: bottle.capacity, content }
}

/**
 * Un état est *stabilisé* — donc atteignable en jeu — si aucune bouteille
 * standard n'y est pleine de la couleur de collecte : une telle bouteille se
 * viderait aussitôt dans le collecteur (§4.2).
 */
function isStabilized(state: GameState): boolean {
  return state.bottles.every((bottle, index) => {
    if (index === COLLECTOR) return true
    return !(isFull(bottle) && isMonochrome(bottle) && bottle.content[0] === state.collectColor)
  })
}

/**
 * Candidats d'état antérieur : pour chaque couple (source, destination) et
 * chaque quantité, on **reconstruit** l'état d'avant puis on vérifie que le
 * coup direct y est légal et redonne exactement l'état d'où l'on vient.
 *
 * Cette vérification effective n'est pas un luxe : le coup inverse n'est pas la
 * symétrie du coup direct (§6.3.1). Rendre `q` unités à une bouteille qui porte
 * déjà cette couleur au sommet agrandit son bloc de tête, et le coup direct en
 * verserait alors davantage.
 */
function predecessors(state: GameState): { state: GameState; }[] {
  const results: { state: GameState }[] = []
  const capacity = state.bottles[1]?.capacity ?? 0

  const consider = (candidate: GameState, from: number, to: number): void => {
    if (!isStabilized(candidate)) return
    let replayed: GameState
    try {
      replayed = applyMove(candidate, { from, to })
    } catch {
      return
    }
    if (canonicalKey(replayed) !== canonicalKey(state)) return
    results.push({ state: candidate })
  }

  for (let to = 0; to < state.bottles.length; to += 1) {
    const target = state.bottles[to]!

    // Cas 1 : le versement est resté dans la destination.
    const run = topRun(target)
    if (run) {
      for (let quantity = 1; quantity <= run.size; quantity += 1) {
        for (let from = 1; from < state.bottles.length; from += 1) {
          if (from === to) continue
          const source = state.bottles[from]!
          if (freeSpace(source) < quantity) continue

          const bottles = state.bottles.slice()
          bottles[to] = withContent(target, target.content.slice(0, target.content.length - quantity))
          bottles[from] = withContent(source, [
            ...source.content,
            ...Array<ColorId>(quantity).fill(run.color),
          ])
          consider({ ...state, bottles }, from, to)
        }
      }
    }

    // Cas 2 : le versement a rempli la destination, qui est aussitôt partie
    // dans le collecteur. La destination est donc vide, et le lot se trouve au
    // sommet du collecteur.
    if (to === COLLECTOR || target.content.length > 0 || capacity === 0) continue
    const collector = state.bottles[COLLECTOR]!
    if (collector.content.length < capacity) continue
    if (collector.content.slice(-capacity).some((color) => color !== state.collectColor)) continue

    for (let quantity = 1; quantity <= capacity; quantity += 1) {
      for (let from = 1; from < state.bottles.length; from += 1) {
        if (from === to) continue
        const source = state.bottles[from]!
        if (freeSpace(source) < quantity) continue

        const bottles = state.bottles.slice()
        bottles[COLLECTOR] = withContent(
          collector,
          collector.content.slice(0, collector.content.length - capacity),
        )
        bottles[to] = withContent(target, Array<ColorId>(capacity - quantity).fill(state.collectColor))
        bottles[from] = withContent(source, [
          ...source.content,
          ...Array<ColorId>(quantity).fill(state.collectColor),
        ])
        consider({ ...state, bottles }, from, to)
      }
    }
  }

  return results
}

/**
 * Espace libre des bouteilles standard. La marche arrière le consomme dès
 * qu'elle sort des unités du collecteur : sans garde-fou, elle produit des
 * plateaux saturés que la contrainte V2 rejette.
 */
function standardFreeSpace(state: GameState): number {
  return state.bottles.reduce(
    (sum, bottle, index) => (index === COLLECTOR ? sum : sum + freeSpace(bottle)),
    0,
  )
}

/** Un état de départ acceptable ne comporte aucune bouteille déjà bouchée (V1c). */
function isAcceptableStart(state: GameState): boolean {
  return state.bottles.every((bottle, index) => index === COLLECTOR || !isComplete(bottle))
}

export interface ShuffleOptions {
  readonly steps: number
  readonly rng: Rng
}

/**
 * Marche arrière depuis l'état résolu. La solvabilité est acquise par
 * construction : on vient de parcourir une solution.
 */
export function shuffle(shape: LevelShape, options: ShuffleOptions): GameState | null {
  const minFreeSpace = shape.standardCapacity
  let current = solvedState(shape)
  const visited = new Set<string>([canonicalKey(current)])

  for (let step = 0; step < options.steps; step += 1) {
    const candidates = predecessors(current).filter(
      (candidate) =>
        !visited.has(canonicalKey(candidate.state)) &&
        // V2 : garder de quoi manœuvrer. Sans ce filtre, la marche arrière vide
        // le collecteur dans les bouteilles jusqu'à saturer le plateau.
        standardFreeSpace(candidate.state) >= minFreeSpace,
    )
    const chosen = options.rng.pick(candidates)
    if (!chosen) break
    current = chosen.state
    visited.add(canonicalKey(current))
  }

  // La marche peut s'arrêter sur un état où le collecteur est plein ou une
  // bouteille bouchée : ce sont des états de jeu valides, mais pas des états de
  // départ valides.
  if (isFull(current.bottles[COLLECTOR]!)) return null
  if (!isAcceptableStart(current)) return null
  return current
}

export function toSpec(
  state: GameState,
  meta: { id: string; palette: readonly string[]; seed: number; generator: string; par?: number },
): LevelSpec {
  const collector = state.bottles[COLLECTOR]!
  const standard = state.bottles.slice(1)
  return {
    id: meta.id,
    palette: meta.palette,
    standardCapacity: standard[0]?.capacity ?? 0,
    collector: {
      capacity: collector.capacity,
      color: state.collectColor,
      content: collector.content.join(''),
    },
    bottles: standard.map((bottle) => bottle.content.join('')),
    seed: meta.seed,
    generator: meta.generator,
    ...(meta.par === undefined ? {} : { par: meta.par }),
  }
}
