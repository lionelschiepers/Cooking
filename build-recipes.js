/**
 * Production: writes dist/recipes/<name>/index.html.
 * Runs after `vite build`, because it links the hashed stylesheet from dist/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecipePages, fileHash } from './recipe-pages.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const DIST_INDEX = path.join(DIST, 'index.html');

if (!fs.existsSync(DIST_INDEX)) {
  console.error('dist/index.html introuvable : lancez `vite build` avant.');
  process.exit(1);
}

const stylesheet = /href="(?:\.\/)?(assets\/[^"]+\.css)"/.exec(
  fs.readFileSync(DIST_INDEX, 'utf8'),
)?.[1];
if (!stylesheet) {
  console.error('Feuille de style introuvable dans dist/index.html.');
  process.exit(1);
}

const scriptSource = path.join(ROOT, 'src', 'recipe-page.js');
fs.copyFileSync(scriptSource, path.join(DIST, 'recipe-page.js'));

await buildRecipePages({
  outputDir: path.join(DIST, 'recipes'),
  siteUrl: 'https://lionelschiepers.github.io/Cooking',
  assets: {
    styles: `../../${stylesheet}`,
    script: `../../recipe-page.js?v=${fileHash(scriptSource)}`,
  },
});
