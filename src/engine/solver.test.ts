import { describe, expect, it } from 'vitest'
import { shuffle, solvedState } from './generator'
import { toState } from './level'
import { createRng } from './rng'
import { applyMove, isWon } from './rules'
import { heuristic, playGreedy, solve, targetBottles } from './solver'
import type { Bottle, ColorId, GameState } from './types'

const ORANGE = 0
const GREEN = 1

function b(capacity: number, ...content: ColorId[]): Bottle {
  return { capacity, content }
}

function state(collector: Bottle, ...standard: Bottle[]): GameState {
  return { bottles: [collector, ...standard], collectColor: ORANGE }
}

describe('heuristique', () => {
  it('vaut zéro sur un état résolu', () => {
    const won = state(b(8, ...Array<ColorId>(8).fill(ORANGE)), b(4, GREEN, GREEN, GREEN, GREEN))
    expect(heuristic(won, targetBottles(won))).toBe(0)
  })

  it('compte les blocs de la couleur de collecte restés dehors', () => {
    const s = state(b(8, ORANGE, ORANGE), b(4, GREEN, ORANGE), b(4, ORANGE, GREEN))
    // Un bloc orange dans chaque bouteille standard.
    expect(heuristic(s, targetBottles(s))).toBeGreaterThanOrEqual(2)
  })

  it('ne dépasse jamais le coût réel — condition d\'admissibilité', () => {
    const rng = createRng(20260830)
    const shape = {
      standardCapacity: 4,
      collectorCapacity: 8,
      bottlesPerColor: [1, 1],
      emptyBottles: 2,
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const start = shuffle(shape, { steps: 8 + rng.int(8), rng })
      if (!start) continue
      const result = solve(start, { maxNodes: 200_000 })
      if (!result.moves || !result.optimal) continue

      // On rejoue la solution : à chaque position, l'heuristique doit minorer
      // le nombre de coups qui restent. Sinon la recherche rendrait des
      // solutions non optimales en les croyant optimales.
      let current = start
      const targets = targetBottles(start)
      result.moves.forEach((move, index) => {
        const remaining = result.moves!.length - index
        expect(heuristic(current, targets)).toBeLessThanOrEqual(remaining)
        current = applyMove(current, move)
      })
    }
  })
})

describe('solveur', () => {
  it('résout un niveau trivial et retourne des coups jouables', () => {
    const s = state(
      b(8, ORANGE, ORANGE, ORANGE, ORANGE),
      b(4, GREEN, ORANGE, GREEN, ORANGE),
      b(4, ORANGE, GREEN, ORANGE, GREEN),
      b(4),
    )
    const result = solve(s)
    expect(result.moves).not.toBeNull()

    let current = s
    for (const move of result.moves!) current = applyMove(current, move)
    expect(isWon(current)).toBe(true)
  })

  it('sait fusionner deux bouteilles jumelles', () => {
    // Régression : la déduplication des coups équivalents supprimait les
    // bouteilles de contenu identique, rendant impossible le versement d'une
    // bouteille dans sa jumelle — et déclarant insolubles des niveaux qui se
    // terminent précisément par cette fusion.
    const start = toState({
      id: 'jumelles',
      palette: ['orange', 'green', 'blue'],
      standardCapacity: 4,
      collector: { capacity: 8, color: 0, content: '0000' },
      bottles: ['112', '2', '1102', '0002'],
    })

    const result = solve(start)
    expect(result.moves).not.toBeNull()

    let current = start
    for (const move of result.moves!) current = applyMove(current, move)
    expect(isWon(current)).toBe(true)
  })

  it('reconnaît un état déjà résolu', () => {
    const won = solvedState({
      standardCapacity: 4,
      collectorCapacity: 8,
      bottlesPerColor: [1, 1],
      emptyBottles: 1,
    })
    expect(solve(won).moves).toEqual([])
  })

})

describe('joueur glouton', () => {
  it('résout une position évidente', () => {
    const s = state(
      b(8, ...Array<ColorId>(7).fill(ORANGE)),
      b(4, GREEN, GREEN, GREEN, ORANGE),
      b(4, GREEN),
    )
    expect(playGreedy(s)).toBe(true)
  })
})
