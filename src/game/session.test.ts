import { describe, expect, it } from 'vitest'
import { Session } from './session'
import type { LevelSpec } from '../engine/types'

function level(): LevelSpec {
  return {
    id: 'test',
    palette: ['orange', 'green', 'blue'],
    standardCapacity: 4,
    collector: { capacity: 8, color: 0, content: '0000' },
    bottles: ['0121', '0122', '0211', '0212', '1212', '', ''],
  }
}

describe('sélection', () => {
  it('sélectionne puis désélectionne au second appui', () => {
    const session = new Session(level())
    session.tap(1)
    expect(session.selected).toBe(1)
    session.tap(1)
    expect(session.selected).toBeNull()
  })

  it('ignore un appui sur le collecteur comme source', () => {
    const session = new Session(level())
    session.tap(0)
    expect(session.selected).toBeNull()
  })

  it('conserve la sélection sur une destination invalide (Q2)', () => {
    const session = new Session(level())
    session.tap(1) // sommet vert
    const moved = session.tap(2) // sommet bleu
    expect(moved).toBe(false)
    expect(session.selected).toBe(1)
    expect(session.moveCount).toBe(0)
  })
})

describe('coups', () => {
  it('applique un coup valide et compte les coups', () => {
    const session = new Session(level())
    session.tap(1)
    expect(session.tap(6)).toBe(true)
    expect(session.moveCount).toBe(1)
    expect(session.selected).toBeNull()
  })

  it('recommencer restaure l\'état initial', () => {
    const session = new Session(level())
    const before = session.state.bottles.map((bottle) => bottle.content.join(''))
    session.tap(1)
    session.tap(6)
    session.restart()
    expect(session.state.bottles.map((bottle) => bottle.content.join(''))).toEqual(before)
    expect(session.moveCount).toBe(0)
  })
})

describe('statut', () => {
  it('démarre en cours de partie', () => {
    expect(new Session(level()).status).toBe('playing')
  })

  it('refuse tout coup une fois la partie terminée', () => {
    // À trois coups de la victoire : l'orange complète le collecteur, puis
    // chaque couleur est regroupée dans une bouteille pleine.
    const session = new Session({
      ...level(),
      collector: { capacity: 8, color: 0, content: '0000000' },
      bottles: ['1110', '1', '222', '2'],
    })

    session.tap(1)
    session.tap(0)
    session.tap(2)
    session.tap(1)
    session.tap(4)
    session.tap(3)

    expect(session.status).toBe('won')
    expect(session.moveCount).toBe(3)
    expect(session.tap(1)).toBe(false)
  })
})
