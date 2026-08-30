/** Sort la solution d'un niveau en JSON, pour piloter un test de bout en bout. */
import { readFileSync } from 'node:fs'
import { loadLevel } from '../src/engine/level'
import { solve } from '../src/engine/solver'
import type { LevelSpec } from '../src/engine/types'

const path = process.argv[2]
if (!path) throw new Error('usage : solution.ts <chemin-du-niveau.json>')

const spec = JSON.parse(readFileSync(path, 'utf8')) as LevelSpec
const result = solve(loadLevel(spec), { maxNodes: 500_000, maxMs: 20_000 })
console.log(JSON.stringify({ id: spec.id, optimal: result.optimal, moves: result.moves }))
