import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', '__tests__/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],

    // Longer timeout for integration tests hitting real DB
    testTimeout: 30000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/node_modules/**',
        '**/dist/**',
        'src/test-setup.ts',
      ],
    },
  },
})
