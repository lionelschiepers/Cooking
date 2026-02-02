/**
 * Main Module
 * Handles the home page functionality including recipe grid, search, and filtering
 */

// State management
let allRecipes = [];
let filteredRecipes = [];

/**
 * Fetches recipes from the recipes.json file
 * @returns {Promise<Array>} Array of recipe objects
 */
async function fetchRecipes() {
  try {
    const response = await fetch('./recipes.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch recipes: ${response.status} ${response.statusText}`);
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
  
  // Create tags HTML
  const tagsHtml = tags && tags.length > 0 
    ? tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')
    : '';
  
  return `
    <article class="recipe-card bg-white rounded-lg shadow-md overflow-hidden cursor-pointer" 
             onclick="window.open('${linkUrl}', '${linkTarget}')">
      <div class="relative h-48 overflow-hidden">
         <img src="${image}" 
              alt="${title}" 
              class="w-full h-full object-cover object-center"
              onerror="this.src='https://placehold.co/400x300/8B4513/white?text=No+Image'">
        <div class="absolute top-2 right-2">
          ${getTypeIcon(type)}
        </div>
      </div>
      <div class="p-4">
        <h3 class="text-lg font-semibold text-gray-900 mb-2 line-clamp-1">${title}</h3>
        <p class="text-sm text-gray-600 mb-3 line-clamp-2">${description || ''}</p>
        <div class="flex flex-wrap gap-1 mb-2">
          ${tagsHtml}
        </div>
        ${date ? `<p class="text-xs text-gray-500">${date}</p>` : ''}
      </div>
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
    'youtube': '<span class="bg-red-600 text-white px-2 py-1 rounded text-xs font-medium">YouTube</span>',
    'external': '<span class="bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">Web</span>',
    'markdown': '<span class="bg-green-600 text-white px-2 py-1 rounded text-xs font-medium">Recette</span>'
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
    gridContainer.innerHTML = `
      <div class="col-span-full text-center py-12">
        <p class="text-gray-600 text-lg">No recipes found matching your criteria.</p>
      </div>
    `;
    if (resultsCount) {
      resultsCount.textContent = '0 recipes found';
    }
    return;
  }
  
  const recipesHtml = recipes.map(recipe => createRecipeCard(recipe)).join('');
  gridContainer.innerHTML = recipesHtml;
  
  if (resultsCount) {
    resultsCount.textContent = `${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} found`;
  }
}

/**
 * Shows an error message
 * @param {string} message - The error message to display
 */
function showError(message) {
  const gridContainer = document.getElementById('recipe-grid');
  if (gridContainer) {
    gridContainer.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="error-message inline-block">
          <p class="text-red-600">${message}</p>
        </div>
      </div>
    `;
  }
}

/**
 * Shows a loading state
 */
function showLoading() {
  const gridContainer = document.getElementById('recipe-grid');
  if (gridContainer) {
    gridContainer.innerHTML = `
      <div class="col-span-full flex justify-center py-12">
        <div class="loading-spinner"></div>
      </div>
    `;
  }
}

/**
 * Filters recipes based on search query and selected tags
 * @param {string} searchQuery - The search query
 * @param {string} selectedTag - The selected tag
 * @returns {Array} Filtered array of recipes
 */
function filterRecipes(searchQuery, selectedTag) {
  return allRecipes.filter(recipe => {
    // Text search
    const matchesSearch = !searchQuery || 
      recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (recipe.description && recipe.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (recipe.tags && recipe.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
    
    // Tag filter
    const matchesTag = !selectedTag || 
      (recipe.tags && recipe.tags.includes(selectedTag));
    
    return matchesSearch && matchesTag;
  });
}

/**
 * Gets unique tags from all recipes
 * @returns {Array} Array of unique tags
 */
function getUniqueTags() {
  const tagsSet = new Set();
  allRecipes.forEach(recipe => {
    if (recipe.tags) {
      recipe.tags.forEach(tag => tagsSet.add(tag));
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
  tags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
    tagSelect.appendChild(option);
  });
}

/**
 * Handles search input changes
 */
function handleSearch() {
  const searchInput = document.getElementById('search-input');
  const tagSelect = document.getElementById('tag-filter');
  
  const searchQuery = searchInput ? searchInput.value.trim() : '';
  const selectedTag = tagSelect ? tagSelect.value : '';
  
  filteredRecipes = filterRecipes(searchQuery, selectedTag);
  renderRecipeGrid(filteredRecipes);
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
  filteredRecipes = [...allRecipes];
  
  // Populate tag filter
  populateTagFilter();
  
  // Render recipes
  renderRecipeGrid(filteredRecipes);
  
  // Setup event listeners
  setupEventListeners();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
