import { describe, expect, it } from 'vitest'
import { isComplete, topRun } from './bottle'
import {
  applyMove,
  canPour,
  canonicalKey,
  isBlocked,
  isWon,
  legalMoves,
  resolve,
} from './rules'
import type { Bottle, ColorId, GameState } from './types'

const ORANGE = 0
const GREEN = 1
const BLUE = 2

/** Raccourci de lecture : `b(4, GREEN, GREEN)` = bouteille de 4, deux verts au fond. */
function b(capacity: number, ...content: ColorId[]): Bottle {
  return { capacity, content }
}

function state(collector: Bottle, ...standard: Bottle[]): GameState {
  return { bottles: [collector, ...standard], collectColor: ORANGE }
}

describe('bloc de tête', () => {
  it('ne remonte que la suite de même couleur', () => {
    expect(topRun(b(4, GREEN, BLUE, BLUE))).toEqual({ color: BLUE, size: 2 })
  })

  it('vaut null sur une bouteille vide', () => {
    expect(topRun(b(4))).toBeNull()
  })
})

describe('légalité du transvasement', () => {
  it('accepte une destination vide', () => {
    const s = state(b(16), b(4, GREEN), b(4))
    expect(canPour(s, 1, 2)).toBe(true)
  })

  it('refuse une destination de couleur différente', () => {
    const s = state(b(16), b(4, GREEN), b(4, BLUE))
    expect(canPour(s, 1, 2)).toBe(false)
  })

  it('refuse une destination pleine', () => {
    const s = state(b(16), b(4, GREEN), b(4, GREEN, BLUE, BLUE, GREEN))
    expect(canPour(s, 1, 2)).toBe(false)
  })

  it('verrouille une bouteille bouchée, en source comme en destination', () => {
    const corked = b(4, GREEN, GREEN, GREEN, GREEN)
    expect(isComplete(corked)).toBe(true)
    const s = state(b(16), corked, b(4, GREEN))
    expect(canPour(s, 1, 2)).toBe(false)
    expect(canPour(s, 2, 1)).toBe(false)
  })

  it('autorise le versement d\'une monochrome vers une bouteille vide (D1)', () => {
    const s = state(b(16), b(4, GREEN, GREEN), b(4))
    expect(canPour(s, 1, 2)).toBe(true)
  })

  it('refuse le collecteur comme source : c\'est un puits (I4)', () => {
    const s = state(b(16, ORANGE, ORANGE), b(4))
    expect(canPour(s, 0, 1)).toBe(false)
  })

  it('n\'accepte dans le collecteur que la couleur de collecte, même à vide (D4)', () => {
    const s = state(b(16), b(4, GREEN), b(4, ORANGE))
    expect(canPour(s, 1, 0)).toBe(false)
    expect(canPour(s, 2, 0)).toBe(true)
  })
})

describe('quantité transvasée', () => {
  it('déplace tout le bloc de tête quand la place suffit', () => {
    const next = applyMove(state(b(16), b(4, BLUE, GREEN, GREEN), b(4, GREEN)), { from: 1, to: 2 })
    expect(next.bottles[1]?.content).toEqual([BLUE])
    expect(next.bottles[2]?.content).toEqual([GREEN, GREEN, GREEN])
  })

  it('tronque le versement à la place disponible', () => {
    const next = applyMove(
      state(b(16), b(4, GREEN, GREEN, GREEN), b(4, BLUE, BLUE, GREEN)),
      { from: 1, to: 2 },
    )
    // Une seule unité passe : il en reste deux dans la source.
    expect(next.bottles[1]?.content).toEqual([GREEN, GREEN])
    expect(next.bottles[2]?.content).toEqual([BLUE, BLUE, GREEN, GREEN])
  })

  it('rejette un coup illégal plutôt que de modifier l\'état', () => {
    const s = state(b(16), b(4, GREEN), b(4, BLUE))
    expect(() => applyMove(s, { from: 1, to: 2 })).toThrow(/illégal/)
  })
})

describe('transfert automatique vers le collecteur', () => {
  it('vide la bouteille au lieu de la boucher (§4.2)', () => {
    const s = state(b(16, ORANGE), b(4, ORANGE, ORANGE, ORANGE), b(4, ORANGE))
    const next = applyMove(s, { from: 2, to: 1 })
    expect(next.bottles[1]?.content).toEqual([])
    expect(next.bottles[0]?.content).toHaveLength(5)
  })

  it('laisse intacte une bouteille pleine d\'une couleur ordinaire', () => {
    const s = state(b(16), b(4, GREEN, GREEN, GREEN), b(4, GREEN))
    const next = applyMove(s, { from: 2, to: 1 })
    expect(next.bottles[1]?.content).toHaveLength(4)
    expect(isComplete(next.bottles[1]!)).toBe(true)
  })

  it('signale un débordement du collecteur plutôt que de tronquer', () => {
    // Collecteur à 15/16 et une bouteille pleine de 4 : configuration que la
    // contrainte V1 rend impossible, donc un bug de génération.
    const overfull = state(
      b(16, ...Array<ColorId>(15).fill(ORANGE)),
      b(4, ORANGE, ORANGE, ORANGE, ORANGE),
    )
    expect(() => resolve(overfull)).toThrow(/Débordement/)
  })
})

describe('victoire', () => {
  it('exige des bouteilles vides ou bouchées', () => {
    const won = state(
      b(4, ORANGE, ORANGE, ORANGE, ORANGE),
      b(4, GREEN, GREEN, GREEN, GREEN),
      b(4),
    )
    expect(isWon(won)).toBe(true)
  })

  it('refuse une couleur éparpillée en bouteilles monochromes non pleines', () => {
    // Le piège de la condition « monochrome » : tout est trié, rien n\'est rangé.
    const scattered = state(
      b(4, ORANGE, ORANGE, ORANGE, ORANGE),
      b(4, GREEN, GREEN, GREEN),
      b(4, GREEN),
    )
    expect(isWon(scattered)).toBe(false)
  })
})

describe('état canonique', () => {
  it('identifie deux plateaux à bouteilles standard permutées', () => {
    const left = state(b(16, ORANGE), b(4, GREEN), b(4, BLUE), b(4))
    const right = state(b(16, ORANGE), b(4, BLUE), b(4), b(4, GREEN))
    expect(canonicalKey(left)).toBe(canonicalKey(right))
  })

  it('distingue deux remplissages différents du collecteur', () => {
    const left = state(b(16, ORANGE), b(4, GREEN))
    const right = state(b(16, ORANGE, ORANGE), b(4, GREEN))
    expect(canonicalKey(left)).not.toBe(canonicalKey(right))
  })

  it('rend le versement stérile invisible (D1)', () => {
    const s = state(b(16, ORANGE), b(4, GREEN, GREEN), b(4))
    expect(canonicalKey(applyMove(s, { from: 1, to: 2 }))).toBe(canonicalKey(s))
  })
})

describe('blocage', () => {
  it('ne compte pas les coups stériles comme une issue', () => {
    // Deux monochromes incompatibles et une bouteille vide : les seuls coups
    // légaux déplacent une monochrome vers le vide, ce qui ne change rien.
    // C'est précisément le cas que le comptage de coups légaux manquerait.
    const stuck = state(b(16, ORANGE), b(4, GREEN, GREEN, GREEN), b(4, BLUE, BLUE, BLUE), b(4))
    expect(legalMoves(stuck).length).toBeGreaterThan(0)
    expect(isBlocked(stuck)).toBe(true)
  })

  it('ne déclare pas bloquée une position qui a encore un coup utile', () => {
    const alive = state(b(16, ORANGE), b(4, BLUE, GREEN, GREEN), b(4, GREEN), b(4))
    expect(isBlocked(alive)).toBe(false)
  })

  it('ne considère pas une position gagnée comme bloquée', () => {
    const won = state(b(4, ORANGE, ORANGE, ORANGE, ORANGE), b(4, GREEN, GREEN, GREEN, GREEN))
    expect(isBlocked(won)).toBe(false)
  })
})
