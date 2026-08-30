// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { renderBoard } from './render'
import { Session } from './session'
import type { LevelSpec } from '../engine/types'

const LEVEL: LevelSpec = {
  id: 'test',
  palette: ['orange', 'green', 'blue'],
  standardCapacity: 4,
  collector: { capacity: 8, color: 0, content: '0000' },
  bottles: ['0121', '0122', '0211', '0212', '1212', '', ''],
}

let host: HTMLElement
let session: Session

beforeEach(() => {
  document.body.innerHTML = '<div id="board"></div>'
  host = document.querySelector<HTMLElement>('#board')!
  session = new Session(LEVEL)
  renderBoard(session, host)
})

describe('rendu du plateau', () => {
  it('rend une bouteille par contenant, collecteur compris', () => {
    expect(host.querySelectorAll('.bottle')).toHaveLength(session.state.bottles.length)
    expect(host.querySelectorAll('.bottle--collector')).toHaveLength(1)
  })

  it('marque la couleur de collecte, même collecteur vide', () => {
    expect(host.querySelector('.bottle--collector .bottle__mark')).not.toBeNull()
  })

  it('décrit le contenu de bas en haut pour les lecteurs d\'écran', () => {
    const bottle = host.querySelector('.bottle[data-index="1"]')
    expect(bottle?.getAttribute('aria-label')).toContain('orange, green, blue, green')
  })
})

describe('mise à jour en place', () => {
  // Régression : reconstruire le plateau à chaque rafraîchissement relançait
  // l'animation d'apparition de toutes les couches, ce qui se voyait comme un
  // clignotement à chaque appui sur une bouteille.
  it('conserve les nœuds existants lors d\'une sélection', () => {
    const before = [...host.querySelectorAll('.bottle')]
    const layersBefore = [...host.querySelectorAll('.layer')]

    session.tap(1)
    renderBoard(session, host)

    expect([...host.querySelectorAll('.bottle')]).toEqual(before)
    expect([...host.querySelectorAll('.layer')]).toEqual(layersBefore)
    expect(host.querySelectorAll('.bottle.is-selected')).toHaveLength(1)
  })

  it('ne reconstruit que les bouteilles dont le contenu a changé', () => {
    session.tap(1)
    session.tap(6)
    const untouched = host.querySelector('.bottle[data-index="2"] .layer')

    renderBoard(session, host)
    expect(host.querySelector('.bottle[data-index="2"] .layer')).toBe(untouched)
    expect(host.querySelector('.bottle[data-index="6"] .layer')).not.toBeNull()
  })

  it('rebâtit la structure au changement de niveau', () => {
    const other = new Session({ ...LEVEL, id: 'autre', bottles: ['0121', '0122', '0211', '0212', '1212', ''] })
    renderBoard(other, host)
    expect(host.querySelectorAll('.bottle')).toHaveLength(other.state.bottles.length)
  })
})
