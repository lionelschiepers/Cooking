import { marked } from 'marked';

/**
 * Markdown Renderer Module
 * Centralized markdown rendering logic for the recipe website
 */

// Configure marked options
marked.setOptions({
  gfm: true,  // GitHub Flavored Markdown
  breaks: true,  // Convert line breaks to <br>
  headerIds: true,  // Generate IDs for headers
  mangle: false,  // Don't escape HTML
  sanitize: false  // Allow HTML (be careful with user content)
});

/**
 * Renders markdown content to HTML
 * @param {string} markdown - The markdown content to render
 * @returns {string} The rendered HTML
 */
export function renderMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return '<p class="error-message">No content to display</p>';
  }
  
  try {
    return marked.parse(markdown);
  } catch (error) {
    console.error('Error rendering markdown:', error);
    return `<p class="error-message">Error rendering content: ${error.message}</p>`;
  }
}

/**
 * Renders markdown content to HTML and wraps it in a prose container
 * @param {string} markdown - The markdown content to render
 * @returns {string} The rendered HTML wrapped in a prose container
 */
export function renderMarkdownWithProse(markdown) {
  const html = renderMarkdown(markdown);
  return `<div class="prose">${html}</div>`;
}

/**
 * Creates a loading spinner HTML
 * @returns {string} The loading spinner HTML
 */
export function createLoadingSpinner() {
  return `
    <div class="loading">
      <div class="loading-spinner"></div>
    </div>
  `;
}

/**
 * Creates an error message HTML
 * @param {string} message - The error message to display
 * @returns {string} The error message HTML
 */
export function createErrorMessage(message) {
  return `<div class="error-message">${message}</div>`;
}

/**
 * Extracts metadata from markdown frontmatter (if present)
 * @param {string} markdown - The markdown content
 * @returns {Object} An object containing the metadata and clean content
 */
export function extractFrontmatter(markdown) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);
  
  if (!match) {
    return {
      metadata: {},
      content: markdown
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
    content
  };
}

export default {
  renderMarkdown,
  renderMarkdownWithProse,
  createLoadingSpinner,
  createErrorMessage,
  extractFrontmatter
};
