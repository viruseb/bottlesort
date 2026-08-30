/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * `Math.random` n'accepte pas de graine : sans cette implémentation, une
 * génération ne pourrait pas être rejouée, et la graine stockée dans un niveau
 * ne vaudrait rien (§6.4 des règles).
 */
export interface Rng {
  /** Flottant dans [0, 1). */
  next(): number
  /** Entier dans [0, bound). */
  int(bound: number): number
  /** Élément tiré uniformément, ou `undefined` si la liste est vide. */
  pick<T>(items: readonly T[]): T | undefined
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (bound: number): number => Math.floor(next() * bound)

  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T | undefined =>
      items.length === 0 ? undefined : items[int(items.length)],
  }
}

/** Graine aléatoire, pour lancer une génération sans en imposer une. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}
