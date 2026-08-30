import { shuffle, toSpec, type LevelShape } from '../engine/generator'
import { cheapMetrics } from '../engine/quality'
import { createRng, randomSeed } from '../engine/rng'
import type { LevelSpec } from '../engine/types'

const GENERATOR_VERSION = '1.0.0'
const PALETTE = ['orange', 'green', 'blue', 'dark']

const SHAPE: LevelShape = {
  standardCapacity: 4,
  collectorCapacity: 8,
  bottlesPerColor: [2, 2, 2],
  emptyBottles: 4,
}

/**
 * Génération à la demande, dans le navigateur (§7.5 des règles).
 *
 * On embarque le générateur, **pas** le pipeline complet : la marche arrière
 * garantit à elle seule la solvabilité, mais faire noter les candidats par le
 * solveur prendrait des secondes. On se contente donc des critères bon marché,
 * et le `par` reste inconnu — un niveau aléatoire n'a pas la difficulté
 * calibrée d'un niveau de campagne, et l'interface doit le dire.
 */
export function generateLevel(seed = randomSeed(), candidates = 6): LevelSpec | null {
  let best: { spec: LevelSpec; score: number } | undefined

  for (let attempt = 0; attempt < candidates; attempt += 1) {
    const candidateSeed = (seed + attempt) >>> 0
    const state = shuffle(SHAPE, { steps: 45, rng: createRng(candidateSeed) })
    if (!state) continue

    // Le levier qui décide de l'intérêt d'un niveau : la couleur de collecte
    // éparpillée et enterrée, plutôt que posée à plat au fond des bouteilles.
    const metrics = cheapMetrics(state)
    const score = metrics.collectBlocks * 2 + metrics.burial

    if (!best || score > best.score) {
      best = {
        score,
        spec: toSpec(state, {
          id: `aleatoire-${candidateSeed}`,
          palette: PALETTE,
          seed: candidateSeed,
          generator: GENERATOR_VERSION,
        }),
      }
    }
  }

  return best?.spec ?? null
}
