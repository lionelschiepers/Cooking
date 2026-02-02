import { 
  renderMarkdownWithProse, 
  createLoadingSpinner, 
  createErrorMessage,
  extractFrontmatter 
} from './markdown-renderer.js';

/**
 * Recipe Loader Module
 * Handles loading and displaying recipe markdown files
 */

/**
 * Gets the recipe filename from the URL query parameter
 * @returns {string|null} The recipe filename or null if not found
 */
export function getRecipeFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const recipeFile = urlParams.get('md');
  return recipeFile ? decodeURIComponent(recipeFile) : null;
}

/**
 * Loads a markdown recipe file
 * @param {string} filename - The recipe filename (e.g., "tiramisu.md")
 * @returns {Promise<string>} The markdown content
 */
export async function loadRecipeFile(filename) {
  if (!filename) {
    throw new Error('No recipe file specified');
  }
  
  // Clean the filename to prevent directory traversal
  const cleanFilename = filename.replace(/[^a-zA-Z0-9-_.]/g, '');
  
  if (!cleanFilename.endsWith('.md')) {
    throw new Error('Invalid file type. Only .md files are allowed');
  }
  
  // Extract recipe name from filename (e.g., "tiramisu.md" -> "tiramisu")
  const recipeName = cleanFilename.replace('.md', '');
  
  // Build the path: recipes/[recipe-name]/recipe.md
  const filePath = `./${recipeName}/recipe.md`;
  
  try {
    const response = await fetch(filePath);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Recipe "${recipeName}" not found`);
      }
      throw new Error(`Failed to load recipe: ${response.status} ${response.statusText}`);
    }
    
    const content = await response.text();
    return content;
  } catch (error) {
    console.error('Error loading recipe:', error);
    throw error;
  }
}

/**
 * Renders a recipe to a container element
 * @param {string} markdown - The markdown content
 * @param {HTMLElement} container - The container element to render into
 */
export function renderRecipeToContainer(markdown, container) {
  if (!container) {
    console.error('Container element not found');
    return;
  }
  
  try {
    // Extract frontmatter if present
    const { metadata, content } = extractFrontmatter(markdown);
    
    // Render the markdown
    const html = renderMarkdownWithProse(content);
    
    // Build the full recipe HTML
    let recipeHtml = '';
    
    // Add title if present in metadata
    if (metadata.title) {
      recipeHtml += `<h1 class="text-3xl font-bold text-gray-900 mb-4">${metadata.title}</h1>`;
    }
    
    // Add metadata info if present
    if (metadata.date || metadata.prep_time || metadata.cook_time) {
      recipeHtml += '<div class="flex flex-wrap gap-4 mb-6 text-sm text-gray-600">';
      
      if (metadata.date) {
        recipeHtml += `<span><strong>Date:</strong> ${metadata.date}</span>`;
      }
      if (metadata.prep_time) {
        recipeHtml += `<span><strong>Prep:</strong> ${metadata.prep_time}</span>`;
      }
      if (metadata.cook_time) {
        recipeHtml += `<span><strong>Cook:</strong> ${metadata.cook_time}</span>`;
      }
      if (metadata.servings) {
        recipeHtml += `<span><strong>Servings:</strong> ${metadata.servings}</span>`;
      }
      
      recipeHtml += '</div>';
    }
    
    // Add the rendered content
    recipeHtml += html;
    
    container.innerHTML = recipeHtml;
    
    // Update page title if metadata has title
    if (metadata.title) {
      document.title = `${metadata.title} - Les recettes de Lionel & Ophélie`;
    }
  } catch (error) {
    console.error('Error rendering recipe:', error);
    container.innerHTML = createErrorMessage(`Error displaying recipe: ${error.message}`);
  }
}

/**
 * Shows loading state in a container
 * @param {HTMLElement} container - The container element
 */
export function showLoading(container) {
  if (container) {
    container.innerHTML = createLoadingSpinner();
  }
}

/**
 * Shows error state in a container
 * @param {HTMLElement} container - The container element
 * @param {string} message - The error message
 */
export function showError(container, message) {
  if (container) {
    container.innerHTML = createErrorMessage(message);
  }
}

/**
 * Main function to load and display a recipe
 * @param {HTMLElement} container - The container element to render into
 */
export async function loadAndDisplayRecipe(container) {
  const recipeFile = getRecipeFromUrl();
  
  if (!recipeFile) {
    showError(container, 'No recipe specified. Please select a recipe from the home page.');
    return;
  }
  
  showLoading(container);
  
  try {
    const markdown = await loadRecipeFile(recipeFile);
    renderRecipeToContainer(markdown, container);
  } catch (error) {
    showError(container, error.message);
  }
}

export default {
  getRecipeFromUrl,
  loadRecipeFile,
  renderRecipeToContainer,
  showLoading,
  showError,
  loadAndDisplayRecipe
};
