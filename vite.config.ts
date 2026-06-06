import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: `base` must match the GitHub Pages project path so that
// asset URLs resolve correctly when served from
// https://<user>.github.io/KnowYourLocals/.
// For local dev `base` is harmless; for a future custom domain (apex/CNAME)
// change this back to '/'.
export default defineConfig({
  base: '/KnowYourLocals/',
  plugins: [react()],
})
