import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      './data/geo-lookup.json': './src/data/geo-lookup.json',
    },
  },
})
