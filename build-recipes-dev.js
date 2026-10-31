/**
 * Development: writes public/recipes/<name>/index.html, served by the Vite
 * dev server (see serveStaticRecipes in vite.config.js).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecipePages } from './recipe-pages.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

await buildRecipePages({
  outputDir: path.join(ROOT, 'public', 'recipes'),
  siteUrl: 'http://localhost:5173',
  assets: {
    styles: '/src/styles.css',
    script: '/src/recipe-page.js',
  },
});
