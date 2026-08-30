import type { Bottle, ColorId } from './types'

export function isEmpty(bottle: Bottle): boolean {
  return bottle.content.length === 0
}

export function isFull(bottle: Bottle): boolean {
  return bottle.content.length >= bottle.capacity
}

export function freeSpace(bottle: Bottle): number {
  return bottle.capacity - bottle.content.length
}

export function topColor(bottle: Bottle): ColorId | null {
  return bottle.content[bottle.content.length - 1] ?? null
}

export function isMonochrome(bottle: Bottle): boolean {
  const first = bottle.content[0]
  if (first === undefined) return true
  return bottle.content.every((color) => color === first)
}

/**
 * Une bouteille est complétée — donc bouchée et verrouillée — lorsqu'elle est
 * pleine et monochrome. C'est une propriété **dérivée** du contenu, jamais
 * stockée : la mémoriser rendrait la marche arrière du générateur incohérente
 * avec le jeu (§6.3.1 des règles).
 */
export function isComplete(bottle: Bottle): boolean {
  return isFull(bottle) && !isEmpty(bottle) && isMonochrome(bottle)
}

/** Suite maximale d'unités de même couleur au goulot. */
export function topRun(bottle: Bottle): { color: ColorId; size: number } | null {
  const { content } = bottle
  const last = content.length - 1
  const color = content[last]
  if (color === undefined) return null

  let size = 1
  while (size <= last && content[last - size] === color) size += 1
  return { color, size }
}

/** Nombre de blocs contigus de `color`. Sert à l'heuristique du solveur. */
export function blockCount(bottle: Bottle, color: ColorId): number {
  let blocks = 0
  let previous: ColorId | undefined
  for (const current of bottle.content) {
    if (current === color && previous !== color) blocks += 1
    previous = current
  }
  return blocks
}
