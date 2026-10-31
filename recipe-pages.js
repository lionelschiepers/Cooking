/**
 * Builds the static recipe pages (one index.html per markdown recipe) from
 * _recipes/<name>.md and the _layouts/recipe.html template.
 * Used by build-recipes.js (production) and build-recipes-dev.js (dev server).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Marked } from 'marked';
import { getImageSize, variantName, variantSrcset } from './image-variants.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = path.join(ROOT, '_recipes');
const SOURCE_DIR = path.join(ROOT, 'recipes');
const LAYOUT_PATH = path.join(ROOT, '_layouts', 'recipe.html');

export const SITE = {
  title: 'Les recettes de Lionel & Ophélie',
  description:
    'Découvrez les recettes de cuisine favorites de Lionel et Ophélie : plats délicieux, desserts gourmands et conseils pratiques pour tous les jours.',
};

const HERO_SIZES = '(min-width: 80rem) 40rem, (min-width: 64rem) 52vw, 92vw';
const BODY_SIZES = '(min-width: 42rem) 37rem, 92vw';
const LEADING_IMAGE =
  /^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)[ \t]*(?:\r?\n|$)/;
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;

const dateFormatter = new Intl.DateTimeFormat('fr-BE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseFrontmatter(markdown) {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/.exec(
    markdown,
  );
  if (!match) return { metadata: {}, content: markdown };

  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        value = JSON.parse(value.replaceAll("'", '"'));
      } catch {
        // Keep the raw string.
      }
    }
    metadata[key] = value;
  }
  return { metadata, content: match[2] };
}

function parseDate(value) {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value ?? '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isLocal(url) {
  return !/^([a-z][a-z\d+.-]*:|\/\/|\/)/i.test(url);
}

/** Sizes of the local photos used by a recipe, keyed by their markdown URL. */
async function readImageSizes(markdown, name) {
  const sizes = new Map();
  for (const [, url] of markdown.matchAll(MARKDOWN_IMAGE)) {
    if (!isLocal(url) || sizes.has(url)) continue;
    const file = path.join(SOURCE_DIR, name, decodeURI(url));
    if (fs.existsSync(file)) {
      sizes.set(url, await getImageSize(file));
    }
  }
  return sizes;
}

function imageTag({ src, alt, size, sizes, eager = false }) {
  const attrs = [`src="${escapeHtml(src)}"`];
  if (size) {
    attrs.push(
      `srcset="${escapeHtml(variantSrcset(src, size.width))}"`,
      `sizes="${sizes}"`,
      `width="${size.width}"`,
      `height="${size.height}"`,
    );
  }
  attrs.push(`alt="${escapeHtml(alt)}"`);
  attrs.push(eager ? 'fetchpriority="high"' : 'loading="lazy"');
  attrs.push('decoding="async"');
  return `<img ${attrs.join(' ')}>`;
}

function createMarkdownRenderer(imageSizes) {
  const marked = new Marked();
  marked.use({
    renderer: {
      image({ href, text }) {
        return imageTag({
          src: href,
          alt: text,
          size: imageSizes.get(href),
          sizes: BODY_SIZES,
        });
      },
    },
  });
  return marked;
}

function socialImage(hero, heroSize, metadata, pageUrl, siteUrl) {
  if (hero && heroSize && isLocal(hero.src)) {
    const width = Math.min(1440, heroSize.width);
    return {
      url: new URL(variantName(hero.src, 1440), pageUrl).href,
      width,
      height: Math.round((heroSize.height * width) / heroSize.width),
    };
  }
  if (metadata.image) {
    return {
      url: new URL(metadata.image.replace(/^\//, ''), `${siteUrl}/`).href,
    };
  }
  return null;
}

function renderTemplate(template, vars) {
  return template.replaceAll(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (!(key in vars)) {
      throw new Error(`Variable inconnue dans le gabarit : ${key}`);
    }
    return vars[key];
  });
}

async function buildPage({ file, template, outputDir, siteUrl, assets }) {
  const name = path.basename(file, '.md');
  const { metadata, content } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  const title = metadata.title || name;
  const description = metadata.description || '';
  const pageUrl = `${siteUrl}/recipes/${name}/`;

  let body = content.trim();
  let hero = null;
  const lead = LEADING_IMAGE.exec(body);
  if (lead) {
    hero = { alt: lead[1], src: lead[2] };
    body = body.slice(lead[0].length).trim();
  }

  const imageSizes = await readImageSizes(content, name);
  const heroSize = hero ? imageSizes.get(hero.src) : null;
  const bodyHtml = body
    ? createMarkdownRenderer(imageSizes).parse(body).trim()
    : '';

  const date = parseDate(metadata.date);
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const ogImage = socialImage(hero, heroSize, metadata, pageUrl, siteUrl);
  const metaDescription = description || SITE.description;

  const vars = {
    page_title: escapeHtml(`${title} - ${SITE.title}`),
    title: escapeHtml(title),
    site_title: escapeHtml(SITE.title),
    meta_description: escapeHtml(metaDescription),
    canonical_url: escapeHtml(pageUrl),
    og_image_html: ogImage
      ? [
          `<meta property="og:image" content="${escapeHtml(ogImage.url)}" />`,
          ogImage.width
            ? `<meta property="og:image:width" content="${ogImage.width}" />\n    <meta property="og:image:height" content="${ogImage.height}" />`
            : '',
          `<meta name="twitter:image" content="${escapeHtml(ogImage.url)}" />`,
        ]
          .filter(Boolean)
          .join('\n    ')
      : '',
    styles_href: escapeHtml(assets.styles),
    script_src: escapeHtml(assets.script),
    description_html:
      description && normalize(description) !== normalize(title)
        ? `<p class="recipe-lede">${escapeHtml(description)}</p>`
        : '',
    date_html: date
      ? `<p class="recipe-date">Ajoutée le <time datetime="${date.toISOString().slice(0, 10)}">${dateFormatter.format(date)}</time></p>`
      : '',
    tags_html: tags.length
      ? `<ul class="tag-list" aria-label="Catégories">${tags
          .map(
            (tag) =>
              `<li><a class="tag" href="../../?tag=${encodeURIComponent(tag)}"><span class="sr-only">Voir les recettes de la catégorie </span>${escapeHtml(tag)}</a></li>`,
          )
          .join('')}</ul>`
      : '',
    hero_html: hero
      ? `<figure class="recipe-photo">${imageTag({
          src: hero.src,
          alt: hero.alt || title,
          size: heroSize,
          sizes: HERO_SIZES,
          eager: true,
        })}</figure>`
      : '',
    body_html: bodyHtml
      ? `<div id="recipe-content" class="recipe-body prose">${bodyHtml}</div>`
      : '',
  };

  const html = renderTemplate(template, vars);
  const pageDir = path.join(outputDir, name);
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf8');
  return { name, date: metadata.date || '' };
}

/**
 * @param {object} options
 * @param {string} options.outputDir  Folder that receives <name>/index.html.
 * @param {string} options.siteUrl    Absolute site URL used for canonical and social tags.
 * @param {{styles: string, script: string}} options.assets  URLs of the stylesheet and recipe-page script.
 */
export async function buildRecipePages({ outputDir, siteUrl, assets }) {
  if (!fs.existsSync(RECIPES_DIR)) {
    throw new Error(
      'Dossier _recipes introuvable : lancez pnpm run generate:recipes',
    );
  }
  const files = fs
    .readdirSync(RECIPES_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => path.join(RECIPES_DIR, file));
  if (!files.length) {
    throw new Error(
      'Aucune recette dans _recipes : lancez pnpm run generate:recipes',
    );
  }

  const template = fs.readFileSync(LAYOUT_PATH, 'utf8');
  fs.mkdirSync(outputDir, { recursive: true });

  let count = 0;
  let failed = 0;
  for (const file of files) {
    try {
      await buildPage({ file, template, outputDir, siteUrl, assets });
      count++;
    } catch (error) {
      failed++;
      console.error(`Erreur pour ${path.basename(file)} : ${error.message}`);
    }
  }
  console.log(`${count} pages de recette générées dans ${outputDir}`);
  if (failed) process.exitCode = 1;
}

/** Short content hash, used to bust caches on files with a fixed name. */
export function fileHash(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
    .slice(0, 10);
}
