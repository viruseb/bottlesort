import { describe, expect, it } from 'vitest'
import { loadLevel, validateLevel } from './level'
import type { LevelSpec } from './types'

/** Niveau valide minimal : orange au collecteur, vert et bleu sur une bouteille chacun. */
function baseLevel(overrides: Partial<LevelSpec> = {}): LevelSpec {
  return {
    id: 'test',
    palette: ['orange', 'green', 'blue'],
    standardCapacity: 4,
    collector: { capacity: 8, color: 0, content: '0000' },
    bottles: ['0121', '0122', '0211', '0212', '1212', '', ''],
    ...overrides,
  }
}

describe('chargement', () => {
  it('place le collecteur en tête et décode du fond vers le goulot', () => {
    const state = loadLevel(baseLevel())
    expect(state.bottles[0]?.capacity).toBe(8)
    expect(state.bottles[0]?.content).toEqual([0, 0, 0, 0])
    expect(state.bottles[1]?.content).toEqual([0, 1, 2, 1])
    expect(state.collectColor).toBe(0)
  })

  it('accepte un niveau valide', () => {
    expect(validateLevel(baseLevel())).toEqual([])
  })
})

describe('contraintes de validité', () => {
  it('V1 : refuse une couleur de collecte qui ne remplit pas le collecteur', () => {
    const problems = validateLevel(
      baseLevel({ collector: { capacity: 8, color: 0, content: '000' } }),
    )
    expect(problems.some((problem) => problem.includes('couleur de collecte totalise'))).toBe(true)
  })

  it('V1 : refuse une couleur ordinaire dont le total n\'est pas un multiple de la capacité', () => {
    const problems = validateLevel(
      baseLevel({ bottles: ['0121', '0122', '0211', '0212', '1211', '', ''] }),
    )
    expect(problems.some((problem) => problem.includes('non multiple'))).toBe(true)
  })

  it('V2 : refuse un plateau entièrement plein, sans marge de manœuvre', () => {
    const problems = validateLevel(
      baseLevel({ bottles: ['0121', '0122', '0211', '0212', '1212'] }),
    )
    expect(problems.some((problem) => problem.startsWith('V2'))).toBe(true)
  })

  it('V1b : refuse un collecteur contenant une autre couleur', () => {
    const problems = validateLevel(
      baseLevel({ collector: { capacity: 8, color: 0, content: '0001' } }),
    )
    expect(problems.some((problem) => problem.startsWith('V1b'))).toBe(true)
  })

  it('V1c : refuse une bouteille déjà pleine de la couleur de collecte', () => {
    const problems = validateLevel(
      baseLevel({
        collector: { capacity: 8, color: 0, content: '' },
        bottles: ['0000', '0121', '0122', '0211', '0212', '1212', '', ''],
      }),
    )
    expect(problems.some((problem) => problem.includes('pleine de la couleur de collecte'))).toBe(
      true,
    )
  })

  it('V1c : refuse une bouteille déjà bouchée', () => {
    const problems = validateLevel(
      baseLevel({ bottles: ['1111', '0122', '0211', '0212', '0122', '12', '', ''] }),
    )
    expect(problems.some((problem) => problem.includes('déjà bouchée'))).toBe(true)
  })

  it('loadLevel refuse un niveau invalide en nommant les problèmes', () => {
    expect(() => loadLevel(baseLevel({ bottles: ['0121'] }))).toThrow(/invalide/)
  })
})
