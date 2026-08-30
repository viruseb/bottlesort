import { loadLevel } from '../engine/level'
import { applyMove, canPour, isBlocked, isWon } from '../engine/rules'
import { COLLECTOR, type GameState, type LevelSpec, type Move } from '../engine/types'

export type Status = 'playing' | 'won' | 'blocked'

/**
 * Partie en cours. La v1 n'offre pas d'annulation (décision D7), mais
 * l'historique est tenu quand même : il ne coûte rien, il sert aux tests et au
 * rejeu, et il permettra d'activer l'annulation sans toucher au moteur.
 */
export class Session {
  readonly spec: LevelSpec
  private readonly initial: GameState
  private current: GameState
  private readonly history: Move[] = []
  selected: number | null = null

  constructor(spec: LevelSpec) {
    this.spec = spec
    this.initial = loadLevel(spec)
    this.current = this.initial
  }

  get state(): GameState {
    return this.current
  }

  get moveCount(): number {
    return this.history.length
  }

  get status(): Status {
    if (isWon(this.current)) return 'won'
    if (isBlocked(this.current)) return 'blocked'
    return 'playing'
  }

  canSelect(index: number): boolean {
    if (index === COLLECTOR) return false
    return this.current.bottles.some((_, other) => canPour(this.current, index, other))
  }

  /** Retourne `true` si le clic a produit un coup. */
  tap(index: number): boolean {
    if (this.status !== 'playing') return false

    if (this.selected === null) {
      if (this.canSelect(index)) this.selected = index
      return false
    }

    if (this.selected === index) {
      this.selected = null
      return false
    }

    if (!canPour(this.current, this.selected, index)) {
      // Destination invalide : on garde la sélection (Q2 des règles), le joueur
      // vise souvent à côté sur un plateau dense.
      return false
    }

    this.current = applyMove(this.current, { from: this.selected, to: index })
    this.history.push({ from: this.selected, to: index })
    this.selected = null
    return true
  }

  restart(): void {
    this.current = this.initial
    this.history.length = 0
    this.selected = null
  }
}
