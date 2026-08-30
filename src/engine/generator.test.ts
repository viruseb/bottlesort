import { describe, expect, it } from 'vitest'
import { shuffle, solvedState, toSpec, type LevelShape } from './generator'
import { validateLevel } from './level'
import { createRng } from './rng'
import { applyMove, isWon } from './rules'
import { heuristic, solve, solveBeam, targetBottles } from './solver'

const SHAPE: LevelShape = {
  standardCapacity: 4,
  collectorCapacity: 8,
  bottlesPerColor: [1, 1],
  emptyBottles: 2,
}

describe('état résolu', () => {
  it('est gagné', () => {
    expect(isWon(solvedState(SHAPE))).toBe(true)
  })

  it('place chaque couleur dans le nombre de bouteilles demandé', () => {
    const state = solvedState({ ...SHAPE, bottlesPerColor: [2, 1] })
    expect(state.bottles).toHaveLength(1 + 2 + 1 + 2)
  })
})

describe('marche arrière', () => {
  it('produit un niveau valide et non résolu', () => {
    const rng = createRng(1)
    const start = shuffle(SHAPE, { steps: 20, rng })
    expect(start).not.toBeNull()
    expect(isWon(start!)).toBe(false)

    const spec = toSpec(start!, {
      id: 'test',
      palette: ['orange', 'green', 'blue'],
      seed: 1,
      generator: 'test',
    })
    expect(validateLevel(spec)).toEqual([])
  })

  it('est reproductible à graine égale', () => {
    const left = shuffle(SHAPE, { steps: 20, rng: createRng(7) })
    const right = shuffle(SHAPE, { steps: 20, rng: createRng(7) })
    expect(left?.bottles).toEqual(right?.bottles)
  })

  it('produit des niveaux réellement solubles', () => {
    const rng = createRng(99)
    let checked = 0
    for (let attempt = 0; attempt < 15 && checked < 5; attempt += 1) {
      const start = shuffle(SHAPE, { steps: 10 + rng.int(15), rng })
      if (!start) continue

      const result = solve(start, { maxNodes: 300_000 })
      expect(result.moves).not.toBeNull()

      let current = start
      for (const move of result.moves!) current = applyMove(current, move)
      expect(isWon(current)).toBe(true)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('admissibilité de l\'heuristique', () => {
  // Ce test aurait attrapé le bug qui a rendu la première version inadmissible :
  // le transfert automatique peut résorber deux blocs de collecte en un coup.
  it('ne dépasse jamais la longueur d\'une solution trouvée', () => {
    const rng = createRng(31337)
    let checked = 0

    for (let attempt = 0; attempt < 20 && checked < 8; attempt += 1) {
      const start = shuffle(SHAPE, { steps: 10 + rng.int(20), rng })
      if (!start) continue
      const beam = solveBeam(start, { width: 200 })
      if (!beam.moves) continue
      expect(heuristic(start, targetBottles(start))).toBeLessThanOrEqual(beam.moves.length)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('la recherche exhaustive n\'est jamais battue par le faisceau', () => {
    const rng = createRng(20260830)
    let checked = 0

    for (let attempt = 0; attempt < 20 && checked < 6; attempt += 1) {
      const start = shuffle(SHAPE, { steps: 10 + rng.int(20), rng })
      if (!start) continue
      const exact = solve(start, { maxNodes: 300_000 })
      const beam = solveBeam(start, { width: 200 })
      if (!exact.optimal || !exact.moves || !beam.moves) continue
      expect(exact.moves.length).toBeLessThanOrEqual(beam.moves.length)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
  })
})
