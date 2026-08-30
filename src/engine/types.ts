/**
 * Types du moteur. Aucune dépendance au DOM : ce code tourne aussi bien dans le
 * navigateur que sous Node pour le solveur et le générateur de niveaux.
 */

/** Index dans la palette du niveau. */
export type ColorId = number

/**
 * Le collecteur occupe toujours l'index 0. Cette convention évite de trimballer
 * un identifiant, et les règles qui le concernent se lisent directement.
 */
export const COLLECTOR = 0

export interface Bottle {
  readonly capacity: number
  /** Du fond (index 0) vers le goulot (dernier index). */
  readonly content: readonly ColorId[]
}

export interface GameState {
  /** `bottles[COLLECTOR]` est le collecteur ; toutes les autres sont standard. */
  readonly bottles: readonly Bottle[]
  readonly collectColor: ColorId
}

export interface Move {
  readonly from: number
  readonly to: number
}

/** Format sérialisé d'un niveau (voir §6.4 des règles). */
export interface LevelSpec {
  readonly id: string
  readonly palette: readonly string[]
  readonly standardCapacity: number
  readonly collector: {
    readonly capacity: number
    readonly color: ColorId
    /** Chiffres indexant `palette`, du fond vers le goulot. */
    readonly content: string
  }
  /** Une chaîne par bouteille standard, chiffres indexant `palette`. */
  readonly bottles: readonly string[]
  readonly par?: number
  readonly seed?: number
  readonly generator?: string
}
