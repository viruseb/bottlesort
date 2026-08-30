/**
 * Progression du joueur : meilleur score par niveau et déverrouillage.
 *
 * Le cœur est volontairement **pur** — pas de `localStorage` ici. La
 * persistance est un détail, elle peut échouer (navigation privée, stockage
 * refusé), et le jeu doit rester jouable dans ce cas.
 */

export const PROGRESS_VERSION = 1

export interface LevelRecord {
  /** Meilleur nombre de coups obtenu sur ce niveau. */
  readonly bestMoves: number
}

export interface Progress {
  readonly version: number
  readonly levels: Readonly<Record<string, LevelRecord>>
}

export const EMPTY_PROGRESS: Progress = { version: PROGRESS_VERSION, levels: {} }

/**
 * Barème d'étoiles. Le `par` d'un grand niveau n'est qu'une **meilleure
 * solution connue** (§9 des règles) : un joueur peut donc légitimement faire
 * mieux, et `moves <= par` doit rester la condition des trois étoiles plutôt
 * qu'une égalité stricte.
 *
 * Retourne `null` quand le niveau n'a pas de `par` — un niveau aléatoire n'est
 * pas noté, sa difficulté n'étant pas calibrée.
 */
export function starsFor(moves: number, par: number | undefined): number | null {
  if (par === undefined || par <= 0) return null
  if (moves <= par) return 3
  if (moves <= Math.ceil(par * 1.3)) return 2
  return 1
}

export function bestMoves(progress: Progress, id: string): number | null {
  return progress.levels[id]?.bestMoves ?? null
}

export function isCompleted(progress: Progress, id: string): boolean {
  return progress.levels[id] !== undefined
}

/** N'enregistre que si c'est une amélioration. */
export function record(progress: Progress, id: string, moves: number): Progress {
  const previous = progress.levels[id]?.bestMoves
  if (previous !== undefined && previous <= moves) return progress
  return {
    version: PROGRESS_VERSION,
    levels: { ...progress.levels, [id]: { bestMoves: moves } },
  }
}

/**
 * Un niveau est accessible s'il est le premier, s'il est déjà terminé, ou si
 * celui qui le précède l'est.
 */
export function isUnlocked(progress: Progress, ids: readonly string[], index: number): boolean {
  if (index <= 0) return true
  const current = ids[index]
  if (current !== undefined && isCompleted(progress, current)) return true
  const previous = ids[index - 1]
  return previous !== undefined && isCompleted(progress, previous)
}

export function totalStars(progress: Progress, levels: readonly { id: string; par?: number }[]): number {
  return levels.reduce((sum, level) => {
    const best = bestMoves(progress, level.id)
    return best === null ? sum : sum + (starsFor(best, level.par) ?? 0)
  }, 0)
}

/**
 * Lecture défensive : la sauvegarde vient du navigateur du joueur et peut être
 * tronquée, d'une version antérieure ou franchement corrompue. Un format
 * inattendu repart d'une progression vide plutôt que de faire planter le jeu.
 */
export function parse(raw: string | null): Progress {
  if (!raw) return EMPTY_PROGRESS
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_PROGRESS

    const candidate = parsed as { version?: unknown; levels?: unknown }
    if (candidate.version !== PROGRESS_VERSION) return EMPTY_PROGRESS
    if (typeof candidate.levels !== 'object' || candidate.levels === null) return EMPTY_PROGRESS

    const levels: Record<string, LevelRecord> = {}
    for (const [id, value] of Object.entries(candidate.levels as Record<string, unknown>)) {
      const moves = (value as { bestMoves?: unknown } | null)?.bestMoves
      if (typeof moves === 'number' && Number.isInteger(moves) && moves >= 0) {
        levels[id] = { bestMoves: moves }
      }
    }
    return { version: PROGRESS_VERSION, levels }
  } catch {
    return EMPTY_PROGRESS
  }
}

export function serialize(progress: Progress): string {
  return JSON.stringify(progress)
}
