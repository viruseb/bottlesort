import type { Move } from '../engine/types'

const TRAVEL_MS = 170
const POUR_MS = 190
const RETURN_MS = 150

/** Hauteur du goulot au-dessus de la bouteille visée, en pixels. */
const NECK_LIFT = 46

/**
 * Animation de versement : la bouteille se soulève, bascule au-dessus de sa
 * cible, un filet coule, puis elle regagne sa place.
 *
 * L'état du moteur, lui, a déjà changé : le contenu du plateau n'est mis à jour
 * qu'au milieu de l'animation, via `commit`, pour que le liquide ne quitte pas
 * la source avant que le filet ne coule.
 */
export class Pourer {
  private pending: (() => void) | null = null
  private timers: number[] = []

  get busy(): boolean {
    return this.pending !== null
  }

  /** Termine immédiatement une animation en cours, sans attendre. */
  finish(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
    const pending = this.pending
    this.pending = null
    pending?.()
  }

  play(host: HTMLElement, move: Move, color: string, commit: () => void): void {
    this.finish()

    const source = host.querySelector<HTMLElement>(`.bottle[data-index="${move.from}"]`)
    const target = host.querySelector<HTMLElement>(`.bottle[data-index="${move.to}"]`)
    if (!source || !target) {
      commit()
      return
    }

    const hostBox = host.getBoundingClientRect()
    const from = source.getBoundingClientRect()
    const to = target.getBoundingClientRect()

    // Le pivot est la base de la bouteille. Après une rotation de ±100°, le
    // goulot se retrouve à environ une hauteur de bouteille sur le côté, et
    // légèrement plus bas que la base — d'où le placement de la base pour que
    // le goulot tombe au-dessus de la cible.
    const fromLeft = from.left + from.width / 2 < to.left + to.width / 2
    const tilt = fromLeft ? 100 : -100
    const reach = from.height * 0.98
    const drop = from.height * 0.17

    const neckX = to.left + to.width / 2
    const neckY = to.top - NECK_LIFT

    const baseX = neckX + (fromLeft ? -reach : reach)
    const baseY = neckY - drop

    source.style.setProperty('--dx', `${baseX - (from.left + from.width / 2)}px`)
    source.style.setProperty('--dy', `${baseY - from.bottom}px`)
    source.style.setProperty('--tilt', `${tilt}deg`)
    source.style.setProperty('--pour-travel', `${TRAVEL_MS}ms`)
    source.style.setProperty('--pour-return', `${RETURN_MS}ms`)
    source.classList.add('is-pouring')

    const stream = document.createElement('span')
    stream.className = 'stream'
    stream.style.background = color
    stream.style.left = `${neckX - hostBox.left}px`
    stream.style.top = `${neckY - hostBox.top}px`
    stream.style.height = `${Math.max(NECK_LIFT, to.top - neckY)}px`
    stream.hidden = true
    host.append(stream)

    const cleanup = (): void => {
      stream.remove()
      source.classList.remove('is-pouring', 'is-returning')
      source.style.removeProperty('--dx')
      source.style.removeProperty('--dy')
      source.style.removeProperty('--tilt')
    }

    this.pending = () => {
      commit()
      cleanup()
    }

    this.timers.push(
      window.setTimeout(() => {
        stream.hidden = false
        commit()
      }, TRAVEL_MS),
      window.setTimeout(() => {
        stream.hidden = true
        source.classList.remove('is-pouring')
        source.classList.add('is-returning')
      }, TRAVEL_MS + POUR_MS),
      window.setTimeout(() => {
        this.pending = null
        this.timers = []
        cleanup()
      }, TRAVEL_MS + POUR_MS + RETURN_MS),
    )
  }
}
