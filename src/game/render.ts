import { COLLECTOR, type Bottle } from '../engine/types'
import type { Session } from './session'

/** Noms de couleurs de la palette vers les variables CSS du thème. */
function colorVariable(palette: readonly string[], index: number): string {
  return `var(--liquid-${palette[index] ?? 'unknown'})`
}

function describe(bottle: Bottle, palette: readonly string[]): string {
  if (bottle.content.length === 0) return 'bouteille vide'
  // Du fond vers le goulot : l'ordre qu'annonce la description est celui que
  // le joueur voit. Sans cette description, un daltonien ne peut pas jouer.
  const layers = bottle.content.map((color) => palette[color] ?? '?').join(', ')
  return `de bas en haut : ${layers}`
}

function renderBottle(session: Session, index: number, bottle: Bottle): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'bottle'
  button.dataset['index'] = String(index)
  button.style.setProperty('--capacity', String(bottle.capacity))

  const isCollector = index === COLLECTOR
  if (isCollector) button.classList.add('bottle--collector')
  if (session.selected === index) button.classList.add('is-selected')

  const full = bottle.content.length === bottle.capacity
  const monochrome =
    bottle.content.length > 0 && bottle.content.every((color) => color === bottle.content[0])
  if (full && monochrome) button.classList.add('is-corked')

  const palette = session.spec.palette
  const liquid = document.createElement('span')
  liquid.className = 'bottle__liquid'
  for (const color of bottle.content) {
    const layer = document.createElement('span')
    layer.className = 'layer'
    layer.style.background = colorVariable(palette, color)
    liquid.append(layer)
  }
  button.append(liquid)

  if (isCollector) {
    // Le collecteur n'accepte que sa couleur, y compris à vide (décision D4).
    // Sans ce repère, le joueur découvre la règle par essai-erreur.
    button.style.setProperty(
      '--collect-color',
      colorVariable(palette, session.spec.collector.color),
    )
    const mark = document.createElement('span')
    mark.className = 'bottle__mark'
    button.append(mark)
  }

  const label = isCollector
    ? `Collecteur, ${palette[session.spec.collector.color] ?? '?'}`
    : `Bouteille ${index}`
  button.setAttribute('aria-label', `${label}, ${describe(bottle, palette)}`)
  button.setAttribute('aria-pressed', String(session.selected === index))
  if (full && monochrome) button.disabled = true

  return button
}

export function renderBoard(session: Session, host: HTMLElement): void {
  const state = session.state
  host.replaceChildren()

  const collector = state.bottles[COLLECTOR]
  if (collector) {
    const column = document.createElement('div')
    column.className = 'board__collector'
    column.append(renderBottle(session, COLLECTOR, collector))
    host.append(column)
  }

  const shelf = document.createElement('div')
  shelf.className = 'board__shelf'
  state.bottles.forEach((bottle, index) => {
    if (index === COLLECTOR) return
    shelf.append(renderBottle(session, index, bottle))
  })
  host.append(shelf)
}
