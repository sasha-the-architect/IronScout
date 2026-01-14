import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],

    // DB tests need longer timeout for connection/queries
    testTimeout: 30000,

    // Run tests sequentially since they may share DB connection
    sequence: {
      concurrent: false,
    },
  },
})
