import { Marked } from 'marked';

/**
 * Markdown Renderer Module
 * Centralized markdown rendering logic for the recipe viewer
 */

const ABSOLUTE_URL = /^([a-z][a-z\d+.-]*:|\/|#)/i;

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Renders markdown content to HTML
 * @param {string} markdown - The markdown content to render
 * @param {object} [options]
 * @param {string|URL} [options.baseUrl] - Folder used to resolve relative image and link URLs
 * @returns {string} The rendered HTML
 */
export function renderMarkdown(markdown, { baseUrl } = {}) {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  const marked = new Marked({
    gfm: true,
    breaks: true,
    walkTokens(token) {
      if (
        baseUrl &&
        (token.type === 'image' || token.type === 'link') &&
        !ABSOLUTE_URL.test(token.href)
      ) {
        token.href = new URL(token.href, baseUrl).href;
      }
    },
  });

  return marked.parse(markdown);
}

/**
 * Renders markdown content to HTML and wraps it in a prose container
 * @param {string} markdown - The markdown content to render
 * @param {object} [options] - See renderMarkdown
 * @returns {string} The rendered HTML wrapped in a prose container
 */
export function renderMarkdownWithProse(markdown, options) {
  return `<div class="prose">${renderMarkdown(markdown, options)}</div>`;
}

/**
 * Creates the loading message HTML
 * @returns {string} The loading HTML
 */
export function createLoadingSpinner() {
  return '<p class="results-count" role="status">Chargement de la recette…</p>';
}

/**
 * Creates an error message HTML
 * @param {string} message - The error message to display
 * @returns {string} The error message HTML
 */
export function createErrorMessage(message) {
  return `<div class="notice" role="alert"><p>${escapeHtml(message)}</p></div>`;
}

/**
 * Extracts metadata from markdown frontmatter (if present)
 * @param {string} markdown - The markdown content
 * @returns {Object} An object containing the metadata and clean content
 */
export function extractFrontmatter(markdown) {
  const frontmatterRegex = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/;
  const match = frontmatterRegex.exec(markdown);

  if (!match) {
    return {
      metadata: {},
      content: markdown,
    };
  }

  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line
        .substring(colonIndex + 1)
        .trim()
        .replace(/^(["'])(.*)\1$/, '$2');
      metadata[key] = value;
    }
  }

  return {
    metadata,
    content: match[2],
  };
}

export default {
  renderMarkdown,
  renderMarkdownWithProse,
  createLoadingSpinner,
  createErrorMessage,
  extractFrontmatter,
  escapeHtml,
};
