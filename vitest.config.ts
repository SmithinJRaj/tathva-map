import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so the PWA/SSL plugins are not loaded in tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
