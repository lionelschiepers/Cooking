/**
 * Imports a delicha.fr recipe into this site.
 *
 *   node .agents/skills/import-delicha/import-delicha.js "<delicha url>" [options]
 *
 * Delicha is a WordPress site: the recipe metadata is schema.org JSON-LD, but
 * the ingredients and the steps are only readable in the article HTML (the
 * JSON-LD packs them in one prose blob). Writes recipes/<slug>/recipe.md,
 * recipes/<slug>/<slug>.webp (cropped to a square around the dish, like the
 * home page's thumbnail) and adds the entry to recipes.json. Run with --help
 * for the options.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL_DIR, '../../..');
const REFERENCES = path.join(SKILL_DIR, 'references.json');
const RECIPES_JSON = path.join(ROOT, 'recipes.json');
const RECIPES_DIR = path.join(ROOT, 'recipes');
const AUTHORS = 'Lionel Schiepers, Ophélie De Loz';
const MAX_SIDE = 1920;

const USAGE = `Usage: node .agents/skills/import-delicha/import-delicha.js "<url>" [options]
       node .agents/skills/import-delicha/import-delicha.js --check

  --slug <slug>        Folder and id (default: from the title)
  --title <text>       Title (default: the page name in title case)
  --description <text> recipes.json description
  --tags <a,b>         Comma-separated tags (default: guessed)
  --date <YYYY/MM/DD>  Date (default: today)
  --rest <text>        Rest time to add to the intro (e.g. "48 h d'infusion")
  --no-crop            Keep the photo uncropped
  --crop-left <px>     Force the left edge of the square crop
  --no-tips            Do not write the tips as an "Astuce" section
  --force              Replace an existing recipe with the same slug
  --dry-run            Print the result without writing to the repository
  --check              Re-test the recipes listed in references.json`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    slug: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    tags: { type: 'string' },
    date: { type: 'string' },
    rest: { type: 'string' },
    'no-crop': { type: 'boolean', default: false },
    'crop-left': { type: 'string' },
    'no-tips': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opts.help || (!opts.check && positionals.length !== 1)) {
  console.log(USAGE);
  process.exit(opts.help ? 0 : 1);
}

async function get(url, type = 'text') {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
      }
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} : ${url}`);
    return type === 'buffer'
      ? Buffer.from(await res.arrayBuffer())
      : res.text();
  }
  throw new Error(
    `Impossible de lire ${url} après 3 essais : ${lastError.message}`,
  );
}

const ENTITIES = {
  aacute: 'á',
  acirc: 'â',
  agrave: 'à',
  amp: '&',
  apos: "'",
  aring: 'å',
  auml: 'ä',
  aelig: 'æ',
  bdquo: '„',
  bull: '•',
  ccedil: 'ç',
  cent: '¢',
  copy: '©',
  deg: '°',
  divide: '÷',
  eacute: 'é',
  ecirc: 'ê',
  egrave: 'è',
  emsp: ' ',
  ensp: ' ',
  euml: 'ë',
  euro: '€',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  gt: '>',
  hellip: '…',
  iacute: 'í',
  icirc: 'î',
  igrave: 'ì',
  iuml: 'ï',
  laquo: '«',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  nbsp: ' ',
  ndash: '–',
  ntilde: 'ñ',
  oacute: 'ó',
  ocirc: 'ô',
  oelig: 'œ',
  ograve: 'ò',
  oslash: 'ø',
  otilde: 'õ',
  ouml: 'ö',
  pound: '£',
  quot: '"',
  raquo: '»',
  rdquo: '”',
  reg: '®',
  rsquo: '’',
  sbquo: '‚',
  szlig: 'ß',
  thinsp: ' ',
  times: '×',
  trade: '™',
  uacute: 'ú',
  ucirc: 'û',
  ugrave: 'ù',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Flattens HTML to prose, keeps bold/italic as Markdown, decodes entities. */
function cleanText(text) {
  if (!text) return '';
  const withoutTags = String(text)
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<\s*\/\s*(?:p|li|ul|ol|div|h[1-6])\s*>/gi, ' ')
    .replace(
      /<\s*(?:strong|b|em|i)\s*>\s*<\s*\/\s*(?:strong|b|em|i)\s*>/gi,
      ' ',
    )
    .replace(/<\s*(?:strong|b)\s*>/gi, '**')
    .replace(/<\s*\/\s*(?:strong|b)\s*>/gi, '**')
    .replace(/<\s*(?:em|i)\s*>/gi, '*')
    .replace(/<\s*\/\s*(?:em|i)\s*>/gi, '*')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return decodeEntities(withoutTags)
    .replace(/\*\*([^*]+)\*\*/g, (_, inner) => `**${inner.trim()}**`)
    .replace(/(?<=\S)\*\*\*(?=\s*\S)/g, '** *')
    .replace(
      /(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g,
      (_, inner) => `*${inner.trim()}*`,
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** The recipe is a schema.org Recipe object among the page's JSON-LD scripts. */
function findJsonObjects(html) {
  const objects = [];
  const walk = (data) => {
    if (Array.isArray(data)) {
      data.forEach(walk);
    } else if (data && typeof data === 'object') {
      objects.push(data);
      Object.values(data).forEach(walk);
    }
  };
  for (const match of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walk(JSON.parse(match[1]));
    } catch {
      continue;
    }
  }
  return objects;
}

function findRecipeJson(html) {
  const recipe = findJsonObjects(html).find(
    (object) =>
      object['@type'] === 'Recipe' ||
      (Array.isArray(object['@type']) && object['@type'].includes('Recipe')),
  );
  if (recipe) return recipe;
  throw new Error('Aucune recette schema.org trouvée dans la page Delicha.');
}

/** The article body only: Delicha pages also carry sidebars and related posts. */
function findArticle(html) {
  const match =
    /<article[^>]*class="[^"]*\bdlch-prose\b[^"]*"[^>]*>([\s\S]*?)<\/article>/i.exec(
      html,
    );
  return match ? match[1] : html;
}

/** Content between the H2 whose text matches and the next H2. */
function sectionByTitle(article, titlePattern) {
  const parts = article.split(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  for (let i = 1; i < parts.length; i += 2) {
    const heading = cleanText(parts[i]).replace(/\*/g, '').trim();
    if (titlePattern.test(heading)) return parts[i + 1];
  }
  return null;
}

function listItems(html) {
  const list = /<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(html);
  if (!list) return [];
  return [...list[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(
    (item) => item[1],
  );
}

const OPTIONAL = /^(facultatif|optionnel|au goût)/i;

/**
 * Delicha ingredients are prose lines (`50 cl d'huile d'olive vierge extra`)
 * with an editorial parenthesis (`(la base de votre préparation)`). The
 * parenthesis is dropped unless it is a real qualifier (`(facultatif)`).
 */
function formatIngredient(html) {
  let text = cleanText(html).replace(/\*\*/g, '');
  text = text
    .replace(/\s*\(([^)]*)\)/g, (match, inner) => {
      const first = inner.split(',')[0].trim();
      return OPTIONAL.test(first) ? ` (${first.toLowerCase()})` : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  if (/^\p{Lu}/u.test(text) && !/^\d/.test(text)) text = lowerFirst(text);
  return text;
}

const STEP_HEADING =
  /^\*\*(?:Étape|Etape)\s*(\d+)\s*:\s*(.+?)\*\*\s*([\s\S]*)$/i;
const TIP_HEADING = /^\*\*([^*]+?)\s*:?\*\*\s*([\s\S]*)$/;

/** Spacing fixes for the prose Delicha writes (`60-70°C`). */
function tidyStep(text) {
  return text
    .replace(/(\d)\s*°\s*C\b/gi, '$1 °C')
    .replace(/\s+([,.])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Steps are a bold `Étape N : Title` paragraph followed by its prose. Any
 * other bold-led paragraph (Conservation, Conseil...) is a tip.
 */
function parsePreparation(section) {
  const steps = [];
  const tips = [];
  const paragraphs = [...section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(
    (match) => tidyStep(cleanText(match[1])),
  );
  for (const text of paragraphs) {
    if (!text) continue;
    const step = STEP_HEADING.exec(text);
    if (step) {
      steps.push({
        title: step[2].replace(/[.:]$/, '').trim(),
        body: step[3].trim(),
      });
      continue;
    }
    const tip = TIP_HEADING.exec(text);
    if (tip) {
      tips.push({
        label: tip[1].replace(/[.:]$/, '').trim(),
        text: tip[2].trim(),
      });
      continue;
    }
    if (steps.length) {
      const body = steps[steps.length - 1].body;
      steps[steps.length - 1].body = body ? `${body} ${text}` : text;
    }
  }
  return { steps, tips };
}

function formatSteps(steps) {
  return steps
    .map((step) =>
      step.body ? `**${step.title}.** ${step.body}` : `**${step.title}.**`,
    )
    .filter(Boolean);
}

/** The "Astuces d'utilisation" list at the end of the article. */
function usageTips(article) {
  const match =
    /<(?:strong|b)[^>]*>\s*Astuces?\s+d(?:&#8217;|’|')utilisation\s*:?\s*<\/(?:strong|b)>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(
      article,
    );
  if (!match) return [];
  return [...match[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((item) => cleanText(item[1]))
    .filter(Boolean);
}

/** Ingredient notes (`Conseil qualité`) live before the preparation heading. */
function ingredientTips(section) {
  const tips = [];
  for (const match of section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const tip = TIP_HEADING.exec(cleanText(match[1]));
    if (tip) {
      tips.push({
        label: tip[1].replace(/[.:]$/, '').trim(),
        text: tip[2].trim(),
      });
    }
  }
  return tips;
}

function formatTip(tip) {
  return typeof tip === 'string' ? tip : `**${tip.label} :** ${tip.text}`;
}

function totalMinutes(iso) {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/i.exec(iso ?? '');
  if (!match) return null;
  const [, days, hours, minutes] = match.map((value) => Number(value) || 0);
  return days * 24 * 60 + hours * 60 + minutes;
}

function formatDuration(minutes) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} minutes`;
  if (!rest) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, '0')}`;
}

function servingsOf(value) {
  const first = Array.isArray(value) ? value[0] : value;
  const number = parseInt(String(first), 10);
  return Number.isFinite(number) ? number : null;
}

function lowerFirst(text) {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

const SMALL_WORDS = new Set([
  'à',
  'au',
  'aux',
  'avec',
  'd',
  'de',
  'des',
  'du',
  'en',
  'et',
  'l',
  'la',
  'le',
  'les',
  'ou',
  'par',
  'pour',
  'sur',
  'un',
  'une',
]);

function titleCase(text) {
  return text.replace(/\p{L}+/gu, (word, offset) =>
    offset > 0 && SMALL_WORDS.has(word.toLowerCase())
      ? word.toLowerCase()
      : word[0].toUpperCase() + word.slice(1),
  );
}

function slugify(text) {
  return text
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !SMALL_WORDS.has(word) && word !== 'a')
    .join('-');
}

const FISH =
  /saumon|cabillaud|maquereau|thon|truite|merlu|\bcolin\b|dorade|poisson|crevette|scampi|moule|gambas|calamar|sardine|hareng|\bsole\b|\bbar\b|\blieu\b|églefin|haddock|tilapia|pangasius/;
const MEAT =
  /porc|b(œ|oe)uf|\bveau\b|agneau|canard|saucisse|haché|lard|jambon|poulet|dinde|chorizo|steak|pancetta|bacon|mignon|merguez|chipolata|volaille|salami|prosciutto|coppa|speck|gyros|kebab|boulette|viande/;
const PASTA =
  /pâtes|pates|spaghetti|tagliatelle|penne|orzo|linguine|lasagne|gnocchi|fusilli|rigatoni|farfalle|macaroni|fettuccine|ravioli|tortell[io]ni?s?|conchiglie/;
const ASIAN =
  /nouilles|udon|ramen|wok|teriyaki|sriracha|gochujang|coréen|thaï|japonais|chinois|vietnamien|curry|hoisin|asiatique/;
const PIZZA = /pizza|focaccia|calzone/;

const CATEGORY_TAGS = [
  ['Dessert', /\bdesserts?\b|\bpatisseries?\b|\bpâtisseries?\b|\bflans?\b/i],
  ['Entrée', /\bentrées?\b/i],
  ['Apéro', /\bapéritifs?\b|\baperitifs?\b/i],
  ['Salade', /\bsalades?\b/i],
  ['Sauce', /\bsauces?\b|\bcondiments?\b|\bhuiles?\b/i],
  ['Accompagnement', /\baccompagnements?\b/i],
];

function guessTags(text, ingredients = [], categoryText = '') {
  const t = text.toLowerCase();
  const items = ingredients.join(' | ').toLowerCase();
  const category = categoryText.toLowerCase();
  const tags = [];
  if (FISH.test(t) || FISH.test(items)) tags.push('Poisson');
  if (MEAT.test(t) || MEAT.test(items)) tags.push('Viande');
  if (PASTA.test(t) || PASTA.test(items)) tags.push('Pates');
  if (ASIAN.test(t)) tags.push('Asiatique');
  if (PIZZA.test(t)) tags.push('Pizza');
  for (const [tag, pattern] of CATEGORY_TAGS) {
    if (pattern.test(category) && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/**
 * Centre of the dish: the largest connected area of saturated, bright pixels
 * (the food), not the whole frame. A thin side band is ignored so a prop cut by
 * the frame cannot pull the crop. Falls back to the image centre.
 */
const FOOD_SATURATION = 0.3;
const FOOD_LUMINANCE = 0.35;
async function dishCenter(buffer, width, height) {
  const sample = 400;
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: sample })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: sampleWidth, height: sampleHeight, channels } = info;
  const edge = Math.max(4, Math.round(sampleWidth * 0.05));
  const mask = new Uint8Array(sampleWidth * sampleHeight);
  for (let i = 0; i < mask.length; i++) {
    const x = i % sampleWidth;
    if (x < edge || x >= sampleWidth - edge) continue;
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const luminance = Math.max(r, g, b) / 255;
    if (saturation > FOOD_SATURATION && luminance > FOOD_LUMINANCE) {
      mask[i] = 1;
    }
  }

  const seen = new Uint8Array(mask.length);
  let best = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let minX = sampleWidth;
    let maxX = 0;
    let minY = sampleHeight;
    let maxY = 0;
    let count = 0;
    while (stack.length) {
      const pixel = stack.pop();
      const x = pixel % sampleWidth;
      const y = (pixel / sampleWidth) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const next of [
        pixel - 1,
        pixel + 1,
        pixel - sampleWidth,
        pixel + sampleWidth,
      ]) {
        if (next < 0 || next >= mask.length) continue;
        if (Math.abs((next % sampleWidth) - x) > 1) continue;
        if (mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    if (!best || count > best.count) best = { minX, maxX, minY, maxY, count };
  }
  if (!best || best.count < mask.length * 0.01) return null;

  return {
    x: (((best.minX + best.maxX) / 2) * width) / sampleWidth,
    y: (((best.minY + best.maxY) / 2) * height) / sampleHeight,
  };
}

/** Delicha serves the original photo under wp-content/uploads. */
function photoCandidates(recipe, html) {
  const urls = [];
  const add = (url) => {
    if (typeof url !== 'string') return;
    const clean = url.replace(/\\\//g, '/').trim();
    if (clean && !urls.includes(clean)) urls.push(clean);
  };
  add(recipe.image?.url ?? recipe.image);
  for (const match of html.matchAll(
    /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/gi,
  )) {
    add(decodeEntities(match[1]));
  }
  return urls;
}

/**
 * Crops a square of the shorter side, centred on the dish rather than on the
 * image: Delicha hero photos are landscape shots with props all around.
 */
async function preparePhoto(urls, crop, cropLeft) {
  let buffer;
  let lastError;
  for (const url of urls) {
    try {
      buffer = await get(url, 'buffer');
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!buffer) throw lastError;

  const meta = await sharp(buffer).metadata();
  const [width, height] =
    (meta.orientation ?? 1) >= 5
      ? [meta.height, meta.width]
      : [meta.width, meta.height];

  let area = { left: 0, top: 0, width, height };
  let note = 'photo gardée entière (--no-crop)';
  if (crop) {
    const side = Math.min(width, height);
    const forced = Number.isFinite(Number(cropLeft)) ? Number(cropLeft) : null;
    const center =
      forced === null ? await dishCenter(buffer, width, height) : null;
    const centerX = forced ?? center?.x ?? width / 2;
    const centerY = center?.y ?? height / 2;
    const left = Math.max(
      0,
      Math.min(width - side, Math.round(centerX - side / 2)),
    );
    const top = Math.max(
      0,
      Math.min(height - side, Math.round(centerY - side / 2)),
    );
    area = { left, top, width: side, height: side };
    note =
      forced === null
        ? `carré centré sur le plat ${side}x${side} depuis (${left}, ${top})`
        : `carré forcé à gauche ${left} (${side}x${side})`;
  }

  const webp = await sharp(buffer)
    .rotate()
    .extract(area)
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  const side = Math.min(width, height);
  return {
    webp: webp.data,
    size: [webp.info.width, webp.info.height],
    note,
    square: webp.info.width === webp.info.height,
    area,
    centered: {
      left: Math.round((width - side) / 2),
      top: Math.round((height - side) / 2),
    },
  };
}

async function writeSquarePreview(webp, file) {
  const { width, height } = await sharp(webp).metadata();
  const side = Math.min(width, height);
  await sharp(webp)
    .extract({
      left: Math.round((width - side) / 2),
      top: Math.round((height - side) / 2),
      width: side,
      height: side,
    })
    .resize(640)
    .png()
    .toFile(file);
}

function keywordList(name) {
  const words = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return [...new Set(words)];
}

function buildMarkdown({
  title,
  slug,
  description,
  steps,
  ingredients,
  persons,
  minutes,
  rest,
  tips = [],
  url,
}) {
  const keywords = keywordList(title);
  const intro = [/[.!?]$/.test(title) ? title : `${title}.`];
  const duration = formatDuration(minutes);
  if (duration)
    intro.push(`Prêt en ${duration}${rest ? `, puis ${rest}` : ''}.`);

  const lines = [
    '---',
    `title: ${title}`,
    `author: ${AUTHORS}`,
    `keywords: ${AUTHORS}, cooking, recipe, ${keywords.join(', ')}, food, cuisine`,
    '---',
    '',
    `![${title}](./${slug}.webp)`,
    '',
    intro.join(' '),
  ];
  if (description) lines.push('', description);
  lines.push(
    '',
    `## Ingrédients (${persons} ${persons > 1 ? 'personnes' : 'personne'})`,
    ...ingredients.map((line) => `- ${line}`),
    '',
    '## Préparation',
    steps.map((step, i) => `${i + 1}. ${step}`).join('\n\n'),
  );
  if (tips.length) {
    lines.push(
      '',
      '## Astuce',
      '',
      ...tips.map((tip) => `- ${formatTip(tip)}`),
    );
  }
  lines.push('', '## Lien', `[Delicha](${url})`, '');
  return lines.join('\n');
}

async function formatJson(file, text) {
  try {
    const prettier = await import('prettier');
    const options = (await prettier.resolveConfig(file)) ?? {};
    return await prettier.format(text, { ...options, filepath: file });
  } catch {
    return text;
  }
}

const MARKUP = /<\/?[a-z][^>]*>|&(#\d+|[a-z]+);/i;

/** Flags data the script was not written for. */
function inspect({
  name,
  ingredients,
  steps,
  minutes,
  persons,
  notes: extra = [],
}) {
  const notes = [...extra];
  if (!name) notes.push('Nom absent.');
  if (!ingredients.length) notes.push('Aucun ingrédient.');
  if (!steps.length) notes.push('Aucune étape de préparation.');
  if (!minutes) notes.push('Temps total absent.');
  if (!persons) notes.push('Nombre de portions absent.');
  for (const ingredient of ingredients) {
    if (!ingredient.trim()) notes.push('Ingrédient vide.');
  }
  for (const text of [name, ...ingredients, ...steps]) {
    if (MARKUP.test(text ?? '')) {
      notes.push(
        `HTML ou entité dans le texte : « ${String(text).slice(0, 80)} »`,
      );
      break;
    }
  }
  return notes;
}

/** JSON-LD fallback when the article list cannot be read. */
function ingredientsFromJson(recipe) {
  const lines = (recipe.recipeIngredient ?? [])
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const start = lines.findIndex((line) => /liste compl[èe]te/i.test(line));
  return (start === -1 ? lines : lines.slice(start + 1))
    .filter((line) => /^\d|^(quelques|flocons|une?|des)\b/i.test(line))
    .map(formatIngredient)
    .filter(Boolean);
}

async function fetchRecipe(url) {
  const pageUrl = new URL(url);
  if (!/(^|\.)delicha\.fr$/i.test(pageUrl.hostname)) {
    throw new Error(`Pas une adresse Delicha : ${url}`);
  }

  const html = await get(url);
  const recipe = findRecipeJson(html);
  const name = cleanText(recipe.name?.trim());
  if (!name) throw new Error('Nom de la recette introuvable.');
  const article = findArticle(html);

  const ingredientsSection = sectionByTitle(article, /^ingr[ée]dients$/i);
  const preparationSection = sectionByTitle(article, /^pr[ée]paration$/i);
  const notes = [];

  let ingredients = [];
  if (ingredientsSection) {
    ingredients = listItems(ingredientsSection)
      .map(formatIngredient)
      .filter(Boolean);
  }
  if (!ingredients.length) {
    ingredients = ingredientsFromJson(recipe);
    if (ingredients.length) {
      notes.push('Liste HTML absente : ingrédients lus dans le JSON-LD.');
    }
  }

  let steps = [];
  let tips = [];
  if (preparationSection) {
    const parsed = parsePreparation(preparationSection);
    steps = formatSteps(parsed.steps);
    tips = parsed.tips;
  }
  if (ingredientsSection) tips.unshift(...ingredientTips(ingredientsSection));
  tips.push(...usageTips(article));
  tips = tips.filter(
    (tip, index) =>
      tips.findIndex((other) => formatTip(other) === formatTip(tip)) === index,
  );

  const total = totalMinutes(recipe.totalTime);
  const minutes =
    total ??
    ((totalMinutes(recipe.prepTime) ?? 0) +
      (totalMinutes(recipe.cookTime) ?? 0) ||
      null);
  const persons = servingsOf(recipe.recipeYield);
  const categoryText = [recipe.recipeCategory, recipe.keywords]
    .flat()
    .filter(Boolean)
    .join(' ');

  return {
    recipe,
    html,
    name,
    description: cleanText(recipe.description ?? ''),
    minutes,
    persons: persons ?? 2,
    ingredients,
    steps,
    tips: opts['no-tips'] ? [] : tips,
    categoryText,
    notes: inspect({
      name,
      ingredients,
      steps,
      minutes,
      persons,
      notes,
    }),
  };
}

/** Folder of a recipe whose link is the same Delicha page, if any. */
function importedAs(url) {
  const page = url.replace(/[?#].*$/, '').replace(/\/$/, '');
  for (const entry of fs.readdirSync(RECIPES_DIR, { withFileTypes: true })) {
    const file = path.join(RECIPES_DIR, entry.name, 'recipe.md');
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(`](${page})`) || text.includes(`](${page}/)`)) {
      return entry.name;
    }
  }
  return null;
}

async function importRecipe(url) {
  const data = await fetchRecipe(url);
  const notes = [...data.notes];
  if (/jours?|semaines?/i.test(data.steps.join(' ')) && !opts.rest) {
    notes.push(
      'Les étapes mentionnent un repos de plusieurs jours : --rest pour l’indiquer dans l’introduction.',
    );
  }

  const title = opts.title ?? titleCase(data.name);
  const slug = opts.slug ?? slugify(title);
  const description = opts.description ?? `${data.name} (Delicha)`;
  const tags = opts.tags
    ? opts.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : guessTags(
        `${title} ${data.ingredients.join(' ')}`,
        data.ingredients,
        data.categoryText,
      );
  if (!tags.length) notes.push('Aucun tag deviné : passez --tags.');
  const date = opts.date ?? today();

  const recipesData = JSON.parse(fs.readFileSync(RECIPES_JSON, 'utf8'));
  const recipeDir = path.join(RECIPES_DIR, slug);
  const previous = importedAs(url);
  if (previous && previous !== slug) {
    const message = `Recette déjà importée dans recipes/${previous}/.`;
    if (!opts.force && !opts['dry-run']) {
      throw new Error(
        `${message} Utilisez --force pour l'importer quand même.`,
      );
    }
    notes.push(message);
  }
  const exists =
    fs.existsSync(recipeDir) || recipesData.recipes.some((r) => r.id === slug);
  if (exists && !opts.force && !opts['dry-run']) {
    throw new Error(
      `La recette "${slug}" existe déjà (utilisez --force pour la remplacer).`,
    );
  }

  const urls = photoCandidates(data.recipe, data.html);
  if (!urls.length) throw new Error('Photo Delicha introuvable.');
  const photo = await preparePhoto(urls, !opts['no-crop'], opts['crop-left']);
  if (!opts['no-crop'] && !photo.square) {
    notes.push('Le recadrage n’est pas carré : vérifiez l’aperçu.');
  }
  const preview = path.join(os.tmpdir(), `delicha-${slug}-square.png`);
  await writeSquarePreview(photo.webp, preview);

  const markdown = buildMarkdown({
    title,
    slug,
    description: '',
    steps: data.steps,
    ingredients: data.ingredients,
    persons: data.persons,
    minutes: data.minutes,
    rest: opts.rest,
    tips: data.tips,
    url,
  });
  const entry = {
    id: slug,
    title,
    type: 'markdown',
    date,
    path: `recipes/${slug}/`,
    image: `./recipes/${slug}/${slug}.webp`,
    tags,
    description,
  };

  if (opts['dry-run']) {
    console.log(markdown);
    console.log(JSON.stringify(entry, null, 2));
  } else {
    fs.mkdirSync(recipeDir, { recursive: true });
    fs.writeFileSync(path.join(recipeDir, 'recipe.md'), markdown);
    fs.writeFileSync(path.join(recipeDir, `${slug}.webp`), photo.webp);

    recipesData.recipes = recipesData.recipes.filter((r) => r.id !== slug);
    const at = recipesData.recipes.findIndex(
      (r) => new Date(r.date) <= new Date(date),
    );
    recipesData.recipes.splice(
      at === -1 ? recipesData.recipes.length : at,
      0,
      entry,
    );
    fs.writeFileSync(
      RECIPES_JSON,
      await formatJson(
        RECIPES_JSON,
        JSON.stringify(recipesData, null, 2) + '\n',
      ),
    );
  }

  console.log(`
${opts['dry-run'] ? 'Aperçu (rien écrit)' : 'Importé'} : ${title}
  dossier  : recipes/${slug}/
  source   : page Delicha (JSON-LD + article)
  portions : ${data.persons}
  temps    : ${data.minutes ?? '?'} minutes${opts.rest ? ` + ${opts.rest}` : ''}
  tags     : ${tags.join(', ') || '(aucun)'}
  photo    : ${photo.size.join('x')}, ${photo.note}
  carré    : ${preview}`);
  if (data.tips.length) console.log(`  astuces  : ${data.tips.length}`);
  if (notes.length) {
    console.log(
      `\nÀ vérifier (voir « Keep this skill up to date » dans SKILL.md) :\n${notes.map((note) => `  - ${note}`).join('\n')}`,
    );
  }
}

/** Re-reads every reference recipe (nothing is written) and checks past fixes. */
async function runChecks() {
  const references = JSON.parse(fs.readFileSync(REFERENCES, 'utf8'));
  let failures = 0;
  for (const ref of references) {
    const problems = [];
    let notes = [];
    try {
      const recipe = await fetchRecipe(ref.url);
      notes = recipe.notes;
      const markdown = buildMarkdown({
        title: ref.title ?? recipe.name,
        slug: 'check',
        description: '',
        steps: recipe.steps,
        ingredients: recipe.ingredients,
        persons: recipe.persons,
        minutes: recipe.minutes,
        rest: ref.rest,
        tips: recipe.tips,
        url: ref.url,
      });
      const lines = new Set(markdown.split('\n'));
      for (const line of ref.expect ?? []) {
        if (!lines.has(line)) problems.push(`ligne absente : ${line}`);
      }
      for (const text of ref.absent ?? []) {
        if (markdown.includes(text)) problems.push(`texte inattendu : ${text}`);
      }
      if (ref.tags !== undefined) {
        const tags = guessTags(
          `${ref.title ?? recipe.name} ${recipe.ingredients.join(' ')}`,
          recipe.ingredients,
          recipe.categoryText,
        ).join(',');
        if (tags !== ref.tags) problems.push(`tags devinés : ${tags}`);
      }
      if (ref.slug !== undefined) {
        const slug = slugify(ref.title ?? recipe.name);
        if (slug !== ref.slug) problems.push(`slug : ${slug}`);
      }
      if (ref.tips !== undefined && recipe.tips.length !== ref.tips) {
        problems.push(`astuces : ${recipe.tips.length} au lieu de ${ref.tips}`);
      }
      if (ref.square !== undefined || ref.cropShifted !== undefined) {
        const photo = await preparePhoto(
          photoCandidates(recipe.recipe, recipe.html),
          true,
          null,
        );
        if (ref.square !== undefined && photo.square !== ref.square) {
          problems.push(photo.square ? 'photo carrée' : 'photo non carrée');
        }
        if (ref.cropShifted !== undefined) {
          const shifted =
            Math.max(
              Math.abs(photo.area.left - photo.centered.left),
              Math.abs(photo.area.top - photo.centered.top),
            ) > 10;
          if (shifted !== ref.cropShifted) {
            problems.push(
              shifted
                ? 'recadrage décalé sur le plat'
                : 'recadrage centré sur l’image',
            );
          }
        }
      }
    } catch (error) {
      problems.push(`erreur : ${error.message}`);
    }
    if (problems.length) failures++;
    console.log(`${problems.length ? 'ÉCHEC' : 'OK   '} ${ref.why}`);
    for (const problem of problems) console.log(`      - ${problem}`);
    for (const note of notes) console.log(`      remarque : ${note}`);
  }
  console.log(`\n${references.length - failures}/${references.length} OK`);
  if (failures) process.exitCode = 1;
}

(opts.check ? runChecks() : importRecipe(positionals[0])).catch((error) => {
  console.error(`Erreur : ${error.message}`);
  process.exit(1);
});
