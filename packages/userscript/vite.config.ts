import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const header = readFileSync(new URL('./src/header.txt', import.meta.url), 'utf8').replace('{{version}}', pkg.version)

// Собираем один файл .user.js и кладём его в public сайта, оттуда его и ставят
export default defineConfig({
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL('../../apps/web/public', import.meta.url)),
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('./src/main.ts', import.meta.url)),
      formats: ['iife'],
      name: 'profileEditorUpload',
      fileName: () => 'profile-editor.user.js',
    },
    rollupOptions: {
      output: { banner: header },
    },
  },
})
