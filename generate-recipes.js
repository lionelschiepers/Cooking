import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script to generate Jekyll recipe pages from markdown recipe files
 * This creates static HTML pages with proper Open Graph meta tags
 * for better Facebook sharing
 */

const RECIPES_JSON_PATH = path.join(__dirname, 'recipes.json');
const RECIPES_DIR = path.join(__dirname, 'recipes');
const OUTPUT_DIR = path.join(__dirname, '_recipes');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read recipes.json
const recipesData = JSON.parse(fs.readFileSync(RECIPES_JSON_PATH, 'utf8'));

// Extract frontmatter from markdown content
function extractFrontmatter(markdown) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = frontmatterRegex.exec(markdown);

  if (!match) {
    return {
      metadata: {},
      content: markdown,
    };
  }

  const frontmatterText = match[1];
  const content = match[2];

  // Parse simple key: value pairs
  const metadata = {};
  const lines = frontmatterText.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      metadata[key] = value;
    }
  }

  return {
    metadata,
    content,
  };
}

// Extract first image from markdown content
function extractFirstImage(markdown) {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/;
  const match = imageRegex.exec(markdown);

  if (match && match[2]) {
    return match[2];
  }

  return null;
}

// Convert relative image path to absolute URL
function getAbsoluteImageUrl(imagePath, recipeFolder) {
  if (!imagePath) return null;

  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  } else if (imagePath.startsWith('./')) {
    // The path is like ./folder/image.webp
    // Remove leading ./ and prepend the base path with recipe folder
    const relativePath = imagePath.replace(/^\.\//, '');
    // If the path already starts with the recipe folder, use it as-is
    if (relativePath.startsWith(recipeFolder + '/')) {
      return `/recipes/${relativePath}`;
    }
    return `/recipes/${recipeFolder}/${relativePath}`;
  } else if (imagePath.startsWith('/')) {
    return imagePath;
  } else {
    return `/recipes/${recipeFolder}/${imagePath}`;
  }
}

// Generate Jekyll recipe pages
let generatedCount = 0;

for (const recipe of recipesData.recipes) {
  // Only process markdown recipes
  if (recipe.type !== 'markdown') {
    continue;
  }

  // Extract recipe folder from path
  // Supports both old format: "recipes/index.html?md=orzo-vert-maquereau/recipe.md"
  // and new format: "recipes/orzo-vert-maquereau/"
  let recipeFolder;
  const oldPathMatch = recipe.path.match(/\?md=([^/]+)/);
  const newPathMatch = recipe.path.match(/recipes\/([^/]+)\/?$/);

  if (oldPathMatch) {
    recipeFolder = oldPathMatch[1];
  } else if (newPathMatch) {
    recipeFolder = newPathMatch[1];
  } else {
    console.warn(`Could not extract recipe folder from path: ${recipe.path}`);
    continue;
  }
  const recipeMdPath = path.join(RECIPES_DIR, recipeFolder, 'recipe.md');

  // Check if recipe.md exists
  if (!fs.existsSync(recipeMdPath)) {
    console.warn(`Recipe file not found: ${recipeMdPath}`);
    continue;
  }

  // Read recipe markdown
  const markdownContent = fs.readFileSync(recipeMdPath, 'utf8');
  const { metadata, content } = extractFrontmatter(markdownContent);

  // Extract first image
  const firstImage = extractFirstImage(content);
  const imageUrl = getAbsoluteImageUrl(firstImage, recipeFolder);

  // Use recipe.json image as fallback
  const finalImageUrl = imageUrl || recipe.image;

  // Create Jekyll frontmatter
  const jekyllFrontmatter = `---
layout: recipe
title: "${recipe.title}"
description: "${recipe.description}"
image: "${finalImageUrl}"
image_width: 1200
image_height: 630
date: ${recipe.date}
tags: [${recipe.tags.map((tag) => `"${tag}"`).join(', ')}]
---

${content.trim()}
`;

  // Write Jekyll recipe file
  const outputFile = path.join(OUTPUT_DIR, `${recipeFolder}.md`);
  fs.writeFileSync(outputFile, jekyllFrontmatter, 'utf8');

  console.log(`Generated: ${outputFile}`);
  generatedCount++;
}

console.log(`\n✅ Generated ${generatedCount} Jekyll recipe pages`);
console.log(`📁 Output directory: ${OUTPUT_DIR}`);
