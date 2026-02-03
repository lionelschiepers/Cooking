/**
 * Main Module
 * Handles the home page functionality including recipe grid, search, and filtering
 */

// State management
let allRecipes = [];
let filteredRecipes = [];
let currentSort = 'date-desc';

/**
 * Fetches recipes from the recipes.json file
 * @returns {Promise<Array>} Array of recipe objects
 */
async function fetchRecipes() {
  try {
    const response = await fetch('./recipes.json');
    if (!response.ok) {
      throw new Error(
        `Failed to fetch recipes: ${response.status} ${response.statusText}`,
      );
    }
    const data = await response.json();
    return data.recipes || [];
  } catch (error) {
    console.error('Error fetching recipes:', error);
    showError('Failed to load recipes. Please try again later.');
    return [];
  }
}

/**
 * Creates a recipe card HTML element
 * @param {Object} recipe - The recipe object
 * @returns {string} HTML string for the recipe card
 */
function createRecipeCard(recipe) {
  const { id, title, type, path, url, image, tags, description, date } = recipe;

  // Determine the link URL and target based on type
  let linkUrl, linkTarget;
  if (type === 'youtube' || type === 'external') {
    linkUrl = url;
    linkTarget = '_blank';
  } else {
    linkUrl = path;
    linkTarget = '_self';
  }

  // Create tags HTML with proper ARIA labels
  const tagsHtml =
    tags && tags.length > 0
      ? tags
          .slice(0, 3)
          .map((tag) => `<span class="tag" role="listitem">${tag}</span>`)
          .join('')
      : '';

  // Determine external link attributes
  const externalAttrs =
    linkTarget === '_blank' ? 'rel="noopener noreferrer"' : '';

  return `
    <article class="recipe-card bg-white rounded-lg shadow-md overflow-hidden cursor-pointer group"
             role="article"
             aria-labelledby="recipe-title-${id}">
      <a href="${linkUrl}"
         target="${linkTarget}"
         ${externalAttrs}
         class="block no-underline text-inherit focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-inset"
         aria-label="${title} - ${type === 'youtube' ? 'Ouvrir la vidéo YouTube' : type === 'external' ? 'Ouvrir la recette externe' : 'Voir la recette'}">
        <div class="relative h-48 overflow-hidden">
          <img src="${image}"
               alt=""
               width="400"
               height="300"
               loading="lazy"
               decoding="async"
               class="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
               onerror="this.src='https://placehold.co/400x300/8B4513/white?text=No+Image'">
          <div class="absolute top-2 right-2">
            ${getTypeIcon(type)}
          </div>
        </div>
        <div class="p-4">
          <h3 id="recipe-title-${id}" class="text-lg font-semibold text-gray-900 mb-2 line-clamp-1 group-hover:text-amber-700 transition-colors">${title}</h3>
          <p class="text-sm text-gray-600 mb-3 line-clamp-2">${description || ''}</p>
          <div class="flex flex-wrap gap-1 mb-2" role="list" aria-label="Tags de la recette">
            ${tagsHtml}
          </div>
          ${date ? `<p class="text-xs text-gray-500" aria-label="Date de publication: ${date}">${date}</p>` : ''}
        </div>
      </a>
    </article>
  `;
}

/**
 * Gets an icon HTML for the recipe type
 * @param {string} type - The recipe type
 * @returns {string} HTML string for the icon
 */
function getTypeIcon(type) {
  const icons = {
    youtube:
      '<span class="bg-red-600 text-white px-2 py-1 rounded text-xs font-medium">YouTube</span>',
    external:
      '<span class="bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">Web</span>',
    markdown:
      '<span class="bg-green-600 text-white px-2 py-1 rounded text-xs font-medium">Recette</span>',
  };
  return icons[type] || '';
}

/**
 * Renders the recipe grid
 * @param {Array} recipes - Array of recipe objects to render
 */
function renderRecipeGrid(recipes) {
  const gridContainer = document.getElementById('recipe-grid');
  const resultsCount = document.getElementById('results-count');

  if (!gridContainer) return;

  if (recipes.length === 0) {
    const searchInput = document.getElementById('search-input');
    const tagSelect = document.getElementById('tag-filter');
    const searchValue = searchInput ? searchInput.value.trim() : '';
    const tagValue = tagSelect ? tagSelect.value : '';

    let suggestionHtml = '';
    if (searchValue || tagValue) {
      const allTags = getUniqueTags();
      const randomTags = allTags.sort(() => 0.5 - Math.random()).slice(0, 3);
      suggestionHtml = `
        <div class="mt-6">
          <p class="text-gray-600 mb-3">Essayez avec :</p>
          <div class="flex flex-wrap justify-center gap-2">
            ${randomTags
              .map(
                (tag) => `
              <button onclick="clearFiltersAndSelectTag('${tag}')" 
                      class="px-4 py-2 bg-amber-100 text-amber-800 rounded-full text-sm font-medium hover:bg-amber-200 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2">
                ${tag}
              </button>
            `,
              )
              .join('')}
            <button onclick="clearAllFilters()" 
                    class="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">
              Voir toutes les recettes
            </button>
          </div>
        </div>
      `;
    }

    gridContainer.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center py-16 px-4" role="status" aria-live="polite">
        <div class="text-6xl mb-4">🔍</div>
        <h3 class="text-xl font-semibold text-gray-800 mb-2">Aucune recette trouvée</h3>
        <p class="text-gray-600 text-center max-w-md mb-4">
          ${
            searchValue || tagValue
              ? 'Aucune recette ne correspond à vos critères de recherche.'
              : "Il n'y a pas encore de recettes disponibles."
          }
        </p>
        ${suggestionHtml}
      </div>
    `;
    if (resultsCount) {
      resultsCount.textContent = '0 recette trouvée';
    }
    return;
  }

  const recipesHtml = recipes
    .map((recipe) => createRecipeCard(recipe))
    .join('');
  gridContainer.innerHTML = recipesHtml;

  if (resultsCount) {
    const countText = `${recipes.length} recette${recipes.length !== 1 ? 's' : ''} trouvée${recipes.length !== 1 ? 's' : ''}`;
    resultsCount.textContent = countText;
    resultsCount.setAttribute('aria-live', 'polite');
  }
}

/**
 * Clears all filters and selects a specific tag
 * @param {string} tag - The tag to select
 */
function clearFiltersAndSelectTag(tag) {
  const searchInput = document.getElementById('search-input');
  const tagSelect = document.getElementById('tag-filter');

  if (searchInput) searchInput.value = '';
  if (tagSelect) tagSelect.value = tag;

  handleSearch();
}

/**
 * Clears all filters and shows all recipes
 */
function clearAllFilters() {
  const searchInput = document.getElementById('search-input');
  const tagSelect = document.getElementById('tag-filter');

  if (searchInput) searchInput.value = '';
  if (tagSelect) tagSelect.value = '';

  handleSearch();
}

/**
 * Shows an error message
 * @param {string} message - The error message to display
 */
function showError(message) {
  const gridContainer = document.getElementById('recipe-grid');
  const resultsCount = document.getElementById('results-count');
  if (gridContainer) {
    gridContainer.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center py-16 px-4" role="alert" aria-live="assertive">
        <div class="text-6xl mb-4">⚠️</div>
        <div class="error-message">
          <p class="text-red-700 font-medium">${message}</p>
        </div>
        <button onclick="location.reload()" 
                class="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">
          Réessayer
        </button>
      </div>
    `;
  }
  if (resultsCount) {
    resultsCount.textContent = 'Erreur de chargement';
  }
}

/**
 * Creates a skeleton card HTML
 * @returns {string} HTML string for skeleton card
 */
function createSkeletonCard() {
  return `
    <article class="recipe-card skeleton-card bg-white rounded-lg shadow-md overflow-hidden" aria-hidden="true">
      <div class="skeleton-image h-48 bg-gray-200 animate-pulse"></div>
      <div class="p-4 space-y-3">
        <div class="skeleton-title h-6 bg-gray-200 rounded animate-pulse w-3/4"></div>
        <div class="skeleton-description h-4 bg-gray-200 rounded animate-pulse w-full"></div>
        <div class="skeleton-description h-4 bg-gray-200 rounded animate-pulse w-5/6"></div>
        <div class="flex gap-1 mt-3">
          <div class="skeleton-tag h-5 bg-gray-200 rounded-full w-16 animate-pulse"></div>
          <div class="skeleton-tag h-5 bg-gray-200 rounded-full w-20 animate-pulse"></div>
        </div>
      </div>
    </article>
  `;
}

/**
 * Shows a loading state with skeleton cards
 */
function showLoading() {
  const gridContainer = document.getElementById('recipe-grid');
  const resultsCount = document.getElementById('results-count');
  if (gridContainer) {
    // Show 8 skeleton cards to fill the grid
    const skeletonCards = Array(8)
      .fill(null)
      .map(() => createSkeletonCard())
      .join('');
    gridContainer.innerHTML = skeletonCards;
  }
  if (resultsCount) {
    resultsCount.textContent = 'Chargement des recettes...';
    resultsCount.setAttribute('aria-live', 'polite');
  }
}

/**
 * Normalizes a string by removing accents/diacritics
 * @param {string} str - The string to normalize
 * @returns {string} The normalized string without accents
 */
function normalizeString(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filters recipes based on search query and selected tags
 * @param {string} searchQuery - The search query
 * @param {string} selectedTag - The selected tag
 * @returns {Array} Filtered array of recipes
 */
function filterRecipes(searchQuery, selectedTag) {
  const normalizedQuery = searchQuery
    ? normalizeString(searchQuery.toLowerCase())
    : '';

  return allRecipes.filter((recipe) => {
    // Text search (accent-insensitive)
    const matchesSearch =
      !searchQuery ||
      normalizeString(recipe.title.toLowerCase()).includes(normalizedQuery) ||
      (recipe.description &&
        normalizeString(recipe.description.toLowerCase()).includes(
          normalizedQuery,
        )) ||
      (recipe.tags &&
        recipe.tags.some((tag) =>
          normalizeString(tag.toLowerCase()).includes(normalizedQuery),
        ));

    // Tag filter
    const matchesTag =
      !selectedTag || (recipe.tags && recipe.tags.includes(selectedTag));

    return matchesSearch && matchesTag;
  });
}

/**
 * Sorts recipes based on the specified sort option
 * @param {Array} recipes - Array of recipe objects to sort
 * @param {string} sortOption - The sort option (date-desc, date-asc, title-asc, title-desc)
 * @returns {Array} Sorted array of recipes
 */
function sortRecipes(recipes, sortOption) {
  const sorted = [...recipes];

  switch (sortOption) {
    case 'date-desc':
      return sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    case 'date-asc':
      return sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
    case 'title-asc':
      return sorted.sort((a, b) =>
        a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }),
      );
    case 'title-desc':
      return sorted.sort((a, b) =>
        b.title.localeCompare(a.title, 'fr', { sensitivity: 'base' }),
      );
    default:
      return sorted;
  }
}

/**
 * Gets unique tags from all recipes
 * @returns {Array} Array of unique tags
 */
function getUniqueTags() {
  const tagsSet = new Set();
  allRecipes.forEach((recipe) => {
    if (recipe.tags) {
      recipe.tags.forEach((tag) => tagsSet.add(tag));
    }
  });
  return Array.from(tagsSet).sort();
}

/**
 * Populates the tag filter dropdown
 */
function populateTagFilter() {
  const tagSelect = document.getElementById('tag-filter');
  if (!tagSelect) return;

  const tags = getUniqueTags();

  // Clear existing options except the first one
  while (tagSelect.options.length > 1) {
    tagSelect.remove(1);
  }

  // Add tag options
  tags.forEach((tag) => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
    tagSelect.appendChild(option);
  });
}

/**
 * Handles search input changes and applies current sort
 */
function handleSearch() {
  const searchInput = document.getElementById('search-input');
  const tagSelect = document.getElementById('tag-filter');
  const sortSelect = document.getElementById('sort-select');

  const searchQuery = searchInput ? searchInput.value.trim() : '';
  const selectedTag = tagSelect ? tagSelect.value : '';
  const sortOption = sortSelect ? sortSelect.value : currentSort;

  const filtered = filterRecipes(searchQuery, selectedTag);
  filteredRecipes = sortRecipes(filtered, sortOption);
  renderRecipeGrid(filteredRecipes);
}

/**
 * Handles sort selection changes
 */
function handleSort() {
  const sortSelect = document.getElementById('sort-select');
  if (!sortSelect) return;

  currentSort = sortSelect.value;
  handleSearch();
}

/**
 * Sets up event listeners
 */
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(handleSearch, 300));
  }

  // Tag filter
  const tagSelect = document.getElementById('tag-filter');
  if (tagSelect) {
    tagSelect.addEventListener('change', handleSearch);
  }

  // Sort dropdown
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', handleSort);
  }
}

/**
 * Debounce function to limit how often a function can fire
 * @param {Function} func - The function to debounce
 * @param {number} wait - The delay in milliseconds
 * @returns {Function} The debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Initializes the home page
 */
async function init() {
  showLoading();

  // Fetch recipes
  allRecipes = await fetchRecipes();

  // Get initial sort option from dropdown
  const sortSelect = document.getElementById('sort-select');
  currentSort = sortSelect ? sortSelect.value : 'date-desc';

  // Apply initial sort
  filteredRecipes = sortRecipes([...allRecipes], currentSort);

  // Populate tag filter
  populateTagFilter();

  // Render recipes
  renderRecipeGrid(filteredRecipes);

  // Setup event listeners
  setupEventListeners();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Attach functions to window object for inline onclick handlers
  window.clearFiltersAndSelectTag = clearFiltersAndSelectTag;
  window.clearAllFilters = clearAllFilters;

  init();
});
