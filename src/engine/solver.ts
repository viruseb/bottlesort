import { blockCount } from './bottle'
import { applyMove, canPour, canonicalKey, isWon, legalMoves } from './rules'
import { COLLECTOR, type ColorId, type GameState, type Move } from './types'

export interface SolveOptions {
  /** Plafond de nœuds explorés. Au-delà, la recherche abandonne. */
  maxNodes?: number
  maxMs?: number
}

export interface SolveResult {
  moves: Move[] | null
  /** `true` si la solution est prouvée optimale (recherche menée à son terme). */
  optimal: boolean
  nodes: number
  /** `true` si le budget a été épuisé avant conclusion. */
  exhausted: boolean
}

const DEFAULTS = { maxNodes: 2_000_000, maxMs: 30_000 }

/**
 * Nombre de contenants que chaque couleur doit occuper à la fin : `total / C`
 * pour une couleur ordinaire, 1 pour la couleur de collecte (son collecteur).
 */
export function targetBottles(state: GameState): Map<ColorId, number> {
  const capacity = state.bottles[1]?.capacity ?? 0
  const totals = new Map<ColorId, number>()
  for (const bottle of state.bottles) {
    for (const color of bottle.content) totals.set(color, (totals.get(color) ?? 0) + 1)
  }

  const targets = new Map<ColorId, number>()
  for (const [color, total] of totals) {
    targets.set(color, color === state.collectColor ? 1 : Math.ceil(total / capacity))
  }
  return targets
}

/**
 * Heuristique admissible, somme de deux minorants portant sur des ensembles de
 * coups **disjoints** — un versement ne déplace qu'une seule couleur :
 *
 * - couleurs ordinaires : `blocs(c) - m_c`, car un versement ne fusionne au
 *   mieux qu'une paire de blocs de la couleur versée ;
 * - couleur de collecte : la **moitié** du nombre de blocs restés hors du
 *   collecteur, arrondie au supérieur.
 *
 * Le facteur deux n'est pas de la prudence, c'est une nécessité. Un versement
 * peut résorber deux blocs de collecte d'un coup : il vide le bloc de la
 * source, et si la destination s'en trouve pleine, le transfert automatique
 * l'expédie gratuitement dans le collecteur. Compter un bloc par coup
 * surestimerait le travail restant et rendrait la recherche inadmissible —
 * elle rendrait des solutions non optimales en les croyant optimales.
 */
export function heuristic(state: GameState, targets: Map<ColorId, number>): number {
  let total = 0

  for (const [color, target] of targets) {
    if (color === state.collectColor) continue
    let blocks = 0
    for (const bottle of state.bottles) blocks += blockCount(bottle, color)
    total += Math.max(0, blocks - target)
  }

  let outside = 0
  state.bottles.forEach((bottle, index) => {
    if (index !== COLLECTOR) outside += blockCount(bottle, state.collectColor)
  })

  return total + Math.ceil(outside / 2)
}

/**
 * Note de conception : on pourrait croire qu'un versement vers le collecteur
 * peut être joué d'office — c'est un puits monotone (I4), il libère de la place
 * et n'en consomme nulle part. C'est faux, deux fois plutôt qu'une, et les deux
 * contre-exemples ont été trouvés en test :
 *
 * - **il coûte des coups.** Le transfert automatique est gratuit : compléter
 *   une bouteille de la couleur de collecte expédie `C` unités sans dépenser de
 *   coup. Verser tout de suite prive de cette économie.
 * - **il peut mener à une impasse.** Forcer ce coup interdit d'explorer les
 *   autres au même nœud ; sur un plateau très contraint, la recherche se
 *   retrouve sans successeur et conclut à tort à l'insolubilité.
 *
 * Le collecteur crée donc bel et bien une décision tactique — expédier
 * maintenant, ou compléter une bouteille et expédier gratuitement.
 */

/**
 * Coups distincts à permutation près. Deux bouteilles standard de même contenu
 * sont interchangeables : les utiliser toutes les deux comme source ou comme
 * destination produit des états canoniquement identiques. Sur un plateau où
 * traînent une dizaine de bouteilles vides, cet élagage divise le facteur de
 * branchement par autant.
 *
 * Contrairement à l'élagage du collecteur, celui-ci ne coûte rien : les états
 * écartés sont les mêmes, pas seulement aussi bons.
 */
export function candidateMoves(state: GameState): Move[] {
  // Classes d'équivalence : les bouteilles standard de même contenu sont
  // interchangeables. Le collecteur forme sa propre classe.
  const classes = new Map<string, number[]>()
  for (let index = 1; index < state.bottles.length; index += 1) {
    let encoded = ''
    for (const color of state.bottles[index]!.content) encoded += String.fromCharCode(48 + color)
    const members = classes.get(encoded)
    if (members) members.push(index)
    else classes.set(encoded, [index])
  }

  const groups: number[][] = [[COLLECTOR], ...classes.values()]
  const moves: Move[] = []

  for (const sources of groups) {
    for (const targets of groups) {
      // Quand source et destination appartiennent à la même classe, il faut
      // **deux** bouteilles distinctes de cette classe : verser une bouteille
      // dans sa jumelle est un coup réel, pas une permutation. L'oublier rend
      // insolubles les positions qui se terminent en fusionnant deux bouteilles
      // à demi remplies du même contenu.
      const from = sources[0]
      const to = sources === targets ? targets[1] : targets[0]
      if (from === undefined || to === undefined) continue
      if (canPour(state, from, to)) moves.push({ from, to })
    }
  }

  return moves
}

export function solve(state: GameState, options: SolveOptions = {}): SolveResult {
  const { maxNodes, maxMs } = { ...DEFAULTS, ...options }
  const targets = targetBottles(state)
  const deadline = Date.now() + maxMs

  let nodes = 0
  let exhausted = false

  const search = (
    current: GameState,
    depth: number,
    bound: number,
    path: Move[],
    onPath: Set<string>,
  ): number | 'found' => {
    const estimate = depth + heuristic(current, targets)
    if (estimate > bound) return estimate
    if (isWon(current)) return 'found'

    nodes += 1
    if (nodes > maxNodes || Date.now() > deadline) {
      exhausted = true
      return Infinity
    }

    const candidates = candidateMoves(current)

    let best = Infinity
    const seen = new Set<string>()

    for (const move of candidates) {
      const next = applyMove(current, move)
      const key = canonicalKey(next)
      // Les coups stériles donnent le même état canonique : ils sont ici
      // éliminés sans traitement particulier (§3.4 des règles).
      if (onPath.has(key) || seen.has(key)) continue
      seen.add(key)

      onPath.add(key)
      path.push(move)
      const result = search(next, depth + 1, bound, path, onPath)
      if (result === 'found') return 'found'
      onPath.delete(key)
      path.pop()

      if (result < best) best = result
      if (exhausted) return Infinity
    }

    return best
  }

  const path: Move[] = []
  let bound = heuristic(state, targets)

  while (bound !== Infinity) {
    const onPath = new Set<string>([canonicalKey(state)])
    const result = search(state, 0, bound, path, onPath)
    if (result === 'found') return { moves: path, optimal: !exhausted, nodes, exhausted }
    if (exhausted) return { moves: null, optimal: false, nodes, exhausted: true }
    bound = result
  }

  return { moves: null, optimal: true, nodes, exhausted: false }
}

/**
 * Joueur glouton : choisit toujours le coup qui fait le plus baisser
 * l'heuristique. Sert de critère de qualité — un niveau est intéressant quand
 * la stratégie évidente échoue là où le solveur réussit (§6.3.3).
 */
export function playGreedy(state: GameState, maxSteps = 500): boolean {
  const targets = targetBottles(state)
  let current = state

  for (let step = 0; step < maxSteps; step += 1) {
    if (isWon(current)) return true

    let best: { state: GameState; score: number } | undefined
    const key = canonicalKey(current)

    for (const move of legalMoves(current)) {
      const next = applyMove(current, move)
      if (canonicalKey(next) === key) continue
      const score = heuristic(next, targets)
      if (!best || score < best.score) best = { state: next, score }
    }

    if (!best) return false
    current = best.state
  }

  return isWon(current)
}

export interface BeamOptions {
  /** Nombre d'états conservés à chaque profondeur. */
  width?: number
  maxDepth?: number
}

/**
 * Recherche en faisceau : à chaque profondeur, on ne garde que les `width`
 * états les plus prometteurs selon l'heuristique.
 *
 * Elle ne prouve rien — la solution rendue est une **borne supérieure**, jamais
 * un optimum. C'est le prix à payer au-delà d'une quinzaine de bouteilles, où
 * la recherche exhaustive n'aboutit plus. La solvabilité, elle, reste acquise
 * par construction chez le générateur (§6.3) : le faisceau ne sert qu'à mesurer.
 */
export function solveBeam(state: GameState, options: BeamOptions = {}): SolveResult {
  const width = options.width ?? 300
  const maxDepth = options.maxDepth ?? 1000
  const targets = targetBottles(state)

  let frontier: { state: GameState; path: Move[] }[] = [{ state, path: [] }]
  const visited = new Set<string>([canonicalKey(state)])
  let nodes = 0

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const successors: { state: GameState; path: Move[]; score: number }[] = []

    for (const node of frontier) {
      if (isWon(node.state)) {
        return { moves: node.path, optimal: node.path.length === 0, nodes, exhausted: false }
      }
      nodes += 1

      for (const move of candidateMoves(node.state)) {
        const next = applyMove(node.state, move)
        const key = canonicalKey(next)
        if (visited.has(key)) continue
        visited.add(key)
        successors.push({
          state: next,
          path: [...node.path, move],
          score: heuristic(next, targets),
        })
      }
    }

    if (successors.length === 0) break
    successors.sort((left, right) => left.score - right.score)
    frontier = successors.slice(0, width)
  }

  return { moves: null, optimal: false, nodes, exhausted: true }
}

/**
 * Meilleure solution connue : optimalité prouvée quand elle est atteignable,
 * repli sur le faisceau sinon. Le drapeau `optimal` dit lequel des deux a parlé
 * — il ne faut jamais présenter une borne supérieure comme un optimum.
 */
export function solveBest(state: GameState, options: SolveOptions & BeamOptions = {}): SolveResult {
  const exact = solve(state, options)
  if (exact.moves && exact.optimal) return exact
  return solveBeam(state, options)
}
