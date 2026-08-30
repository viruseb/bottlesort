import { campaign } from './levels'
import { Pourer } from './pour'
import { generateLevel } from './random'
import { renderBoard } from './render'
import { Session } from './session'
import type { LevelSpec } from '../engine/types'

const PATTERNS_KEY = 'bottlesort:patterns'

/**
 * Le mode motifs est une préférence d'affichage locale : le stockage peut être
 * refusé (navigation privée, site data bloqué), auquel cas on retombe
 * simplement sur le mode par défaut.
 */
function readPatterns(): boolean {
  try {
    return localStorage.getItem(PATTERNS_KEY) === '1'
  } catch {
    return false
  }
}

function applyPatterns(enabled: boolean): void {
  document.documentElement.toggleAttribute('data-patterns', enabled)
  try {
    localStorage.setItem(PATTERNS_KEY, enabled ? '1' : '0')
  } catch {
    // Préférence non mémorisée : sans conséquence sur la partie en cours.
  }
}

interface Elements {
  home: HTMLElement
  game: HTMLElement
  board: HTMLElement
  title: HTMLElement
  status: HTMLElement
  banner: HTMLElement
  next: HTMLButtonElement
}

export function start(elements: Elements): void {
  let session: Session | null = null
  let campaignIndex: number | null = null
  const pourer = new Pourer()

  const refresh = (): void => {
    if (!session) return
    renderBoard(session, elements.board)

    const { par } = session.spec
    const parLabel = par === undefined ? 'par inconnu' : `par ${par}`
    elements.status.textContent = `${session.moveCount} coup${session.moveCount > 1 ? 's' : ''} — ${parLabel}`

    const status = session.status
    elements.banner.hidden = status === 'playing'
    elements.next.hidden = status !== 'won' || campaignIndex === null
    if (status === 'won') {
      elements.banner.textContent = 'Gagné — tous les bouchons sont posés.'
      elements.banner.className = 'banner banner--won'
    } else if (status === 'blocked') {
      elements.banner.textContent = 'Bloqué : plus aucun coup ne fait avancer le puzzle.'
      elements.banner.className = 'banner banner--blocked'
    }
  }

  const open = (spec: LevelSpec, index: number | null, title: string): void => {
    session = new Session(spec)
    campaignIndex = index
    elements.title.textContent = title
    elements.home.hidden = true
    elements.game.hidden = false
    refresh()
  }

  const openCampaign = (index: number): void => {
    const spec = campaign[index]
    if (!spec) return
    open(spec, index, `Campagne ${index + 1}/${campaign.length}`)
  }

  const openRandom = (): void => {
    const spec = generateLevel()
    if (!spec) {
      elements.banner.hidden = false
      elements.banner.textContent = 'Génération impossible, réessaie.'
      return
    }
    open(spec, null, `Aléatoire — code ${spec.seed}`)
  }

  elements.board.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.bottle')
    if (!target || !session) return
    const index = Number.parseInt(target.dataset['index'] ?? '', 10)
    if (Number.isNaN(index)) return
    // Un appui pendant une animation la termine sur-le-champ plutôt que d'être
    // ignoré : sur un puzzle qu'on enchaîne vite, rien n'est plus agaçant qu'un
    // coup avalé.
    if (pourer.busy) pourer.finish()

    const moved = session.tap(index)
    const pour = session.lastPour
    if (moved && pour) {
      const color = `var(--liquid-${session.spec.palette[pour.color] ?? 'unknown'})`
      pourer.play(elements.board, pour, color, refresh)
    } else {
      refresh()
    }
  })

  document.querySelector('#play-campaign')?.addEventListener('click', () => openCampaign(0))
  document.querySelector('#play-random')?.addEventListener('click', openRandom)
  document.querySelector('#restart')?.addEventListener('click', () => {
    session?.restart()
    refresh()
  })
  document.querySelector('#back')?.addEventListener('click', () => {
    elements.game.hidden = true
    elements.home.hidden = false
    session = null
  })
  elements.next.addEventListener('click', () => {
    if (campaignIndex === null) return
    openCampaign(campaignIndex + 1)
  })

  const patterns = document.querySelector<HTMLButtonElement>('#patterns')
  if (patterns) {
    const sync = (enabled: boolean): void => {
      applyPatterns(enabled)
      patterns.setAttribute('aria-pressed', String(enabled))
      patterns.textContent = enabled ? 'Motifs : activés' : 'Motifs : désactivés'
    }
    sync(readPatterns())
    patterns.addEventListener('click', () => sync(!readPatterns()))
  }

  const list = document.querySelector('#campaign-list')
  if (list) {
    campaign.forEach((spec, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'chip'
      button.textContent = String(index + 1)
      button.title = spec.par === undefined ? spec.id : `${spec.id} — par ${spec.par}`
      button.addEventListener('click', () => openCampaign(index))
      list.append(button)
    })
  }
}
