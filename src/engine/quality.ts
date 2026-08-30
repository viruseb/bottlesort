import { blockCount, freeSpace } from './bottle'
import { playGreedy, solve, type SolveOptions } from './solver'
import { COLLECTOR, type GameState } from './types'

/**
 * Mesures calculables **sans solveur**. Elles servent de pré-filtre : faire
 * noter des centaines de candidats par le solveur serait ruineux, alors que ces
 * indicateurs éliminent d'emblée les plateaux mous (§6.3.3).
 */
export interface CheapMetrics {
  /** Nombre de blocs de la couleur de collecte hors du collecteur. */
  readonly collectBlocks: number
  /** Part de ces blocs affleurant au goulot : un bloc enterré coûte du travail. */
  readonly collectSurfaced: number
  /** Espace libre total des bouteilles standard. */
  readonly freeSpace: number
  /** Profondeur moyenne d'enfouissement, en unités posées au-dessus d'un bloc. */
  readonly burial: number
}

export function cheapMetrics(state: GameState): CheapMetrics {
  let collectBlocks = 0
  let collectSurfaced = 0
  let free = 0
  let buriedUnits = 0
  let blocks = 0

  state.bottles.forEach((bottle, index) => {
    if (index === COLLECTOR) return
    free += freeSpace(bottle)
    collectBlocks += blockCount(bottle, state.collectColor)
    if (bottle.content[bottle.content.length - 1] === state.collectColor) collectSurfaced += 1

    // Un bloc est d'autant plus coûteux que d'unités le recouvrent.
    let previous: number | undefined
    bottle.content.forEach((color, depth) => {
      if (color !== previous) {
        blocks += 1
        buriedUnits += bottle.content.length - 1 - depth
      }
      previous = color
    })
  })

  return {
    collectBlocks,
    collectSurfaced,
    freeSpace: free,
    burial: blocks === 0 ? 0 : buriedUnits / blocks,
  }
}

export interface SolvedMetrics {
  /** Longueur de la meilleure solution connue. */
  readonly par: number
  /** `true` si cette longueur est prouvée optimale. */
  readonly parIsOptimal: boolean
  /** `true` si la stratégie gloutonne échoue — signature d'un niveau intéressant. */
  readonly greedyFails: boolean
  readonly nodes: number
}

/**
 * `knownGreedyFails` évite de rejouer le glouton quand l'appelant s'en est déjà
 * servi comme pré-filtre. L'ordre compte : le glouton coûte une partie, le
 * solveur une recherche. Filtrer sur le glouton d'abord évite de lancer une
 * recherche complète sur des candidats qui seront rejetés de toute façon.
 */
export function solvedMetrics(
  state: GameState,
  options?: SolveOptions,
  knownGreedyFails?: boolean,
): SolvedMetrics | null {
  const greedyFails = knownGreedyFails ?? !playGreedy(state)
  const result = solve(state, options)
  if (!result.moves) return null
  return {
    par: result.moves.length,
    parIsOptimal: result.optimal,
    greedyFails,
    nodes: result.nodes,
  }
}

export interface QualityTarget {
  readonly minPar: number
  readonly maxPar: number
  /** Exiger que le joueur glouton échoue. */
  readonly requireGreedyFailure: boolean
  readonly minCollectBlocks: number
}

export function scoreAgainst(
  cheap: CheapMetrics,
  solved: SolvedMetrics,
  target: QualityTarget,
): { accepted: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (solved.par < target.minPar) reasons.push(`par ${solved.par} < ${target.minPar}`)
  if (solved.par > target.maxPar) reasons.push(`par ${solved.par} > ${target.maxPar}`)
  if (target.requireGreedyFailure && !solved.greedyFails) reasons.push('le glouton réussit')
  if (cheap.collectBlocks < target.minCollectBlocks) {
    reasons.push(`couleur de collecte trop groupée (${cheap.collectBlocks} blocs)`)
  }
  return { accepted: reasons.length === 0, reasons }
}
