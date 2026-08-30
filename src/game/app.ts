import { campaign } from './levels'
import { generateLevel } from './random'
import { renderBoard } from './render'
import { Session } from './session'
import type { LevelSpec } from '../engine/types'

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
    session.tap(index)
    refresh()
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
