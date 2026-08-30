import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * La feuille de style est la source de vérité de la palette : le test la lit
 * plutôt que d'en garder une copie, pour qu'aucune divergence ne s'installe.
 */
function readPalette(): Map<string, string> {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
  const palette = new Map<string, string>()
  for (const match of css.matchAll(/--liquid-([a-z]+):\s*(#[0-9a-f]{6})/gi)) {
    palette.set(match[1]!, match[2]!)
  }
  return palette
}

/** Luminance relative WCAG. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

describe('palette', () => {
  it('définit une couleur par famille de liquide', () => {
    const palette = readPalette()
    expect([...palette.keys()].sort()).toEqual(['blue', 'dark', 'green', 'orange', 'white'])
  })

  it('étage les luminances, pour rester lisible sans percevoir la teinte', () => {
    // Le jeu repose entièrement sur la couleur. La palette d'origine plaçait
    // l'orange et le vert — les deux couleurs les plus fréquentes — à des
    // luminances de 0,306 et 0,291 : sous deutéranopie, indiscernables. Un
    // écart minimal les sépare désormais même sans perception de la teinte.
    const values = [...readPalette().values()].map(luminance).sort((a, b) => a - b)

    const gaps = values.slice(1).map((value, index) => value - values[index]!)
    expect(Math.min(...gaps)).toBeGreaterThan(0.08)
  })
})
