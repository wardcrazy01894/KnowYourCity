import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// IMPORTANT: `base` must match the GitHub Pages project path so that
// asset URLs resolve correctly when served from
// https://<user>.github.io/KnowYourLocals/.
// For local dev `base` is harmless; for a future custom domain (apex/CNAME)
// change this back to '/'.
// (`vitest/config` re-exports vite's defineConfig and adds the typed `test` key.)
export default defineConfig({
  base: '/KnowYourLocals/',
  plugins: [react()],
  test: {
    // Don't collect tests from isolated subagent/reviewer worktrees — their full
    // repo copies would otherwise double the local test count. CI is unaffected
    // (clean checkout, no worktrees).
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
  },
})
