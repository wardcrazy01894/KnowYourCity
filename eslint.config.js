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
      // --- Staged from the eslint-plugin-react-hooks v5 → v7 upgrade ---
      // v7's `recommended` adds two rules that flag deliberate, commented,
      // test-covered patterns in this codebase. They are set to `warn` (NOT
      // off) so the signal stays visible while the upgrade lands, rather than
      // bundling behavior-risk refactors of a live game into a dep bump.
      //
      // `refs` — the "latest ref" idiom (MapGuess's onGuessRef/lockedRef keep
      // the map click handler from re-binding every render) and App's
      // sessionModeRef, which is *read during render* to freeze the mounted
      // session's mode across city-local midnight. The latter can't move into
      // an effect without restructuring how `mode` is computed.
      //
      // `set-state-in-effect` — the reset-on-input-change pattern
      // (`setToday(null)` / `setLocations(null)` before an async refetch).
      //
      // Fixing these properly is a follow-up, and per CLAUDE.md must be
      // test-first since it changes runtime behavior.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
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
