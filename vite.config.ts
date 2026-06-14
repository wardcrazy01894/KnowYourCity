import { execSync } from 'child_process'
import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// `base: '/'` because the site is served from the custom-domain root
// (https://knowyourcity.gg/). If it ever moves back to a github.io PROJECT
// page (no custom domain), this must become '/<repo-name>/' again or asset
// URLs 404.
// (`vitest/config` re-exports vite's defineConfig and adds the typed `test` key.)

function getBuildHash(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

const BUILD_HASH = getBuildHash()

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    {
      // Emit /version.json so the client can detect a new deploy on tab focus.
      name: 'version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ hash: BUILD_HASH }),
        })
      },
    },
  ],
  define: {
    // Replaced at build time; lets the client compare against /version.json.
    'import.meta.env.VITE_BUILD_HASH': JSON.stringify(BUILD_HASH),
  },
  test: {
    // Don't collect tests from isolated subagent/reviewer worktrees — their full
    // repo copies would otherwise double the local test count. CI is unaffected
    // (clean checkout, no worktrees).
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
  },
})
