import { COLLECTOR, type Bottle } from '../engine/types'
import type { Session } from './session'

function colorVariable(palette: readonly string[], index: number): string {
  return `var(--liquid-${palette[index] ?? 'unknown'})`
}

function describe(bottle: Bottle, palette: readonly string[]): string {
  if (bottle.content.length === 0) return 'bouteille vide'
  // Du fond vers le goulot : l'ordre qu'annonce la description est celui que
  // le joueur voit. Sans elle, un daltonien ne peut pas jouer.
  const layers = bottle.content.map((color) => palette[color] ?? '?').join(', ')
  return `de bas en haut : ${layers}`
}

function signature(bottle: Bottle): string {
  return bottle.content.join(',')
}

function createBottle(session: Session, index: number, bottle: Bottle): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = index === COLLECTOR ? 'bottle bottle--collector' : 'bottle'
  button.dataset['index'] = String(index)
  button.style.setProperty('--capacity', String(bottle.capacity))

  const liquid = document.createElement('span')
  liquid.className = 'bottle__liquid'
  button.append(liquid)

  if (index === COLLECTOR) {
    // Le collecteur n'accepte que sa couleur, y compris à vide (décision D4).
    button.style.setProperty(
      '--collect-color',
      colorVariable(session.spec.palette, session.spec.collector.color),
    )
    const mark = document.createElement('span')
    mark.className = 'bottle__mark'
    button.append(mark)
  }

  return button
}

/**
 * Met une bouteille à jour **en place**.
 *
 * Les couches ne sont reconstruites que si le contenu a changé. Reconstruire le
 * plateau entier à chaque rafraîchissement — y compris pour un simple
 * changement de sélection — relançait l'animation d'apparition de toutes les
 * couches, ce qui se voyait comme un clignotement à chaque appui.
 */
function updateBottle(button: HTMLButtonElement, session: Session, index: number, bottle: Bottle): void {
  const palette = session.spec.palette
  const next = signature(bottle)

  if (button.dataset['content'] !== next) {
    const previousLength = Number.parseInt(button.dataset['filled'] ?? '0', 10)
    const liquid = button.querySelector('.bottle__liquid')

    if (liquid) {
      liquid.replaceChildren(
        ...bottle.content.map((color, depth) => {
          const layer = document.createElement('span')
          layer.className = 'layer'
          layer.style.background = colorVariable(palette, color)
          // Seules les couches qui viennent d'arriver s'animent, et la classe
          // est retirée dès l'animation finie pour que le DOM reste honnête.
          if (depth >= previousLength) {
            layer.classList.add('layer--new')
            layer.addEventListener('animationend', () => layer.classList.remove('layer--new'), {
              once: true,
            })
          }
          return layer
        }),
      )
    }

    button.dataset['content'] = next
    button.dataset['filled'] = String(bottle.content.length)
    button.setAttribute(
      'aria-label',
      `${index === COLLECTOR ? `Collecteur, ${palette[session.spec.collector.color] ?? '?'}` : `Bouteille ${index}`}, ${describe(bottle, palette)}`,
    )
  }

  const full = bottle.content.length === bottle.capacity
  const corked =
    full && bottle.content.length > 0 && bottle.content.every((color) => color === bottle.content[0])

  button.classList.toggle('is-selected', session.selected === index)
  button.classList.toggle('is-corked', corked)
  button.setAttribute('aria-pressed', String(session.selected === index))
  button.disabled = corked
}

export function renderBoard(session: Session, host: HTMLElement): void {
  const state = session.state
  const expected = state.bottles.length

  // La structure n'est bâtie qu'une fois par niveau ; ensuite tout se met à
  // jour en place.
  if (host.dataset['level'] !== session.spec.id || host.querySelectorAll('.bottle').length !== expected) {
    host.dataset['level'] = session.spec.id
    host.replaceChildren()

    const collector = state.bottles[COLLECTOR]
    if (collector) {
      const column = document.createElement('div')
      column.className = 'board__collector'
      column.append(createBottle(session, COLLECTOR, collector))
      host.append(column)
    }

    const shelf = document.createElement('div')
    shelf.className = 'board__shelf'
    state.bottles.forEach((bottle, index) => {
      if (index === COLLECTOR) return
      shelf.append(createBottle(session, index, bottle))
    })
    host.append(shelf)
  }

  state.bottles.forEach((bottle, index) => {
    const button = host.querySelector<HTMLButtonElement>(`.bottle[data-index="${index}"]`)
    if (button) updateBottle(button, session, index, bottle)
  })
}
