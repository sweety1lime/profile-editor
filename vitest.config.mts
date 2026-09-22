import { defineConfig } from 'vitest/config'

// Два набора: чистая логика из packages считается в node, код сайта — в jsdom,
// потому что ему нужны DOM, IndexedDB и таймеры браузера
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          include: ['packages/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['apps/web/src/test/setup.ts'],
        },
      },
    ],
  },
})
