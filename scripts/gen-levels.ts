/**
 * Génération de niveaux. Exécutable en local comme en CI (§6.5 des règles).
 *
 *   npm run levels:gen -- --preset moyen --count 10 --seed 20260830
 *
 * La solvabilité est acquise par construction : la marche arrière part de
 * l'état résolu. Le solveur ne sert donc pas à prouver qu'un niveau est
 * jouable, mais à **mesurer s'il est intéressant**.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { shuffle, toSpec, type LevelShape } from '../src/engine/generator'
import { validateLevel } from '../src/engine/level'
import { canonicalKey } from '../src/engine/rules'
import { createRng, randomSeed } from '../src/engine/rng'
import { cheapMetrics, scoreAgainst, solvedMetrics, type QualityTarget } from '../src/engine/quality'
import { playGreedy, type SolveOptions } from '../src/engine/solver'

const GENERATOR_VERSION = '1.0.0'
const PALETTE = ['orange', 'green', 'blue', 'dark', 'white']

interface Preset {
  readonly shape: LevelShape
  readonly steps: number
  readonly target: QualityTarget
  readonly solve: SolveOptions & { width?: number }
  /** Candidats produits par niveau retenu. */
  readonly candidates: number
}

const PRESETS: Record<string, Preset> = {
  facile: {
    shape: { standardCapacity: 4, collectorCapacity: 8, bottlesPerColor: [1, 1], emptyBottles: 3 },
    steps: 25,
    target: { minPar: 6, maxPar: 14, requireGreedyFailure: false, minCollectBlocks: 1 },
    solve: { maxNodes: 400_000, maxMs: 5_000 },
    candidates: 12,
  },
  moyen: {
    shape: {
      standardCapacity: 4,
      collectorCapacity: 8,
      bottlesPerColor: [2, 2, 2],
      emptyBottles: 4,
    },
    steps: 45,
    target: { minPar: 14, maxPar: 30, requireGreedyFailure: true, minCollectBlocks: 2 },
    solve: { maxNodes: 400_000, maxMs: 5_000 },
    candidates: 12,
  },
  difficile: {
    shape: {
      standardCapacity: 4,
      collectorCapacity: 16,
      bottlesPerColor: [3, 3, 3, 3],
      emptyBottles: 6,
    },
    steps: 80,
    target: { minPar: 22, maxPar: 60, requireGreedyFailure: true, minCollectBlocks: 3 },
    solve: { maxNodes: 200_000, maxMs: 3_000, width: 200 },
    candidates: 8,
  },
}

function readArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback)
}

const presetName = readArg('preset', 'moyen')
const preset = PRESETS[presetName]
if (!preset) {
  console.error(`Préréglage inconnu : ${presetName}. Disponibles : ${Object.keys(PRESETS).join(', ')}`)
  process.exit(1)
}

const count = Number.parseInt(readArg('count', '5'), 10)
const seedArg = readArg('seed', '')
const baseSeed = seedArg === '' ? randomSeed() : Number.parseInt(seedArg, 10)
// La palette d'un niveau se limite aux couleurs qu'il emploie : la couleur de
// collecte plus une par famille de bouteilles.
const palette = PALETTE.slice(0, preset.shape.bottlesPerColor.length + 1)
const outDir = join(process.cwd(), 'levels', presetName)

console.log(`Préréglage ${presetName}, ${count} niveaux, graine ${baseSeed}`)
mkdirSync(outDir, { recursive: true })

const accepted: string[] = []
const seenKeys = new Set<string>()
let produced = 0
let attempts = 0

while (produced < count && attempts < count * preset.candidates * 4) {
  const seed = (baseSeed + attempts) >>> 0
  attempts += 1

  const start = shuffle(preset.shape, { steps: preset.steps, rng: createRng(seed) })
  if (!start) continue

  // Diversité : deux niveaux identiques à permutation près n'en font qu'un.
  const key = canonicalKey(start)
  if (seenKeys.has(key)) continue

  const cheap = cheapMetrics(start)
  if (cheap.collectBlocks < preset.target.minCollectBlocks) continue

  // Entonnoir : les filtres bon marché d'abord, le solveur en dernier. Une
  // partie gloutonne coûte quelques millisecondes, une recherche complète
  // plusieurs secondes — les enchaîner dans l'autre sens gaspille l'essentiel
  // du temps de génération sur des candidats voués au rejet.
  const greedyFails = !playGreedy(start)
  if (preset.target.requireGreedyFailure && !greedyFails) continue

  const solved = solvedMetrics(start, preset.solve, greedyFails)
  if (!solved) {
    console.warn(`  graine ${seed} : aucune solution trouvée, niveau écarté`)
    continue
  }

  const verdict = scoreAgainst(cheap, solved, preset.target)
  if (!verdict.accepted) continue

  seenKeys.add(key)
  produced += 1

  const id = `${presetName}-${String(produced).padStart(3, '0')}`
  const spec = {
    ...toSpec(start, { id, palette, seed, generator: GENERATOR_VERSION, par: solved.par }),
    parIsOptimal: solved.parIsOptimal,
    metrics: {
      collectBlocks: cheap.collectBlocks,
      collectSurfaced: cheap.collectSurfaced,
      freeSpace: cheap.freeSpace,
      burial: Number(cheap.burial.toFixed(2)),
      greedyFails: solved.greedyFails,
    },
  }

  const problems = validateLevel(spec)
  if (problems.length > 0) {
    console.error(`  ${id} invalide : ${problems.join(', ')}`)
    process.exit(1)
  }

  writeFileSync(join(outDir, `${id}.json`), `${JSON.stringify(spec, null, 2)}\n`)
  accepted.push(
    `  ${id} : par ${solved.par}${solved.parIsOptimal ? '' : ' (borne)'}` +
      `, ${cheap.collectBlocks} blocs de collecte, glouton ${solved.greedyFails ? 'échoue' : 'réussit'}`,
  )
}

console.log(accepted.join('\n'))
console.log(`\n${produced}/${count} niveaux écrits dans levels/${presetName}/ (${attempts} candidats)`)
if (produced < count) process.exitCode = 1
