import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // scripts/tmp holds untracked one-off scratch scripts — linting them makes
  // `npm run lint` fail locally on files CI never sees.
  { ignores: ['dist', 'data', 'node_modules', 'scripts/tmp'] },
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
      // bug-report's defang() inserts zero-width spaces (U+200B) to neutralize
      // @mentions / Markdown — in string literals (skipped by default) — and its
      // test asserts that output with a regex literal that embeds the same ZWSP.
      // Allow ZWSP in regexes too so the test passes, while the rule still flags
      // *accidental* irregular whitespace in code.
      'no-irregular-whitespace': [
        'error',
        { skipStrings: true, skipRegExps: true },
      ],
    },
  },
  // The Worker runs on the Cloudflare/service-worker runtime, so it sees the
  // fetch-platform globals (fetch, Response, URL, TextEncoder, …) on top of Node.
  // serviceworker — not browser — on purpose: a Worker has no window/document,
  // so this still flags an accidental DOM reference as an undefined global.
  {
    files: ['worker/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
)
