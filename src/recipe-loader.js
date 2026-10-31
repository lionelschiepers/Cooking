import {
  renderMarkdown,
  createLoadingSpinner,
  extractFrontmatter,
  escapeHtml,
} from './markdown-renderer.js';
import { initRecipePage } from './recipe-page.js';

/**
 * Recipe Loader Module
 * Loads a markdown recipe given as ?md=<name>/recipe.md and renders it with
 * the same layout as the static recipe pages.
 */

const SITE_TITLE = 'Les recettes de Lionel & Ophélie';
const LEADING_IMAGE =
  /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)[ \t]*(?:\r?\n|$)/;
const ABSOLUTE_URL = /^([a-z][a-z\d+.-]*:|\/|#)/i;

const FACTS = [
  ['prep_time', 'Préparation'],
  ['cook_time', 'Cuisson'],
  ['servings', 'Portions'],
];

/**
 * Extracts the first image URL from markdown content
 * @param {string} markdown - The markdown content
 * @returns {string|null} The first image URL or null
 */
export function extractFirstImage(markdown) {
  if (!markdown) return null;
  const match = /!\[([^\]]*)\]\(([^)]+)\)/.exec(markdown);
  return match?.[2] ?? null;
}

function setMeta(selector, value) {
  document.querySelector(selector)?.setAttribute('content', value);
}

/**
 * Updates the description and Open Graph meta tags for the loaded recipe
 */
export function updateOpenGraphMeta({ title, description, imageUrl, url }) {
  if (title) setMeta('meta[property="og:title"]', title);
  if (description) {
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:description"]', description);
  }
  if (imageUrl) setMeta('meta[property="og:image"]', imageUrl);
  if (url) setMeta('meta[property="og:url"]', url);
}

/**
 * Gets the recipe path from the URL (?md=recipename/recipe.md)
 * @returns {string|null} The recipe path or null if not found
 */
export function getRecipeFromUrl() {
  const recipePath = new URLSearchParams(globalThis.location.search).get('md');
  return recipePath || null;
}

function cleanRecipePath(recipePath) {
  const cleanPath = String(recipePath ?? '').replaceAll(
    /[^a-zA-Z0-9-_./]/g,
    '',
  );
  if (!cleanPath.endsWith('/recipe.md') || cleanPath.includes('..')) {
    throw new Error(
      'L’adresse de la recette n’est pas valide. Elle doit se terminer par nom-de-la-recette/recipe.md.',
    );
  }
  return cleanPath;
}

/**
 * Loads a markdown recipe file
 * @param {string} recipePath - The recipe path (e.g., "tiramisu/recipe.md")
 * @returns {Promise<string>} The markdown content
 */
export async function loadRecipeFile(recipePath) {
  const cleanPath = cleanRecipePath(recipePath);
  const recipeName = cleanPath.replace(/\/recipe\.md$/, '');

  let response;
  try {
    response = await fetch(cleanPath);
  } catch {
    throw new Error(
      'Impossible de charger la recette. Vérifiez votre connexion internet puis réessayez.',
    );
  }

  const isHtml = response.headers.get('content-type')?.includes('text/html');
  if (response.status === 404 || (response.ok && isHtml)) {
    throw new Error(`La recette « ${recipeName} » est introuvable.`);
  }
  if (!response.ok) {
    throw new Error(
      `Impossible de charger la recette (erreur ${response.status}). Réessayez dans quelques minutes.`,
    );
  }
  return response.text();
}

function titleFromPath(recipePath) {
  const name =
    recipePath
      .replace(/\/recipe\.md$/, '')
      .split('/')
      .pop() ?? '';
  const words = name.replaceAll('-', ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Recette';
}

function factsHtml(metadata) {
  const facts = FACTS.filter(([key]) => metadata[key]);
  if (!facts.length) return '';
  return `<dl class="recipe-facts">${facts
    .map(
      ([key, label]) =>
        `<div><dt>${label}</dt><dd>${escapeHtml(metadata[key])}</dd></div>`,
    )
    .join('')}</dl>`;
}

/**
 * Renders a recipe to a container element
 * @param {string} markdown - The markdown content
 * @param {HTMLElement} container - The container element to render into
 * @param {string} [recipePath] - The ?md= path, used to resolve relative images
 */
export async function renderRecipeToContainer(
  markdown,
  container,
  recipePath = getRecipeFromUrl() ?? '',
) {
  if (!container) {
    console.error('Container element not found');
    return;
  }

  const { metadata, content } = extractFrontmatter(markdown);
  const folderUrl = new URL(
    cleanRecipePath(recipePath).replace(/recipe\.md$/, ''),
    globalThis.location.href,
  );
  const resolve = (href) =>
    ABSOLUTE_URL.test(href) ? href : new URL(href, folderUrl).href;

  const title = metadata.title || titleFromPath(recipePath);
  let body = content.trim();
  let hero = null;
  const lead = LEADING_IMAGE.exec(body);
  if (lead) {
    hero = { alt: lead[1] || title, src: resolve(lead[2]) };
    body = body.slice(lead[0].length).trim();
  }

  const bodyHtml = renderMarkdown(body, { baseUrl: folderUrl }).trim();
  const bodySection = bodyHtml
    ? `<div id="recipe-content" class="recipe-body prose">${bodyHtml}</div>`
    : '';

  container.innerHTML = `
    <div class="recipe-hero">
      <div class="recipe-head">
        <h1 class="recipe-title">${escapeHtml(title)}</h1>
        ${metadata.description ? `<p class="recipe-lede">${escapeHtml(metadata.description)}</p>` : ''}
        ${factsHtml(metadata)}
        <div class="recipe-actions" data-recipe-actions></div>
      </div>
      ${hero ? `<figure class="recipe-photo"><img src="${escapeHtml(hero.src)}" alt="${escapeHtml(hero.alt)}" fetchpriority="high" decoding="async"></figure>` : ''}
    </div>
    ${bodySection}`;
  container.removeAttribute('aria-busy');

  document.title = `${title} - ${SITE_TITLE}`;
  updateOpenGraphMeta({
    title: `${title} - ${SITE_TITLE}`,
    description: metadata.description || `Découvrez notre recette : ${title}.`,
    imageUrl: hero?.src ?? null,
    url: globalThis.location.href,
  });

  initRecipePage({ key: cleanRecipePath(recipePath) });
}

/**
 * Shows loading state in a container
 * @param {HTMLElement} container - The container element
 */
export function showLoading(container) {
  if (container) {
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = createLoadingSpinner();
  }
}

/**
 * Shows error state in a container
 * @param {HTMLElement} container - The container element
 * @param {string} message - What went wrong and how to fix it
 */
export function showError(container, message) {
  if (!container) return;
  container.removeAttribute('aria-busy');
  container.innerHTML = `
    <div class="notice" role="alert">
      <h1 class="recipe-title">Recette indisponible</h1>
      <p>${escapeHtml(message)}</p>
      <div class="notice-actions">
        <a class="button" href="../">Voir toutes les recettes</a>
      </div>
    </div>`;
  document.title = `Recette indisponible - ${SITE_TITLE}`;
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
      'Aucune recette n’est indiquée dans l’adresse. Choisissez-en une dans la liste.',
    );
    return;
  }

  showLoading(container);

  try {
    const markdown = await loadRecipeFile(recipeFile);
    await renderRecipeToContainer(markdown, container, recipeFile);
  } catch (error) {
    console.error('Error loading recipe:', error);
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
