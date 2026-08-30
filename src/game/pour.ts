import type { ColorId, Move } from '../engine/types'

/** Durées, en millisecondes. */
const TRAVEL_MS = 340
const RETURN_MS = 300
/** La coulée dure d'autant plus longtemps qu'il passe d'unités. */
const POUR_BASE_MS = 160
const POUR_PER_UNIT_MS = 110

/** Hauteur du goulot au-dessus de la bouteille visée, en pixels. */
const NECK_LIFT = 46

export interface PourRequest extends Move {
  readonly color: ColorId
  readonly quantity: number
}

export interface PourCallbacks {
  /** Mise à jour du plateau, jouée au milieu de l'animation. */
  commit: () => void
  /** Fin de l'animation. `interrupted` vaut `true` si elle a été écourtée. */
  done: (interrupted: boolean) => void
}

export function pourDuration(quantity: number): number {
  return POUR_BASE_MS + POUR_PER_UNIT_MS * Math.max(1, quantity)
}

/**
 * Animation de versement : la bouteille se soulève, bascule au-dessus de sa
 * cible, un filet coule, puis elle regagne sa place.
 *
 * L'état du moteur a déjà changé quand l'animation démarre ; le plateau n'est
 * mis à jour qu'au milieu, via `commit`, pour que le liquide ne quitte pas la
 * source avant que le filet ne coule.
 */
export class Pourer {
  private settle: ((interrupted: boolean) => void) | null = null
  private timers: number[] = []

  get busy(): boolean {
    return this.settle !== null
  }

  /** Termine immédiatement une animation en cours, sans attendre. */
  finish(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
    const settle = this.settle
    this.settle = null
    settle?.(true)
  }

  play(host: HTMLElement, request: PourRequest, color: string, callbacks: PourCallbacks): void {
    this.finish()

    const source = host.querySelector<HTMLElement>(`.bottle[data-index="${request.from}"]`)
    const target = host.querySelector<HTMLElement>(`.bottle[data-index="${request.to}"]`)

    // Mouvement réduit : on saute l'animation au lieu de la neutraliser. La
    // neutraliser laisserait le joueur attendre une seconde devant un plateau
    // immobile, ce qui est pire que l'animation elle-même.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    if (!source || !target || reduced) {
      callbacks.commit()
      callbacks.done(false)
      return
    }

    const pourMs = pourDuration(request.quantity)
    const hostBox = host.getBoundingClientRect()
    const from = source.getBoundingClientRect()
    const to = target.getBoundingClientRect()

    // Le pivot est la base de la bouteille. Après une rotation de ±100°, le
    // goulot se retrouve à environ une hauteur de bouteille sur le côté et
    // légèrement plus bas que la base — d'où le placement de la base pour que
    // le goulot tombe au-dessus de la cible.
    const fromLeft = from.left + from.width / 2 < to.left + to.width / 2
    const reach = from.height * 0.98
    const drop = from.height * 0.17

    const neckX = to.left + to.width / 2
    const neckY = to.top - NECK_LIFT
    const baseX = neckX + (fromLeft ? -reach : reach)
    const baseY = neckY - drop

    source.style.setProperty('--dx', `${baseX - (from.left + from.width / 2)}px`)
    source.style.setProperty('--dy', `${baseY - from.bottom}px`)
    source.style.setProperty('--tilt', `${fromLeft ? 100 : -100}deg`)
    source.style.setProperty('--pour-travel', `${TRAVEL_MS}ms`)
    source.style.setProperty('--pour-return', `${RETURN_MS}ms`)
    source.classList.add('is-pouring')

    // Les couches se remplissent au rythme de la coulée plutôt qu'à une durée
    // fixe, sinon un versement de quatre unités serait plein bien avant la fin.
    host.style.setProperty('--pour-fill', `${pourMs}ms`)

    const stream = document.createElement('span')
    stream.className = 'stream'
    stream.style.background = color
    stream.style.left = `${neckX - hostBox.left}px`
    stream.style.top = `${neckY - hostBox.top}px`
    stream.style.height = `${Math.max(NECK_LIFT, to.top - neckY)}px`
    stream.hidden = true
    host.append(stream)

    let committed = false
    const commitOnce = (): void => {
      if (committed) return
      committed = true
      callbacks.commit()
    }

    const cleanup = (): void => {
      stream.remove()
      source.classList.remove('is-pouring', 'is-returning')
      source.style.removeProperty('--dx')
      source.style.removeProperty('--dy')
      source.style.removeProperty('--tilt')
    }

    this.settle = (interrupted) => {
      commitOnce()
      cleanup()
      callbacks.done(interrupted)
    }

    this.timers.push(
      window.setTimeout(() => {
        stream.hidden = false
        commitOnce()
      }, TRAVEL_MS),
      window.setTimeout(() => {
        stream.hidden = true
        source.classList.remove('is-pouring')
        source.classList.add('is-returning')
      }, TRAVEL_MS + pourMs),
      window.setTimeout(() => {
        // Remis à zéro avant l'appel : `done` peut enchaîner une animation.
        this.settle = null
        this.timers = []
        cleanup()
        callbacks.done(false)
      }, TRAVEL_MS + pourMs + RETURN_MS),
    )
  }
}
