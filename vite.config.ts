import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// `base: '/'` because the site is served from the custom-domain root
// (https://knowyourcity.gg/). If it ever moves back to a github.io PROJECT
// page (no custom domain), this must become '/<repo-name>/' again or asset
// URLs 404.
// (`vitest/config` re-exports vite's defineConfig and adds the typed `test` key.)
export default defineConfig({
  base: '/',
  plugins: [react()],
  test: {
    // Don't collect tests from isolated subagent/reviewer worktrees — their full
    // repo copies would otherwise double the local test count. CI is unaffected
    // (clean checkout, no worktrees).
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
  },
})
