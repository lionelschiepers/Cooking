/**
 * Imports a hellofresh.be recipe into this site.
 *
 *   node .agents/skills/import-hellofresh/import-hellofresh.js "<hellofresh url>" [options]
 *
 * HelloFresh renders the recipe as schema.org Recipe JSON-LD in the page, so
 * no browser is needed. Writes recipes/<slug>/recipe.md,
 * recipes/<slug>/<slug>.webp (cropped to a square around the plate, like the
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

const USAGE = `Usage: node .agents/skills/import-hellofresh/import-hellofresh.js "<url>" [options]
       node .agents/skills/import-hellofresh/import-hellofresh.js --check

  --slug <slug>        Folder and id (default: from the title)
  --title <text>       Title (default: the page name in title case)
  --description <text> recipes.json description
  --tags <a,b>         Comma-separated tags (default: guessed)
  --date <YYYY/MM/DD>  Date (default: today)
  --no-crop            Keep the photo uncropped
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
    'no-crop': { type: 'boolean', default: false },
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

/**
 * HelloFresh wraps some steps in HTML lists and paragraphs. Turns them into
 * readable prose (bold and italics kept as Markdown) and decodes entities.
 */
function cleanText(text) {
  if (!text) return '';
  const withoutTags = String(text)
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<\s*\/\s*(?:p|li|ul|ol|div|h[1-6])\s*>/gi, ' ')
    .replace(/<\s*(?:strong|b)\s*>/gi, '**')
    .replace(/<\s*\/\s*(?:strong|b)\s*>/gi, '**')
    .replace(/<\s*(?:em|i)\s*>/gi, '*')
    .replace(/<\s*\/\s*(?:em|i)\s*>/gi, '*')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return decodeEntities(withoutTags)
    .replace(/\s+\*\*/g, '**')
    .replace(/\s+/g, ' ')
    .trim();
}

// HelloFresh points to step photos this site does not show: "(voir photo)" is
// removed, "(voir conseil et photo)" becomes "(voir conseil)".
const SEE = /\s*\((?:voir|cf\.?)\s+([^)]*)\)/gi;
const PHOTO = /^(?:la |les )?(?:photos?|images?)(?:\s+\d+)?$/i;
function withoutStepPhotos(text) {
  return text.replace(SEE, (match, what) => {
    const parts = what.split(/\s+et\s+|,\s*/);
    const kept = parts.filter((part) => !PHOTO.test(part.trim()));
    if (kept.length === parts.length) return match;
    return kept.length ? ` (voir ${kept.join(' et ')})` : '';
  });
}

/** The recipe is a schema.org Recipe object among the page's JSON-LD scripts. */
function findRecipeJson(html) {
  for (const match of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const objects = Array.isArray(data) ? data : (data['@graph'] ?? [data]);
    const recipe = objects.find(
      (object) =>
        object['@type'] === 'Recipe' ||
        (Array.isArray(object['@type']) && object['@type'].includes('Recipe')),
    );
    if (recipe) return recipe;
  }
  throw new Error('Aucune recette schema.org trouvée dans la page HelloFresh.');
}

function pageText(html, testId) {
  const match = html.match(
    new RegExp(`data-test-id="${testId}"[^>]*>([^<]*)<`, 'i'),
  );
  return match ? decodeEntities(match[1]).trim() : '';
}

function instructionTexts(instructions = []) {
  const texts = [];
  for (const step of instructions) {
    if (typeof step === 'string') texts.push(step);
    else if (step['@type'] === 'HowToSection') {
      texts.push(...instructionTexts(step.itemListElement ?? step.steps ?? []));
    } else if (step.text) texts.push(step.text);
  }
  return texts;
}

function totalMinutes(iso) {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/i.exec(iso ?? '');
  if (!match) return null;
  const [, days, hours, minutes] = match.map((value) => Number(value) || 0);
  return days * 24 * 60 + hours * 60 + minutes;
}

function servingsOf(value) {
  const first = Array.isArray(value) ? value[0] : value;
  const number = parseInt(String(first), 10);
  return Number.isFinite(number) ? number : null;
}

const UNICODE_FRACTIONS = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅐': '1/7',
  '⅑': '1/9',
  '⅒': '1/10',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

function normalizeQuantity(text) {
  let quantity = text
    .trim()
    .replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (f) => UNICODE_FRACTIONS[f]);
  quantity = quantity.replace(
    /(\d)([¼½¾])/g,
    (_, whole, fraction) => `${whole} ${UNICODE_FRACTIONS[fraction]}`,
  );
  quantity = quantity.replace(/(\d),(\d)/, '$1.$2');
  return quantity;
}

const FRACTIONS = {
  0.25: '1/4',
  0.33: '1/3',
  0.5: '1/2',
  0.67: '2/3',
  0.75: '3/4',
};

function formatQuantity(quantity) {
  if (quantity == null || quantity === '' || quantity === 'null') return '';
  const n = Number(quantity);
  if (!Number.isFinite(n)) return String(quantity);
  const whole = Math.trunc(n);
  const rest = Math.round((n - whole) * 100) / 100;
  if (!rest) return String(whole);
  if (!FRACTIONS[rest]) return String(n).replace('.', ',');
  return whole ? `${whole} ${FRACTIONS[rest]}` : FRACTIONS[rest];
}

/** "1.5", "1/2" or "1 1/2" as a number (NaN when it is not a quantity). */
function quantityValue(quantity) {
  const [whole, fraction] = String(quantity)
    .replace(',', '.')
    .trim()
    .match(/^(?:(\d+(?:\.\d+)?)\s*)?(?:(\d+\/\d+))?$/)
    ?.slice(1) ?? [NaN];
  if (whole === undefined && fraction === undefined) return NaN;
  const [num, den] = (fraction ?? '0/1').split('/').map(Number);
  return Number(whole ?? 0) + num / den;
}

const COUNT_UNITS = new Set([
  'pièce',
  'piece',
  'pc',
  'stuk',
  'stuks',
  'unité',
  'unite',
]);
const METRIC_UNITS = {
  g: 'gr',
  gr: 'gr',
  kg: 'kg',
  mg: 'mg',
  ml: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l',
};
const CONTAINER_UNITS = new Set([
  'boîte',
  'boite',
  'bouquet',
  'botte',
  'branche',
  'brin',
  'bocal',
  'barquette',
  'cube',
  'feuille',
  'filet',
  'gousse',
  'paquet',
  'pincée',
  'pincee',
  'pot',
  'portion',
  'sachet',
  'tige',
  'tranche',
]);
const SPOON_UNITS = {
  cs: { singular: 'cuillère à soupe', plural: 'cuillères à soupe' },
  cc: { singular: 'cuillère à café', plural: 'cuillères à café' },
};
// HelloFresh writes count units as "pièce(s)", "boîte(s)".
const UNIT = /^([a-zà-ÿ]+)(?:\(s\))?\.?$/i;
const TO_TASTE = /^(à votre convenance|selon (?:votre )?goût|au goût)\s+/i;

function unitKey(text) {
  return text
    .toLowerCase()
    .replace(/\(s\)$/i, '')
    .replace(/\.$/, '');
}

function lowerFirst(text) {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function withDe(name) {
  return /^([aeiouyâàéèêëîïôûù]|huile|herbe)/i.test(name)
    ? `d'${name}`
    : `de ${name}`;
}

const PREPOSITION = /^(de|des|du|d'.*|d’.*|à|au|aux|en)$/i;
function singular(name) {
  const words = name.split(' ');
  const end = words.findIndex((word) => PREPOSITION.test(word));
  return words
    .map((word, i) =>
      end !== -1 && i >= end
        ? word
        : word.replace(/eaux$/i, 'eau').replace(/([^aiouïs])s$/i, '$1'),
    )
    .join(' ');
}

function plural(name) {
  if (/\s(&|et|e)\s/i.test(name)) return name;
  const words = name.split(' ');
  const end = words.findIndex((word) => PREPOSITION.test(word));
  return words
    .map((word, i) => {
      if ((end !== -1 && i >= end) || !/^\p{Ll}[\p{Ll}']*$/u.test(word)) {
        return word;
      }
      if (/[sxz]$/i.test(word)) return word;
      if (/^chou$|e?au$/i.test(word)) return `${word}x`;
      return i > 0 && /i$/i.test(word) ? word : `${word}s`;
    })
    .join(' ');
}

function pluralUnit(unit, value) {
  return value >= 2 ? `${unit}s` : unit;
}

/** Turns "½ boîte(s) Cubes de tomates" into "1/2 boîte de cubes de tomates". */
function formatIngredient(line) {
  const text = line.trim();
  const toTaste = text.match(TO_TASTE);
  if (toTaste) {
    return lowerFirst(text.slice(toTaste[0].length).trim());
  }

  const parts = text.match(/^(\S+)\s+(.*)$/);
  if (!parts) return lowerFirst(text);
  const quantity = normalizeQuantity(parts[1]);
  const value = quantityValue(quantity);
  let rest = parts[2].trim();
  let unit = '';
  const maybeUnit = rest.match(/^(\S+)\s+(.*)$/);
  if (maybeUnit && UNIT.test(maybeUnit[1]) && /^[a-zà-ÿ(]/.test(maybeUnit[1])) {
    unit = unitKey(maybeUnit[1]);
    rest = maybeUnit[2].trim();
  }
  let name = lowerFirst(rest);

  if (COUNT_UNITS.has(unit) || !unit) {
    if (!Number.isFinite(value))
      return [quantity, name].filter(Boolean).join(' ');
    name = value < 2 ? singular(name) : plural(name);
    return [formatQuantity(quantity), name].filter(Boolean).join(' ');
  }

  const metric = METRIC_UNITS[unit];
  if (metric)
    return [formatQuantity(quantity), metric, name].filter(Boolean).join(' ');

  const spoon = SPOON_UNITS[unit];
  if (spoon) {
    return [
      formatQuantity(quantity),
      value >= 2 ? spoon.plural : spoon.singular,
      withDe(name),
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (CONTAINER_UNITS.has(unit)) {
    return [formatQuantity(quantity), pluralUnit(unit, value), withDe(name)]
      .filter(Boolean)
      .join(' ');
  }

  return [formatQuantity(quantity), unit, withDe(name)]
    .filter(Boolean)
    .join(' ');
}

/** Delivered items first, salt and pepper last, otherwise the HelloFresh order. */
function sortIngredients(ingredients) {
  const rank = (line) => (/\b(sel|poivre)\b/i.test(line) ? 1 : 0);
  return ingredients
    .map((line, index) => ({ line, index }))
    .sort((a, b) => rank(a.line) - rank(b.line) || a.index - b.index)
    .map(({ line }) => line);
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
  /porc|b(œ|oe)uf|veau|agneau|canard|saucisse|haché|lard|jambon|poulet|dinde|chorizo|steak|pancetta|bacon|mignon|merguez|chipolata|volaille|salami|prosciutto|coppa|speck|gyros|kebab|boulette|viande/;
const PASTA =
  /pâtes|pates|spaghetti|tagliatelle|penne|orzo|linguine|lasagne|gnocchi|fusilli|rigatoni|farfalle|macaroni|fettuccine|ravioli|tortell[io]ni?s?|conchiglie/;
const PASTA_NAMES = [
  'tagliatelle',
  'spaghetti',
  'penne',
  'linguine',
  'lasagne',
  'gnocchi',
  'fusilli',
  'rigatoni',
  'farfalle',
  'macaroni',
  'fettuccine',
  'ravioli',
  'tortellini',
  'tortelloni',
  'conchiglie',
];

/** Pasta names in a text, to notice a title and an ingredient list that disagree. */
function pastaNames(text) {
  const lower = text.toLowerCase();
  return PASTA_NAMES.filter((name) => lower.includes(name));
}
const ASIAN =
  /nouilles|udon|ramen|wok|teriyaki|sriracha|gochujang|coréen|thaï|japonais|chinois|vietnamien|curry/;

function guessTags(text, ingredients = []) {
  const t = text.toLowerCase();
  const items = ingredients.join(' | ').toLowerCase();
  const tags = [];
  if (FISH.test(t) || FISH.test(items)) tags.push('Poisson');
  if (MEAT.test(t) || MEAT.test(items)) tags.push('Viande');
  if (PASTA.test(t) || PASTA.test(items)) tags.push('Pates');
  if (ASIAN.test(t)) tags.push('Asiatique');
  return tags;
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/**
 * Crops a centred square of the shorter side. HelloFresh hero photos are 3:2
 * landscape with the dish in the middle, so this keeps the whole plate instead
 * of the Foodbag circle detector, which found an inner circle on an angled bowl
 * and cut the rim.
 */
async function preparePhoto(url, crop) {
  const buffer = await get(url, 'buffer');
  const meta = await sharp(buffer).metadata();
  const [width, height] =
    (meta.orientation ?? 1) >= 5
      ? [meta.height, meta.width]
      : [meta.width, meta.height];

  let area = { left: 0, top: 0, width, height };
  let note = 'photo gardée entière (--no-crop)';
  if (crop) {
    const side = Math.min(width, height);
    area = {
      left: Math.round((width - side) / 2),
      top: Math.round((height - side) / 2),
      width: side,
      height: side,
    };
    note = `carré centré ${area.width}x${area.height} depuis (${area.left}, ${area.top})`;
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
  return {
    webp: webp.data,
    size: [webp.info.width, webp.info.height],
    note,
    square: webp.info.width === webp.info.height,
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

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** JSON-LD gives a 1200 px image; the page often has a 3840 px version of it. */
function photoUrl(html, recipe) {
  const jsonImage = Array.isArray(recipe.image)
    ? recipe.image[0]
    : recipe.image;
  const candidates = [];
  const file = jsonImage?.match(
    /\/([^/?#]+\.(?:jpe?g|png|webp))(?:\?|$)/i,
  )?.[1];
  if (file) {
    const pattern = new RegExp(
      `https://[^"'\\s]*${escapeRegExp(file)}[^"'\\s]*`,
      'gi',
    );
    candidates.push(...[...html.matchAll(pattern)].map((match) => match[0]));
  }
  if (jsonImage) candidates.push(jsonImage);
  const widthOf = (url) => Number(url.match(/(?:^|[,/])w_(\d+)/)?.[1] ?? 0);
  return candidates.sort((a, b) => widthOf(b) - widthOf(a))[0] ?? null;
}

/** "Name, subtitle", or "Name et ..." when the subtitle already starts with "et". */
function withSubtitle(name, subtitle) {
  if (!subtitle) return name;
  const tail = lowerFirst(subtitle);
  return /^et\s/i.test(tail) ? `${name} ${tail}` : `${name}, ${tail}`;
}

function buildMarkdown({
  title,
  slug,
  name,
  subtitle,
  description,
  steps,
  ingredients,
  persons,
  minutes,
  url,
}) {
  const keywords = [name, subtitle]
    .join(', ')
    .toLowerCase()
    .split(/\s*,\s*(?:et\s+)?|\s+et\s+/)
    .filter(Boolean);
  const intro = [`${withSubtitle(name, subtitle)}.`];
  if (minutes) intro.push(`Prêt en ${minutes} minutes.`);

  const lines = [
    '---',
    `title: ${title}`,
    `author: ${AUTHORS}`,
    `keywords: ${AUTHORS}, cooking, recipe, ${keywords.join(', ')}, food, cuisine`,
    '---',
    '',
    `![${lowerFirst(name)}](./${slug}.webp)`,
    '',
    intro.join(' '),
  ];
  if (description) lines.push('', description);
  lines.push(
    '',
    `## Ingrédients (${persons} ${persons > 1 ? 'personnes' : 'personne'})`,
    ...sortIngredients(ingredients).map((line) => `- ${line}`),
    '',
    '## Préparation',
    steps.map((step, i) => `${i + 1}. ${step}`).join('\n\n'),
    '',
    '## Lien',
    `[HelloFresh](${url})`,
    '',
  );
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
  subtitle,
  description,
  ingredients,
  steps,
  minutes,
  persons,
}) {
  const notes = [];
  if (!name) notes.push('Nom absent.');
  if (!ingredients.length) notes.push('Aucun ingrédient.');
  if (!steps.length) notes.push('Aucune étape de préparation.');
  if (!minutes) notes.push('Temps total absent.');
  if (!persons) notes.push('Nombre de portions absent.');
  if (!description) notes.push('Description absente.');
  for (const ingredient of ingredients) {
    if (!ingredient.trim()) notes.push('Ingrédient vide.');
    if (/\b(voir|cf\.?|photo)\b/i.test(ingredient)) {
      notes.push(`Ingrédient renvoie à une note : « ${ingredient} »`);
    }
  }
  for (const text of [name, subtitle, description, ...ingredients, ...steps]) {
    if (MARKUP.test(text ?? '')) {
      notes.push(
        `HTML ou entité dans le texte : « ${String(text).slice(0, 80)} »`,
      );
      break;
    }
  }
  return notes;
}

async function fetchRecipe(url) {
  const pageUrl = new URL(url);
  if (!/(^|\.)hellofresh\./i.test(pageUrl.hostname)) {
    throw new Error(`Pas une adresse HelloFresh : ${url}`);
  }

  const html = await get(url);
  const recipe = findRecipeJson(html);
  const name = cleanText(pageText(html, 'recipe-name') || recipe.name?.trim());
  if (!name) throw new Error('Nom de la recette introuvable.');
  const subtitle = cleanText(pageText(html, 'recipe-headline'));
  const description = cleanText(recipe.description ?? '');
  const minutes = totalMinutes(recipe.totalTime);
  const persons = servingsOf(recipe.recipeYield);
  const ingredients = (recipe.recipeIngredient ?? [])
    .map((line) => formatIngredient(cleanText(line)))
    .filter(Boolean);
  const steps = instructionTexts(recipe.recipeInstructions)
    .map((text) => withoutStepPhotos(cleanText(text)))
    .filter(Boolean);

  const notes = inspect({
    name,
    subtitle,
    description,
    ingredients,
    steps,
    minutes,
    persons,
  });
  const titlePasta = pastaNames(name);
  const ingredientPasta = [...new Set(ingredients.flatMap(pastaNames))];
  const otherPasta = ingredientPasta.filter(
    (pasta) => !titlePasta.includes(pasta),
  );
  if (titlePasta.length && otherPasta.length) {
    notes.push(
      `Pâtes différentes entre le titre (${titlePasta.join(', ')}) et les ingrédients (${otherPasta.join(', ')}) : vérifiez.`,
    );
  }
  return {
    recipe,
    html,
    name,
    subtitle,
    description,
    minutes,
    persons: persons ?? 2,
    ingredients,
    steps,
    notes,
  };
}

/** Folder of a recipe whose link is the same HelloFresh page, if any. */
function importedAs(url) {
  const id = url.match(/-([a-f0-9]{24})(?:[/?#]|$)/i)?.[1];
  if (!id) return null;
  for (const entry of fs.readdirSync(RECIPES_DIR, { withFileTypes: true })) {
    const file = path.join(RECIPES_DIR, entry.name, 'recipe.md');
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    if (fs.readFileSync(file, 'utf8').includes(id)) return entry.name;
  }
  return null;
}

async function importRecipe(url) {
  const data = await fetchRecipe(url);
  const notes = [...data.notes];

  const title = opts.title ?? titleCase(data.name);
  const slug = opts.slug ?? slugify(data.name);
  const description =
    opts.description ??
    `${withSubtitle(data.name, data.subtitle)} (HelloFresh)`;
  const tags = opts.tags
    ? opts.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : guessTags(
        `${data.name} ${data.subtitle} ${data.ingredients.join(' ')}`,
        data.ingredients,
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

  const imageUrl = photoUrl(data.html, data.recipe);
  if (!imageUrl) throw new Error('Photo HelloFresh introuvable.');
  const photo = await preparePhoto(imageUrl, !opts['no-crop']);
  if (!opts['no-crop'] && !photo.square) {
    notes.push('Le recadrage n’est pas carré : vérifiez l’aperçu.');
  }
  const preview = path.join(os.tmpdir(), `hellofresh-${slug}-square.png`);
  await writeSquarePreview(photo.webp, preview);

  const markdown = buildMarkdown({
    title,
    slug,
    name: data.name,
    subtitle: data.subtitle,
    description: data.description,
    steps: data.steps,
    ingredients: data.ingredients,
    persons: data.persons,
    minutes: data.minutes,
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
  source   : page HelloFresh (JSON-LD)
  portions : ${data.persons}
  temps    : ${data.minutes ?? '?'} minutes
  tags     : ${tags.join(', ') || '(aucun)'}
  photo    : ${photo.size.join('x')}, ${photo.note}
  carré    : ${preview}`);
  if (notes.length) {
    console.log(
      `\nÀ vérifier (voir « Keep this skill up to date » dans SKILL.md) :\n${notes.map((note) => `  - ${note}`).join('\n')}`,
    );
  }
}

/** Re-reads every reference recipe (nothing is written) and checks the lines that prove past fixes. */
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
        title: '',
        slug: 'check',
        name: recipe.name,
        subtitle: recipe.subtitle,
        description: recipe.description,
        steps: recipe.steps,
        ingredients: recipe.ingredients,
        persons: recipe.persons,
        minutes: recipe.minutes,
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
          `${recipe.name} ${recipe.subtitle} ${recipe.ingredients.join(' ')}`,
          recipe.ingredients,
        ).join(',');
        if (tags !== ref.tags) problems.push(`tags devinés : ${tags}`);
      }
      if (ref.square !== undefined) {
        const photo = await preparePhoto(
          photoUrl(recipe.html, recipe.recipe),
          true,
        );
        if (photo.square !== ref.square) {
          problems.push(photo.square ? 'photo carrée' : 'photo non carrée');
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
