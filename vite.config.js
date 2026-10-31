import { defineConfig } from 'vite';

// Relative base: the same dist/ works on GitHub Pages (/repo/ subpath), itch.io (zip, iframe) and any static host.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 800 },
});
