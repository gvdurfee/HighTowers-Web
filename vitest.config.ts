import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.mjs'],
  },
  resolve: {
    alias: {
      '@content-pack/core': path.resolve(__dirname, 'shared/content-pack-core'),
    },
  },
})
