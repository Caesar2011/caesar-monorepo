import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'e2e/**'],
    onStackTrace: (_, { file }) => {
      return !file.includes('node_modules')
    },
    projects: [
      {
        root: './src',
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
