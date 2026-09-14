import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Собираем один content.js, дальше scripts/pack.mjs делает из него юзерскрипт и расширение
export default defineConfig({
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('./src/main.ts', import.meta.url)),
      formats: ['iife'],
      name: 'profileEditorUpload',
      fileName: () => 'content.js',
    },
  },
})
