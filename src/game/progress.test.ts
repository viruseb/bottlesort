import { describe, expect, it } from 'vitest'
import {
  EMPTY_PROGRESS,
  bestMoves,
  isUnlocked,
  parse,
  record,
  serialize,
  starsFor,
  totalStars,
} from './progress'

describe('barème', () => {
  it('accorde trois étoiles au par ou mieux', () => {
    expect(starsFor(9, 9)).toBe(3)
    // Le par d'un grand niveau n'est qu'une meilleure solution connue : faire
    // mieux est légitime et doit rester la note maximale.
    expect(starsFor(7, 9)).toBe(3)
  })

  it('dégrade au-delà du par', () => {
    expect(starsFor(11, 9)).toBe(2)
    expect(starsFor(12, 9)).toBe(2)
    expect(starsFor(13, 9)).toBe(1)
  })

  it('ne note pas un niveau sans par', () => {
    expect(starsFor(20, undefined)).toBeNull()
  })
})

describe('enregistrement', () => {
  it('retient le meilleur score', () => {
    let progress = record(EMPTY_PROGRESS, 'a', 12)
    progress = record(progress, 'a', 9)
    expect(bestMoves(progress, 'a')).toBe(9)
  })

  it('ignore une performance moins bonne', () => {
    let progress = record(EMPTY_PROGRESS, 'a', 9)
    progress = record(progress, 'a', 15)
    expect(bestMoves(progress, 'a')).toBe(9)
  })

  it('totalise les étoiles des niveaux terminés', () => {
    const levels = [
      { id: 'a', par: 9 },
      { id: 'b', par: 10 },
      { id: 'c', par: 8 },
    ]
    let progress = record(EMPTY_PROGRESS, 'a', 9) // 3
    progress = record(progress, 'b', 13) // 2
    expect(totalStars(progress, levels)).toBe(5)
  })
})

describe('déverrouillage', () => {
  const ids = ['a', 'b', 'c']

  it('ouvre toujours le premier niveau', () => {
    expect(isUnlocked(EMPTY_PROGRESS, ids, 0)).toBe(true)
    expect(isUnlocked(EMPTY_PROGRESS, ids, 1)).toBe(false)
  })

  it('ouvre le suivant une fois le précédent terminé', () => {
    const progress = record(EMPTY_PROGRESS, 'a', 9)
    expect(isUnlocked(progress, ids, 1)).toBe(true)
    expect(isUnlocked(progress, ids, 2)).toBe(false)
  })
})

describe('lecture de la sauvegarde', () => {
  it('fait l\'aller-retour', () => {
    const progress = record(EMPTY_PROGRESS, 'a', 9)
    expect(parse(serialize(progress))).toEqual(progress)
  })

  // La sauvegarde vient du navigateur du joueur : elle peut être absente,
  // tronquée, d'une version antérieure ou trafiquée. Aucun de ces cas ne doit
  // empêcher de jouer.
  it.each([
    ['absente', null],
    ['vide', ''],
    ['JSON invalide', '{oops'],
    ['tableau', '[]'],
    ['version inconnue', '{"version":99,"levels":{"a":{"bestMoves":3}}}'],
    ['niveaux non objet', '{"version":1,"levels":"nope"}'],
  ])('repart de zéro si la sauvegarde est %s', (_label, raw) => {
    expect(parse(raw)).toEqual(EMPTY_PROGRESS)
  })

  it('écarte les entrées aberrantes sans jeter le reste', () => {
    const parsed = parse(
      '{"version":1,"levels":{"a":{"bestMoves":9},"b":{"bestMoves":-1},"c":{"bestMoves":"x"},"d":null}}',
    )
    expect(parsed.levels).toEqual({ a: { bestMoves: 9 } })
  })
})
