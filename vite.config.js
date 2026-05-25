import { defineConfig } from 'vite';

// Deployed to GitHub Pages at https://teegly.github.io/crafty-dnd/
// The repo name is the sub-path, so base must match it or assets 404.
// If this ever moves to a root domain (e.g. dnd.craftingchaosgaming.com),
// change base back to '/'.
export default defineConfig({
  base: '/crafty-dnd/',
});
