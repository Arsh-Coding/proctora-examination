import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'public', 'scripts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      /**
       * Kept as warnings rather than errors.
       *
       * `set-state-in-effect` fires wherever an effect kicks off an async loader
       * that later sets state (every data-fetching page here) and wherever an
       * external subscription object is stored in state (the Socket.io hooks).
       * Both are intentional and correct; the rule cannot see that the writes
       * happen in promise callbacks.
       *
       * `only-export-components` fires on the two context modules that export a
       * provider plus its companion hook (`useAuth`, `useToast`). That only
       * affects hot-reload granularity, not runtime behaviour.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
])
