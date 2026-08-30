/** Solutions optimales de tous les niveaux d'un dossier, en JSON. */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadLevel } from '../src/engine/level'
import { solve } from '../src/engine/solver'
import type { LevelSpec } from '../src/engine/types'

const dir = join(process.cwd(), 'levels', process.argv[2] ?? 'facile')
const out = readdirSync(dir)
  .sort()
  .map((file) => {
    const spec = JSON.parse(readFileSync(join(dir, file), 'utf8')) as LevelSpec
    const result = solve(loadLevel(spec), { maxNodes: 500_000 })
    return { id: spec.id, par: spec.par, moves: result.moves }
  })
console.log(JSON.stringify(out))
