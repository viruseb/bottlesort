import { freeSpace, isComplete, isEmpty, isFull, isMonochrome, topColor, topRun } from './bottle'
import { COLLECTOR, type Bottle, type ColorId, type GameState, type Move } from './types'

/**
 * Conditions de légalité d'un transvasement (§3.1 des règles).
 *
 * Verser une bouteille monochrome dans une bouteille vide **est** autorisé
 * (décision D1) : la canonisation absorbe ce coup, qui ne change pas l'état.
 */
export function canPour(state: GameState, from: number, to: number): boolean {
  if (from === to) return false

  // Le collecteur est un puits : il se remplit, il ne se vide jamais (I4).
  if (from === COLLECTOR) return false

  const source = state.bottles[from]
  const target = state.bottles[to]
  if (!source || !target) return false

  const run = topRun(source)
  if (!run) return false
  if (isComplete(source) || isComplete(target)) return false
  if (isFull(target)) return false

  // Un collecteur vide accepterait n'importe quelle couleur si l'on s'en
  // remettait au seul test du sommet : la restriction est donc explicite (D4).
  if (to === COLLECTOR && run.color !== state.collectColor) return false

  const destination = topColor(target)
  return destination === null || destination === run.color
}

export function legalMoves(state: GameState): Move[] {
  const moves: Move[] = []
  for (let from = 0; from < state.bottles.length; from += 1) {
    for (let to = 0; to < state.bottles.length; to += 1) {
      if (canPour(state, from, to)) moves.push({ from, to })
    }
  }
  return moves
}

function withContent(bottle: Bottle, content: readonly ColorId[]): Bottle {
  return { capacity: bottle.capacity, content }
}

/**
 * Phase de résolution (§4). Une bouteille standard pleine de la couleur de
 * collecte ne se bouche pas : son contenu part dans le collecteur et elle
 * redevient vide.
 *
 * Un transfert vide une bouteille, il ne peut donc pas en remplir une autre :
 * la boucle converge en une seule passe. Elle est écrite comme un point fixe
 * par prudence, pas par nécessité.
 */
export function resolve(state: GameState): GameState {
  let bottles = state.bottles
  let changed = true

  while (changed) {
    changed = false
    for (let index = 0; index < bottles.length; index += 1) {
      if (index === COLLECTOR) continue
      const bottle = bottles[index]
      if (!bottle || !isFull(bottle) || isEmpty(bottle)) continue
      if (!isMonochrome(bottle) || bottle.content[0] !== state.collectColor) continue

      const collector = bottles[COLLECTOR]
      if (!collector) continue
      if (freeSpace(collector) < bottle.content.length) {
        // Impossible sous la contrainte V1 (§4.2). Si cela se produit, c'est un
        // niveau invalide : le signaler plutôt que de tronquer silencieusement.
        throw new Error(
          `Débordement du collecteur : ${bottle.content.length} unités pour ${freeSpace(collector)} libres`,
        )
      }

      const next = bottles.slice()
      next[COLLECTOR] = withContent(collector, [...collector.content, ...bottle.content])
      next[index] = withContent(bottle, [])
      bottles = next
      changed = true
    }
  }

  return bottles === state.bottles ? state : { ...state, bottles }
}

/**
 * Applique le seul versement, **sans** la phase de résolution. L'état retourné
 * n'est pas stabilisé : il peut contenir une bouteille pleine de la couleur de
 * collecte, que la résolution expédiera.
 *
 * Réservé à l'affichage, qui a besoin de cet instant intermédiaire pour animer
 * le transfert automatique. Le jeu, lui, passe toujours par `applyMove`.
 */
export function applyPour(state: GameState, move: Move): GameState {
  const { from, to } = move
  if (!canPour(state, from, to)) {
    throw new Error(`Coup illégal : ${from} -> ${to}`)
  }

  const source = state.bottles[from]!
  const target = state.bottles[to]!
  const run = topRun(source)!
  const quantity = Math.min(run.size, freeSpace(target))

  const bottles = state.bottles.slice()
  bottles[from] = withContent(source, source.content.slice(0, source.content.length - quantity))
  bottles[to] = withContent(target, [...target.content, ...Array<ColorId>(quantity).fill(run.color)])

  return { ...state, bottles }
}

/**
 * Applique un coup et sa résolution. Le couple forme une transition unique :
 * un état retourné par `applyMove` est toujours stabilisé.
 */
export function applyMove(state: GameState, move: Move): GameState {
  return resolve(applyPour(state, move))
}

/**
 * Victoire (§5.1) : toute bouteille est vide ou bouchée. Le critère plus faible
 * « vide ou monochrome » accepterait une couleur éparpillée sur plusieurs
 * bouteilles partiellement remplies.
 */
export function isWon(state: GameState): boolean {
  return state.bottles.every((bottle) => isEmpty(bottle) || isComplete(bottle))
}

/**
 * Clé canonique. Les bouteilles standard partagent la même capacité et sont
 * donc permutables : on les trie. Le collecteur ne l'est pas — capacité et rôle
 * distincts — et ne contenant qu'une couleur, son état tient dans son
 * remplissage.
 */
export function canonicalKey(state: GameState): string {
  const standard: string[] = []
  for (let index = 0; index < state.bottles.length; index += 1) {
    if (index === COLLECTOR) continue
    // Une couleur par caractère : la clé est calculée à chaque nœud exploré,
    // c'est le point chaud de la recherche.
    let encoded = ''
    for (const color of state.bottles[index]!.content) encoded += String.fromCharCode(48 + color)
    standard.push(encoded)
  }
  standard.sort()
  return `${state.bottles[COLLECTOR]?.content.length ?? 0}|${standard.join('/')}`
}

/**
 * Blocage (§5.2) : le versement stérile étant autorisé, compter les coups
 * légaux ne suffit pas — il en reste presque toujours. Le vrai critère est
 * qu'aucun coup ne change l'état canonique.
 */
export function isBlocked(state: GameState): boolean {
  if (isWon(state)) return false
  const key = canonicalKey(state)
  return legalMoves(state).every((move) => canonicalKey(applyMove(state, move)) === key)
}
