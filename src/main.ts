import './style.css'

// Décor de la page d'attente. Le vrai plateau viendra du moteur (lot 3) ;
// ici on se contente de vérifier que la chaîne TypeScript + CSS est bien câblée.
const DECOR: readonly (readonly string[])[] = [
  ['orange', 'orange', 'orange', 'orange', 'orange'],
  ['green', 'dark', 'orange'],
  ['blue', 'white'],
  ['dark'],
]

function renderBottle(layers: readonly string[], index: number): HTMLElement {
  const bottle = document.createElement('div')
  bottle.className = `bottle bottle--${index === 0 ? 'collector' : 'standard'}`
  for (const color of layers) {
    const layer = document.createElement('div')
    layer.className = 'layer'
    layer.style.background = `var(--${color})`
    bottle.append(layer)
  }
  return bottle
}

const host = document.querySelector<HTMLElement>('#bottles')
if (host) host.append(...DECOR.map(renderBottle))
