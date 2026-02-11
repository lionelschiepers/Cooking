import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECIPES_DIR = path.join(__dirname, '_recipes');
const LAYOUTS_DIR = path.join(__dirname, '_layouts');
const OUTPUT_DIR = path.join(__dirname, 'dist', 'recipes');
const SITE_CONFIG = {
  title: 'Les recettes de Lionel & Ophélie',
  description: 'Découvrez nos délicieuses recettes maison',
  url: 'https://lionelschiepers.github.io',
  baseurl: '/Cooking',
};

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Parse frontmatter from markdown content
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = frontmatterRegex.exec(content);

  if (!match) {
    return { metadata: {}, content: content };
  }

  const frontmatterText = match[1];
  const bodyContent = match[2];

  // Parse YAML-like frontmatter
  const metadata = {};
  const lines = frontmatterText.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Parse arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          value = JSON.parse(value.replace(/'/g, '"'));
        } catch (e) {
          // Keep as string if parsing fails
        }
      }

      metadata[key] = value;
    }
  }

  return { metadata, content: bodyContent };
}

// Read layout template
function readLayout(layoutName) {
  const layoutPath = path.join(LAYOUTS_DIR, `${layoutName}.html`);
  if (!fs.existsSync(layoutPath)) {
    throw new Error(`Layout not found: ${layoutPath}`);
  }
  return fs.readFileSync(layoutPath, 'utf8');
}

// Process Liquid-like template variables
function processTemplate(template, variables) {
  let result = template;

  // Process {{ variable }} syntax
  result = result.replace(/\{\{\s*([^\}]+)\s*\}\}/g, (match, variable) => {
    const keys = variable.trim().split('.');
    let value = variables;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return match; // Keep original if not found
      }
    }

    return value !== undefined ? value : match;
  });

  // Process {{ variable | filter }} syntax (simplified)
  result = result.replace(
    /\{\{\s*([^\}|]+)\s*\|\s*([^\}]+)\s*\}\}/g,
    (match, variable, filter) => {
      const keys = variable.trim().split('.');
      let value = variables;

      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return match;
        }
      }

      if (value === undefined) return match;

      // Handle filters
      const filterName = filter.trim();
      if (filterName === 'relative_url') {
        // Don't duplicate baseurl if value already starts with it
        if (
          typeof value === 'string' &&
          value.startsWith(SITE_CONFIG.baseurl)
        ) {
          return value;
        }
        return `${SITE_CONFIG.baseurl}${value}`;
      } else if (filterName === 'absolute_url') {
        // Don't duplicate baseurl if value already starts with it
        if (
          typeof value === 'string' &&
          value.startsWith(SITE_CONFIG.baseurl)
        ) {
          return `${SITE_CONFIG.url}${value}`;
        }
        return `${SITE_CONFIG.url}${SITE_CONFIG.baseurl}${value}`;
      }

      return value;
    },
  );

  return result;
}

// Generate HTML from markdown recipe
function generateRecipeHtml(mdFilePath, outputDir) {
  const content = fs.readFileSync(mdFilePath, 'utf8');
  const { metadata, content: bodyContent } = parseFrontmatter(content);

  // Read layout template
  const layoutTemplate = readLayout(metadata.layout || 'recipe');

  // Convert markdown to HTML
  const htmlContent = marked.parse(bodyContent.trim());

  // Prepare template variables
  const templateVars = {
    site: SITE_CONFIG,
    page: {
      ...metadata,
      content: htmlContent,
      url: `/recipes/${path.basename(mdFilePath, '.md')}/`,
    },
    content: htmlContent, // For direct {{ content }} access
  };

  // Process template
  let html = processTemplate(layoutTemplate, templateVars);

  // Handle relative_url filter with proper paths
  html = html.replace(
    /"\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}"/g,
    (match, p1) => {
      if (p1.startsWith(SITE_CONFIG.baseurl)) {
        return `"${p1}"`;
      }
      return `"${SITE_CONFIG.baseurl}${p1}"`;
    },
  );
  html = html.replace(
    /"\{\{\s*([^\s]+)\s*\|\s*relative_url\s*\}\}"/g,
    (match, p1) => {
      const keys = p1.split('.');
      let value = templateVars;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return match;
        }
      }
      if (typeof value === 'string' && value.startsWith(SITE_CONFIG.baseurl)) {
        return `"${value}"`;
      }
      return `"${SITE_CONFIG.baseurl}${value}"`;
    },
  );

  // Handle absolute_url filter
  html = html.replace(
    /"\{\{\s*([^\s]+)\s*\|\s*absolute_url\s*\}\}"/g,
    (match, p1) => {
      const keys = p1.split('.');
      let value = templateVars;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return match;
        }
      }
      if (typeof value === 'string' && value.startsWith('http')) {
        return `"${value}"`;
      }
      if (typeof value === 'string' && value.startsWith(SITE_CONFIG.baseurl)) {
        return `"${SITE_CONFIG.url}${value}"`;
      }
      return `"${SITE_CONFIG.url}${SITE_CONFIG.baseurl}${value}"`;
    },
  );

  // Handle simple variable substitutions that might have been missed
  html = html.replace(/\{\{\s*page\.([^\s\}]+)\s*\}\}/g, (match, key) => {
    return templateVars.page[key] !== undefined
      ? templateVars.page[key]
      : match;
  });

  html = html.replace(/\{\{\s*site\.([^\s\}]+)\s*\}\}/g, (match, key) => {
    return templateVars.site[key] !== undefined
      ? templateVars.site[key]
      : match;
  });

  // Remove any remaining template syntax
  html = html.replace(/\{\{[^\}]+\}\}/g, '');

  // Replace CSS path with hashed version from Vite build and make it relative
  const distStylesDir = path.join(__dirname, 'dist', 'assets');
  if (fs.existsSync(distStylesDir)) {
    const stylesFiles = fs
      .readdirSync(distStylesDir)
      .filter((f) => f.startsWith('styles-') && f.endsWith('.css'));
    if (stylesFiles.length > 0) {
      const hashedCssPath = `../../assets/${stylesFiles[0]}`;
      html = html.replace(
        /href="\/Cooking\/src\/styles\.css"/g,
        `href="${hashedCssPath}"`,
      );
      html = html.replace(
        /href="\/Cooking\/favicon\.svg"/g,
        `href="../../favicon.svg"`,
      );
      html = html.replace(
        /href="\/assets\/styles-[a-zA-Z0-9]+\.css"/g,
        `href="${hashedCssPath}"`,
      );
      // Make navigation links relative
      html = html.replace(/href="\/Cooking\/"/g, `href="../../"`);
    }
  }

  // Create output directory for this recipe
  const recipeName = path.basename(mdFilePath, '.md');
  const recipeOutputDir = path.join(outputDir, recipeName);
  if (!fs.existsSync(recipeOutputDir)) {
    fs.mkdirSync(recipeOutputDir, { recursive: true });
  }

  // Write HTML file
  const outputPath = path.join(recipeOutputDir, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf8');

  console.log(`Generated: ${outputPath}`);
  return outputPath;
}

// Main execution
console.log('Generating static recipe pages...\n');

// Get all markdown files from _recipes directory
const mdFiles = fs
  .readdirSync(RECIPES_DIR)
  .filter((file) => file.endsWith('.md'))
  .map((file) => path.join(RECIPES_DIR, file));

if (mdFiles.length === 0) {
  console.log('No recipe files found in _recipes directory.');
  console.log('Run: node generate-recipes.js');
  process.exit(1);
}

// Sort recipes by date DESC (newest first)
mdFiles.sort((a, b) => {
  const contentA = fs.readFileSync(a, 'utf8');
  const contentB = fs.readFileSync(b, 'utf8');
  const dateA = parseFrontmatter(contentA).metadata.date || '0';
  const dateB = parseFrontmatter(contentB).metadata.date || '0';
  return dateB.localeCompare(dateA);
});

let generatedCount = 0;
for (const mdFile of mdFiles) {
  try {
    generateRecipeHtml(mdFile, OUTPUT_DIR);
    generatedCount++;
  } catch (error) {
    console.error(`Error processing ${mdFile}:`, error.message);
  }
}

console.log(`\n✅ Generated ${generatedCount} static recipe pages`);
console.log(`📁 Output directory: ${OUTPUT_DIR}`);
