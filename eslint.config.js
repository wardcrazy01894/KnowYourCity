import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'data', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Allow intentionally-unused stub params/vars when prefixed with `_`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Plain JS/ESM — the root config file plus the JSDoc-typed Node data-pipeline
  // scripts and Cloudflare Worker. These get the recommended JS ruleset (TS
  // files are covered by the block above); without this they were linted with
  // an empty ruleset.
  {
    extends: [js.configs.recommended],
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Mirror the TS convention: `_`-prefixed args/vars are intentionally unused.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The bug-report defang() deliberately uses zero-width spaces (U+200B) in
      // string AND regex literals to neutralize @mentions / Markdown. Strings are
      // skipped by default; extend the same allowance to regexes so the linter
      // still catches *accidental* irregular whitespace in code.
      'no-irregular-whitespace': [
        'error',
        { skipStrings: true, skipRegExps: true },
      ],
    },
  },
  // The Worker runs on the Cloudflare/service-worker runtime, so it sees the
  // fetch-platform globals (fetch, Response, URL, TextEncoder, …) on top of Node.
  {
    files: ['worker/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.browser },
    },
  },
)
