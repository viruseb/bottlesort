import { defineConfig } from 'vitest/config'

// Le site est servi depuis https://viruseb.github.io/bottlesort/ : sans cette base,
// les chemins d'assets pointent sur la racine du domaine et la page reste blanche.
export default defineConfig({
  base: '/bottlesort/',
  build: { outDir: 'dist' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
