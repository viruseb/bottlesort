/**
 * Mesure du passage à l'échelle du solveur. Répond à la question laissée
 * ouverte au §9 des règles : l'optimalité est-elle atteignable sur un plateau
 * de taille réelle, ou faut-il publier le `par` comme meilleure solution connue ?
 */
import { shuffle } from '../src/engine/generator'
import { createRng } from '../src/engine/rng'
import { solve, solveBeam } from '../src/engine/solver'
import type { LevelShape } from '../src/engine/generator'

const SHAPES: { label: string; shape: LevelShape; steps: number }[] = [
  {
    label: '2 couleurs, 1 bouteille chacune, 4 bouteilles',
    shape: { standardCapacity: 4, collectorCapacity: 8, bottlesPerColor: [1, 1], emptyBottles: 2 },
    steps: 20,
  },
  {
    label: '3 couleurs, 2 bouteilles chacune, 8 bouteilles',
    shape: { standardCapacity: 4, collectorCapacity: 8, bottlesPerColor: [2, 2, 2], emptyBottles: 2 },
    steps: 40,
  },
  {
    label: '4 couleurs, 3 bouteilles chacune, 14 bouteilles',
    shape: {
      standardCapacity: 4,
      collectorCapacity: 16,
      bottlesPerColor: [3, 3, 3, 3],
      emptyBottles: 2,
    },
    steps: 60,
  },
  {
    label: 'taille des captures : 4 couleurs x 4 bouteilles, 30 bouteilles',
    shape: {
      standardCapacity: 4,
      collectorCapacity: 16,
      bottlesPerColor: [4, 4, 4, 4],
      emptyBottles: 14,
    },
    steps: 120,
  },
]

const rng = createRng(20260830)

for (const { label, shape, steps } of SHAPES) {
  const start = shuffle(shape, { steps, rng })
  if (!start) {
    console.log(`${label} : mélange refusé`)
    continue
  }

  const exactBegan = Date.now()
  const exact = solve(start, { maxNodes: 1_000_000, maxMs: 10_000 })
  const exactMs = Date.now() - exactBegan

  const beamBegan = Date.now()
  const beam = solveBeam(start, { width: 300 })
  const beamMs = Date.now() - beamBegan

  console.log(label)
  console.log(
    `  exhaustif : ${exact.moves ? `${exact.moves.length} coups${exact.optimal ? ' (optimal prouvé)' : ''}` : 'échec'}` +
      ` — ${exact.nodes.toLocaleString('fr')} nœuds, ${exactMs} ms`,
  )
  console.log(
    `  faisceau  : ${beam.moves ? `${beam.moves.length} coups (borne supérieure)` : 'échec'}` +
      ` — ${beam.nodes.toLocaleString('fr')} nœuds, ${beamMs} ms\n`,
  )
}
