/**
 * Recalcule l'optimum de chaque niveau par un BFS nu — sans heuristique, sans
 * élagage des coups équivalents — et le compare au `par` publié. Si les deux
 * divergent, c'est le solveur qui a tort, pas le joueur.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadLevel } from '../src/engine/level'
import { applyMove, canonicalKey, isWon, legalMoves } from '../src/engine/rules'
import { solve } from '../src/engine/solver'
import type { GameState, LevelSpec } from '../src/engine/types'

function bfs(start: GameState, maxStates = 2_000_000): number | null {
  if (isWon(start)) return 0
  const seen = new Set<string>([canonicalKey(start)])
  let frontier = [start]
  let depth = 0

  while (frontier.length > 0 && seen.size < maxStates) {
    depth += 1
    const next: GameState[] = []
    for (const state of frontier) {
      for (const move of legalMoves(state)) {
        const child = applyMove(state, move)
        const key = canonicalKey(child)
        if (seen.has(key)) continue
        if (isWon(child)) return depth
        seen.add(key)
        next.push(child)
      }
    }
    frontier = next
  }
  return null
}

const dir = join(process.cwd(), 'levels', 'facile')
for (const file of readdirSync(dir).sort()) {
  const spec = JSON.parse(readFileSync(join(dir, file), 'utf8')) as LevelSpec
  const state = loadLevel(spec)
  const exact = bfs(state)
  const solver = solve(state, { maxNodes: 500_000 })
  const verdict = exact === spec.par ? 'ok' : '*** ECART ***'
  console.log(
    `${spec.id} : par publié ${spec.par}, solveur ${solver.moves?.length ?? '-'}, BFS nu ${exact}  ${verdict}`,
  )
}
