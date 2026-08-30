import { campaign } from './levels'
import { Pourer } from './pour'
import { bestMoves, isUnlocked, record, starsFor, totalStars, type Progress } from './progress'
import { loadProgress, saveProgress } from './storage'
import { generateLevel } from './random'
import { renderBoard } from './render'
import { Session } from './session'
import { COLLECTOR, type ColorId, type LevelSpec } from '../engine/types'

function colorOf(session: Session, color: ColorId): string {
  return `var(--liquid-${session.spec.palette[color] ?? 'unknown'})`
}

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
  score: HTMLElement
  next: HTMLButtonElement
}

const STAR = '★'
const EMPTY_STAR = '☆'

function stars(count: number): string {
  return STAR.repeat(count) + EMPTY_STAR.repeat(3 - count)
}

export function start(elements: Elements): void {
  let session: Session | null = null
  let campaignIndex: number | null = null
  let progress: Progress = loadProgress()
  const pourer = new Pourer()
  const ids = campaign.map((level) => level.id)
  const chips = new Map<number, HTMLButtonElement>()

  const refresh = (): void => {
    if (!session) return
    renderBoard(session, elements.board)

    const { par } = session.spec
    const parLabel = par === undefined ? 'par inconnu' : `par ${par}`
    elements.status.textContent = `${session.moveCount} coup${session.moveCount > 1 ? 's' : ''} — ${parLabel}`

    const status = session.status
    elements.banner.hidden = status === 'playing'
    elements.score.hidden = status !== 'won'
    elements.next.hidden =
      status !== 'won' || campaignIndex === null || campaignIndex + 1 >= campaign.length

    if (status === 'won') {
      elements.banner.textContent = 'Gagné — tous les bouchons sont posés.'
      elements.banner.className = 'banner banner--won'
      showScore(session)
    } else if (status === 'blocked') {
      elements.banner.textContent = 'Bloqué : plus aucun coup ne fait avancer le puzzle.'
      elements.banner.className = 'banner banner--blocked'
    }
  }

  /** Enregistre la performance et affiche la note. Idempotent : le rendu est
   *  rejoué à chaque rafraîchissement, l'enregistrement ne doit pas l'être. */
  let recordedFor: string | null = null

  const showScore = (active: Session): void => {
    const { id, par } = active.spec
    const moves = active.moveCount

    if (recordedFor !== id) {
      recordedFor = id
      progress = record(progress, id, moves)
      saveProgress(progress)
      refreshHome()
    }

    const earned = starsFor(moves, par)
    const best = bestMoves(progress, id)
    elements.score.innerHTML = ''

    if (earned === null) {
      elements.score.textContent = `${moves} coups`
    } else {
      elements.score.textContent = stars(earned)
      const detail = document.createElement('span')
      detail.className = 'score__detail'
      detail.textContent =
        best !== null && best < moves
          ? `${moves} coups — votre record : ${best}`
          : `${moves} coups pour un par de ${par}`
      elements.score.append(detail)
    }
  }

  const refreshHome = (): void => {
    const done = ids.filter((id) => bestMoves(progress, id) !== null).length
    const summary = document.querySelector('#campaign-progress')
    if (summary) {
      summary.textContent =
        done === 0
          ? 'Niveaux calibrés, difficulté croissante'
          : `${done}/${campaign.length} terminés — ${totalStars(progress, campaign)} étoiles`
    }

    chips.forEach((chip, index) => {
      const spec = campaign[index]
      if (!spec) return
      const unlocked = isUnlocked(progress, ids, index)
      const best = bestMoves(progress, spec.id)

      chip.disabled = !unlocked
      chip.classList.toggle('is-done', best !== null)
      chip.title = unlocked ? `${spec.id} — par ${spec.par ?? '?'}` : 'Terminez le niveau précédent'

      const marks = chip.querySelector('.chip__stars')
      if (marks) {
        marks.textContent = best === null ? '' : stars(starsFor(best, spec.par) ?? 0)
      }
    })
  }

  const open = (spec: LevelSpec, index: number | null, title: string): void => {
    session = new Session(spec)
    campaignIndex = index
    recordedFor = null
    elements.title.textContent = title
    elements.home.hidden = true
    elements.game.hidden = false
    refresh()
  }

  const openCampaign = (index: number): void => {
    const spec = campaign[index]
    if (!spec || !isUnlocked(progress, ids, index)) return
    open(spec, index, `Campagne ${index + 1}/${campaign.length}`)
  }

  /** Reprend là où le joueur s'est arrêté plutôt qu'au premier niveau. */
  const resumeCampaign = (): void => {
    const next = ids.findIndex((id) => bestMoves(progress, id) === null)
    openCampaign(next === -1 ? 0 : next)
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
    if (!moved || !pour) {
      refresh()
      return
    }

    const active = session

    /**
     * Le transfert automatique est le geste signature du jeu : une bouteille
     * pleine de la couleur de collecte part d'elle-même dans le collecteur. Il
     * s'anime donc comme un versement, enchaîné au premier — sans quoi la
     * bouteille disparaîtrait d'un coup, sans explication.
     */
    const playTransfer = (interrupted: boolean): void => {
      const transfer = active.pendingTransfer
      if (interrupted || transfer === null) {
        refresh()
        return
      }

      pourer.play(
        elements.board,
        {
          from: transfer,
          to: COLLECTOR,
          color: active.state.collectColor,
          quantity: active.intermediate?.bottles[transfer]?.content.length ?? 1,
        },
        colorOf(active, active.state.collectColor),
        { commit: refresh, done: () => refresh() },
      )
    }

    pourer.play(elements.board, pour, colorOf(active, pour.color), {
      // Montre d'abord le versement seul : la résolution attend son animation.
      commit: () => renderBoard(active, elements.board, active.intermediate ?? undefined),
      done: playTransfer,
    })
  })

  document.querySelector('#play-campaign')?.addEventListener('click', resumeCampaign)
  document.querySelector('#play-random')?.addEventListener('click', openRandom)
  document.querySelector('#restart')?.addEventListener('click', () => {
    pourer.finish()
    session?.restart()
    recordedFor = null
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
    campaign.forEach((_spec, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'chip'

      const number = document.createElement('span')
      number.textContent = String(index + 1)
      const marks = document.createElement('span')
      marks.className = 'chip__stars'
      button.append(number, marks)

      button.addEventListener('click', () => openCampaign(index))
      list.append(button)
      chips.set(index, button)
    })
  }

  refreshHome()
}
