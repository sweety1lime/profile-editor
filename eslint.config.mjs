import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default defineConfig(
  { ignores: ['**/dist', '**/node_modules', 'apps/web/public'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/userscript/src/**/*.ts'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['api/**/*.ts', 'scripts/**/*.mjs', 'packages/*/scripts/**/*.mjs', '**/*.config.{ts,mjs,js}'],
    languageOptions: { globals: globals.node },
  },
  {
    // сценарий сам живёт в node, но передаёт куски кода в браузер, так что знает и те глобальные
    files: ['scripts/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
)
