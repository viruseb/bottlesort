/** Repère un niveau dont la solution déclenche un transfert automatique. */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { isFull, isMonochrome } from '../src/engine/bottle'
import { loadLevel } from '../src/engine/level'
import { applyMove, applyPour } from '../src/engine/rules'
import { solve } from '../src/engine/solver'
import { COLLECTOR, type LevelSpec } from '../src/engine/types'

const dir = join(process.cwd(), 'levels', 'facile')
for (const file of readdirSync(dir)) {
  const spec = JSON.parse(readFileSync(join(dir, file), 'utf8')) as LevelSpec
  let state = loadLevel(spec)
  const moves = solve(state, { maxNodes: 300_000 }).moves ?? []

  moves.forEach((move, step) => {
    const raw = applyPour(state, move)
    const transferred = raw.bottles.some(
      (bottle, index) =>
        index !== COLLECTOR &&
        isFull(bottle) &&
        isMonochrome(bottle) &&
        bottle.content[0] === state.collectColor,
    )
    if (transferred) console.log(`${spec.id} : transfert au coup ${step + 1} (${move.from} -> ${move.to})`)
    state = applyMove(state, move)
  })
}
