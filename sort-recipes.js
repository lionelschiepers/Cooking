import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECIPES_JSON_PATH = path.join(__dirname, 'recipes.json');

// Read recipes.json
const recipesData = JSON.parse(fs.readFileSync(RECIPES_JSON_PATH, 'utf8'));

// Sort recipes by date DESC (newest first)
recipesData.recipes.sort((a, b) => {
  return new Date(b.date) - new Date(a.date);
});

// Write back to file
fs.writeFileSync(
  RECIPES_JSON_PATH,
  JSON.stringify(recipesData, null, 2) + '\n',
  'utf8',
);

console.log('✅ recipes.json sorted by date DESC');
console.log('\nFirst 5 recipes:');
recipesData.recipes.slice(0, 5).forEach((r, i) => {
  console.log(`  ${i + 1}. ${r.title} (${r.date})`);
});
