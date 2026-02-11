import {
  renderMarkdownWithProse,
  createLoadingSpinner,
  createErrorMessage,
  extractFrontmatter,
} from './markdown-renderer.js';

/**
 * Recipe Loader Module
 * Handles loading and displaying recipe markdown files
 */

/**
 * Extracts the first image URL from markdown content
 * @param {string} markdown - The markdown content
 * @returns {string|null} The first image URL or null
 */
export function extractFirstImage(markdown) {
  if (!markdown) return null;

  // Match markdown image syntax: ![alt](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/;
  const match = imageRegex.exec(markdown);

  if (match && match[2]) {
    return match[2];
  }

  return null;
}

/**
 * Gets the absolute URL for an image
 * @param {string} imageUrl - The image URL (can be relative or absolute)
 * @returns {string|null} The absolute image URL
 */
function getAbsoluteImageUrl(imageUrl) {
  if (!imageUrl) return null;

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  } else if (imageUrl.startsWith('./')) {
    const relativePath = imageUrl.replace(/^\.\//, '');
    const baseUrl = window.location.href.replace(/\/[^\/]*$/, '/');
    return new URL(relativePath, baseUrl).href;
  } else if (imageUrl.startsWith('/')) {
    return new URL(imageUrl, window.location.origin).href;
  } else {
    return new URL(imageUrl, window.location.origin).href;
  }
}

/**
 * Loads an image and gets its dimensions
 * @param {string} imageUrl - The image URL
 * @returns {Promise<{width: number, height: number} | null>} The image dimensions
 */
function getImageDimensions(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = imageUrl;
  });
}

/**
 * Updates Open Graph meta tags for social sharing
 * @param {Object} params - The parameters for OG tags
 * @param {string} params.title - The page title
 * @param {string} params.description - The page description
 * @param {string} params.imageUrl - The image URL
 * @param {string} params.imageBasePath - The base path for resolving relative image URLs
 * @param {string} params.url - The canonical URL
 */
export async function updateOpenGraphMeta({
  title,
  description,
  imageUrl,
  imageBasePath,
  url,
}) {
  // Update og:title
  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle && title) {
    ogTitle.setAttribute('content', title);
  }

  // Update og:description
  let ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription && description) {
    ogDescription.setAttribute('content', description);
  }

  // Update og:image and get dimensions
  let ogImage = document.querySelector('meta[property="og:image"]');
  let ogImageWidth = document.querySelector('meta[property="og:image:width"]');
  let ogImageHeight = document.querySelector(
    'meta[property="og:image:height"]',
  );

  if (ogImage && imageUrl) {
    const absoluteImageUrl = getAbsoluteImageUrl(imageUrl);
    ogImage.setAttribute('content', absoluteImageUrl);

    // Load image to get dimensions
    try {
      const dimensions = await getImageDimensions(absoluteImageUrl);
      if (dimensions) {
        if (ogImageWidth) {
          ogImageWidth.setAttribute('content', dimensions.width.toString());
        }
        if (ogImageHeight) {
          ogImageHeight.setAttribute('content', dimensions.height.toString());
        }
      }
    } catch (error) {
      console.error('Failed to get image dimensions:', error);
    }
  }

  // Update og:url
  let ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl && url) {
    ogUrl.setAttribute('content', url);
  }
}

/**
 * Gets the recipe path from the URL
 * Supports new format (?md=recipename/recipe.md)
 * @returns {string|null} The recipe path or null if not found
 */
export function getRecipeFromUrl() {
  const urlParams = new URLSearchParams(globalThis.location.search);
  const recipePath = urlParams.get('md');
  return recipePath ? decodeURIComponent(recipePath) : null;
}

/**
 * Loads a markdown recipe file
 * @param {string} recipePath - The recipe path (e.g., "tiramisu/recipe.md")
 * @returns {Promise<string>} The markdown content
 */
export async function loadRecipeFile(recipePath) {
  if (!recipePath) {
    throw new Error('No recipe file specified');
  }

  // Clean the path to prevent directory traversal but allow forward slashes
  const cleanPath = recipePath.replaceAll(/[^a-zA-Z0-9-_./]/g, '');

  if (!cleanPath.endsWith('/recipe.md')) {
    throw new Error('Invalid file path. Expected format: recipename/recipe.md');
  }

  // Extract recipe name from path (e.g., "tiramisu/recipe.md" -> "tiramisu")
  const recipeName = cleanPath.replaceAll('/recipe.md', '');

  try {
    const response = await fetch(cleanPath);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Recipe "${recipeName}" not found`);
      }
      throw new Error(
        `Failed to load recipe: ${response.status} ${response.statusText}`,
      );
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
export async function renderRecipeToContainer(markdown, container) {
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
      recipeHtml +=
        '<div class="flex flex-wrap gap-4 mb-6 text-sm text-gray-600">';

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

    // Extract first image and update Open Graph meta tags
    const firstImage = extractFirstImage(content);
    const recipeName = metadata.title || 'Recette';
    const description =
      metadata.description || `Découvrez notre recette de ${recipeName}`;
    const currentUrl = window.location.href;

    // Get recipe folder from URL to resolve relative image paths
    const recipeFile = getRecipeFromUrl();
    const recipeFolder = recipeFile ? recipeFile.replace('/recipe.md', '') : '';

    await updateOpenGraphMeta({
      title: `${recipeName} - Les recettes de Lionel & Ophélie`,
      description: description,
      imageUrl: firstImage,
      imageBasePath: recipeFolder,
      url: currentUrl,
    });
  } catch (error) {
    console.error('Error rendering recipe:', error);
    container.innerHTML = createErrorMessage(
      `Error displaying recipe: ${error.message}`,
    );
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
    showError(
      container,
      'No recipe specified. Please select a recipe from the home page.',
    );
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
  loadAndDisplayRecipe,
  extractFirstImage,
  updateOpenGraphMeta,
};
