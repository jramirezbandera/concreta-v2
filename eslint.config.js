import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Underscore prefix = intentionally unused (kept for API/signature parity).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // localStorage sólo se toca desde src/lib/storage/seguro.ts: ahí la cuota
  // llena y el modo privado se clasifican y se avisan en vez de tragarse en un
  // catch mudo. Se prohíbe el identificador entero, no sólo setItem: removeItem
  // también lanza y getItem falla en modo privado. Los tests quedan fuera
  // porque siembran y leen el almacén a propósito.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/lib/storage/seguro.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='localStorage']",
          message:
            'localStorage sólo desde src/lib/storage/seguro.ts (leerClave / escribirClave / escribirClaveDiferida / borrarClave): así la cuota llena y el modo privado se avisan en vez de perder el trabajo en silencio.',
        },
      ],
    },
  },
])
