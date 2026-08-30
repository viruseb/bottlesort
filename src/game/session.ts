import { loadLevel } from '../engine/level'
import { freeSpace, topRun } from '../engine/bottle'
import { applyPour, canPour, isBlocked, isWon, resolve } from '../engine/rules'
import { COLLECTOR, type ColorId, type GameState, type LevelSpec, type Move } from '../engine/types'

/** Dernier versement joué, de quoi l'animer. */
export interface Pour extends Move {
  readonly color: ColorId
  /** Unités réellement déplacées : la coulée dure d'autant plus longtemps. */
  readonly quantity: number
}

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
  lastPour: Pour | null = null

  /**
   * État juste après le versement, avant la résolution. L'affichage s'en sert
   * pour montrer la bouteille pleine avant de l'expédier au collecteur ; sans
   * lui, le transfert automatique serait invisible.
   */
  intermediate: GameState | null = null

  /** Bouteille partie dans le collecteur lors du dernier coup, s'il y en a une. */
  pendingTransfer: number | null = null

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

    const from = this.selected
    const source = this.current.bottles[from]!
    const poured = topRun(source)
    const quantity = poured ? Math.min(poured.size, freeSpace(this.current.bottles[index]!)) : 0

    const intermediate = applyPour(this.current, { from, to: index })
    const settled = resolve(intermediate)

    this.intermediate = intermediate
    this.pendingTransfer = intermediate.bottles.findIndex(
      (bottle, at) =>
        at !== COLLECTOR && bottle.content.length > 0 && settled.bottles[at]?.content.length === 0,
    )
    if (this.pendingTransfer === -1) this.pendingTransfer = null

    this.current = settled
    this.history.push({ from, to: index })
    this.lastPour = poured ? { from, to: index, color: poured.color, quantity } : null
    this.selected = null
    return true
  }

  restart(): void {
    this.current = this.initial
    this.history.length = 0
    this.selected = null
    this.lastPour = null
    this.intermediate = null
    this.pendingTransfer = null
  }
}
