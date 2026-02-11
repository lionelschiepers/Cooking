import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECIPES_DIR = path.join(__dirname, 'recipes');

// Get all recipe folders
const recipeFolders = fs.readdirSync(RECIPES_DIR).filter((folder) => {
  const folderPath = path.join(RECIPES_DIR, folder);
  return (
    fs.statSync(folderPath).isDirectory() &&
    fs.existsSync(path.join(folderPath, 'recipe.md'))
  );
});

console.log(`Found ${recipeFolders.length} recipe folders\n`);

let fixedCount = 0;

for (const folder of recipeFolders) {
  const recipeMdPath = path.join(RECIPES_DIR, folder, 'recipe.md');
  let content = fs.readFileSync(recipeMdPath, 'utf8');

  // Pattern: ./folder-name/file-name.webp -> ./file-name.webp
  // Replace ./folder-name/ with ./
  const originalContent = content;
  content = content.replace(new RegExp(`\\.\\/${folder}/`, 'g'), './');

  if (content !== originalContent) {
    fs.writeFileSync(recipeMdPath, content, 'utf8');
    console.log(`✅ Fixed: ${recipeMdPath}`);
    fixedCount++;
  }
}

console.log(`\n✅ Fixed ${fixedCount} recipe files`);
console.log('\nNow run: node generate-recipes.js && node build-recipes-dev.js');
