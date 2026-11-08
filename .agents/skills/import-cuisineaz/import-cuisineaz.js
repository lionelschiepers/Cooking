/**
 * Imports a cuisineaz.com recipe into this site.
 *
 *   node .agents/skills/import-cuisineaz/import-cuisineaz.js "<cuisineaz url>" [options]
 *
 * CuisineAZ renders the recipe as schema.org Recipe JSON-LD in the page, so no
 * browser is needed. Writes recipes/<slug>/recipe.md,
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
const PHOTO_SIZE = '4000x4000';

const USAGE = `Usage: node .agents/skills/import-cuisineaz/import-cuisineaz.js "<url>" [options]
       node .agents/skills/import-cuisineaz/import-cuisineaz.js --check

  --slug <slug>        Folder and id (default: from the title)
  --title <text>       Title (default: the page name in title case)
  --description <text> recipes.json description
  --tags <a,b>         Comma-separated tags (default: guessed)
  --date <YYYY/MM/DD>  Date (default: today)
  --no-crop            Keep the photo uncropped
  --crop-left <px>     Force the left edge of the square crop
  --no-tips            Do not write the FAQ as an "Astuce" section
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

// CuisineAZ steps can point to photos the site does not show.
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
function findJsonObjects(html) {
  const objects = [];
  for (const match of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }
    objects.push(...(Array.isArray(data) ? data : (data['@graph'] ?? [data])));
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
  throw new Error('Aucune recette schema.org trouvée dans la page CuisineAZ.');
}

function findFaq(html) {
  const faq = findJsonObjects(html).find(
    (object) => object['@type'] === 'FAQPage',
  );
  return (faq?.mainEntity ?? [])
    .map((entry) => ({
      question: cleanText(entry.name),
      answer: cleanText(entry.acceptedAnswer?.text),
    }))
    .filter((entry) => entry.question && entry.answer);
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
  return quantity.replace(/(\d),(\d)/, '$1.$2');
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

const COUNT_UNITS = new Set(['pièce', 'piece', 'pc', 'unité', 'unite']);
const METRIC_UNITS = {
  g: 'g',
  gr: 'g',
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
const ALL_UNITS = new Set([
  ...COUNT_UNITS,
  ...Object.keys(METRIC_UNITS),
  ...CONTAINER_UNITS,
  ...Object.keys(SPOON_UNITS),
]);

function unitKey(text) {
  return text
    .toLowerCase()
    .replace(/\(s\)$/i, '')
    .replace(/\.$/, '')
    .trim();
}

/** Recognises a unit, including its plural form (`gousses` → `gousse`). */
function unitOf(token) {
  const key = unitKey(token);
  if (ALL_UNITS.has(key)) return key;
  const singular = key.replace(/s$/i, '');
  return ALL_UNITS.has(singular) ? singular : null;
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

/** CuisineAZ writes ingredients as `<quantity> <unit> <Name>`, Name capitalised. */
function cleanName(text) {
  let name = text.replace(/\(s\)/gi, '').replace(/\s+/g, ' ').trim();
  if (name && name === name.toUpperCase()) name = name.toLowerCase();
  return lowerFirst(name);
}

/** `1 gousse(s) Gousse(s) de vanille` repeats the unit: keep it once. */
function stripRepeatedUnit(name, unit) {
  if (!unit || !name) return name;
  const stem = unit.replace(/s$/i, '');
  const pattern = new RegExp(
    `^${escapeRegExp(stem)}(?:s|es)?\\s+(?:de\\s+|des\\s+|d['’])`,
    'i',
  );
  return name.replace(pattern, '');
}

const QUANTITY = /^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s+(.*)$/;
const SPOON =
  /^(c\.?\s*à\s*s\.?|c\.?\s*à\s*soupe|cuillères?\s+à\s+soupe|cs)\s+(.*)$/i;
const TEASPOON =
  /^(c\.?\s*à\s*c\.?|c\.?\s*à\s*café|cuillères?\s+à\s+café|cc)\s+(.*)$/i;

function formatIngredient(line) {
  const text = line.trim().replace(/\s+/g, ' ');
  const match = text.match(QUANTITY);
  if (!match) return { text: cleanName(text), hasQuantity: false };
  const quantity = normalizeQuantity(match[1]);
  const value = quantityValue(quantity);
  let rest = match[2].trim();
  let unit = '';
  let name;

  const spoon = rest.match(SPOON);
  const teaspoon = rest.match(TEASPOON);
  if (spoon) {
    unit = 'cs';
    name = cleanName(spoon[2]);
  } else if (teaspoon) {
    unit = 'cc';
    name = cleanName(teaspoon[2]);
  } else {
    const maybeUnit = rest.match(/^(\S+)\s+(.*)$/);
    const found = maybeUnit ? unitOf(maybeUnit[1]) : null;
    if (found) {
      unit = found;
      name = cleanName(maybeUnit[2]);
    } else {
      name = cleanName(rest);
    }
  }

  name = stripRepeatedUnit(name, unit);

  if (COUNT_UNITS.has(unit) || !unit) {
    if (!Number.isFinite(value)) {
      return {
        text: lowerFirst([quantity, name].filter(Boolean).join(' ')),
        hasQuantity: true,
      };
    }
    name = value < 2 ? singular(name) : plural(name);
    return {
      text: [formatQuantity(quantity), name].filter(Boolean).join(' '),
      hasQuantity: true,
    };
  }

  const metric = METRIC_UNITS[unit];
  if (metric) {
    return {
      text: [formatQuantity(quantity), metric, withDe(name)]
        .filter(Boolean)
        .join(' '),
      hasQuantity: true,
    };
  }

  const spoonUnit = SPOON_UNITS[unit];
  if (spoonUnit) {
    return {
      text: [
        formatQuantity(quantity),
        value >= 2 ? spoonUnit.plural : spoonUnit.singular,
        withDe(name),
      ]
        .filter(Boolean)
        .join(' '),
      hasQuantity: true,
    };
  }

  if (CONTAINER_UNITS.has(unit)) {
    return {
      text: [formatQuantity(quantity), pluralUnit(unit, value), withDe(name)]
        .filter(Boolean)
        .join(' '),
      hasQuantity: true,
    };
  }

  return {
    text: [formatQuantity(quantity), unit, withDe(name)]
      .filter(Boolean)
      .join(' '),
    hasQuantity: true,
  };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSpoons(phrase) {
  return phrase
    .replace(/\bc\.\s*à\s*soupe\b/gi, 'cuillère à soupe')
    .replace(/\bc\.\s*à\s*café\b/gi, 'cuillère à café')
    .replace(/\bc\.\s*à\s*s\.?\b/gi, 'cuillère à soupe')
    .replace(/\bc\.\s*à\s*c\.?\b/gi, 'cuillère à café')
    .replace(/\bcs\b/gi, 'cuillère à soupe')
    .replace(/\bcc\b/gi, 'cuillère à café')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Spacing and typography fixes common in CuisineAZ steps. */
function tidyStep(text) {
  return text
    .replace(/(\d)\s*°\s*C\b/gi, '$1 °C')
    .replace(/\b(th|thermostat)\.?\s*(\d)/gi, '$1. $2')
    .replace(
      /\b(\d+(?:[.,]\d+)?)\s*(?:c\.\s*à\s*soupe|c\.\s*à\s*s\.?|cs)(?=\s|$)/gi,
      (_, quantity) =>
        `${quantity} ${Number(quantity) >= 2 ? 'cuillères' : 'cuillère'} à soupe`,
    )
    .replace(
      /\b(\d+(?:[.,]\d+)?)\s*(?:c\.\s*à\s*café|c\.\s*à\s*c\.?|cc)(?=\s|$)/gi,
      (_, quantity) =>
        `${quantity} ${Number(quantity) >= 2 ? 'cuillères' : 'cuillère'} à café`,
    )
    .replace(/([\p{L}\d])\s*\(/gu, '$1 (')
    .replace(/\)\s*\(/g, ') (')
    .replace(/\bpuis,\s+/gi, 'puis ')
    .replace(/(^|[.!?]\s+)A\s+/g, '$1À ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const STEP_QUANTITY =
  /(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s+(cuillères?\s+à\s+soupe|cuillères?\s+à\s+café|c\.\s*à\s+soupe|c\.\s*à\s+café|c\.\s*à\s*s\.?|c\.\s*à\s*c\.?|cs|cc|g|kg|mg|ml|cl|dl|l|pincées?|gousses?|sachets?|boîtes?|tranches?|brins?|branches?)\s+(?:de\s+|d['’])?([\p{L}][\p{L}'-]*)/giu;

/**
 * CuisineAZ sometimes leaves an ingredient without quantity (`Rhum`) while a
 * step gives one (`1 c. à soupe de rhum`): reuse the step's measure.
 */
function fillMissingQuantities(ingredients, steps) {
  const notes = [];
  const lines = ingredients.map((ingredient) => {
    if (ingredient.hasQuantity) return ingredient.text;
    const key = ingredient.text
      .replace(/\([^)]*\)/g, '')
      .trim()
      .split(/\s+/)[0];
    if (!key) return ingredient.text;
    for (const step of steps) {
      for (const match of step.matchAll(STEP_QUANTITY)) {
        if (match[3].toLowerCase() !== key.toLowerCase()) continue;
        return normalizeSpoons(match[0]);
      }
    }
    notes.push(`Ingrédient sans quantité : « ${ingredient.text} »`);
    return ingredient.text;
  });
  return { lines, notes };
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
const ASIAN =
  /nouilles|udon|ramen|wok|teriyaki|sriracha|gochujang|coréen|thaï|japonais|chinois|vietnamien|curry|hoisin|asiatique/;

/** Pasta names in a text, to notice a title and an ingredient list that disagree. */
function pastaNames(text) {
  const lower = text.toLowerCase();
  return PASTA_NAMES.filter((name) => lower.includes(name));
}

const CATEGORY_TAGS = [
  ['Dessert', /\bdesserts?\b|\bpatisseries?\b|\bpâtisseries?\b|\bflans?\b/i],
  ['Entrée', /\bentrées?\b/i],
  ['Apéro', /\bapéritifs?\b|\baperitifs?\b/i],
  ['Salade', /\bsalades?\b/i],
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

/** Largest source photo: CuisineAZ returns the original for a big enough box. */
function photoCandidates(recipe) {
  const image = Array.isArray(recipe.image) ? recipe.image[0] : recipe.image;
  if (!image) return [];
  const large = image.replace(/\/\d+x\d+\//, `/${PHOTO_SIZE}/`);
  return [...new Set([large, image])];
}

/**
 * Crops a square of the shorter side, centred on the dish rather than on the
 * image: CuisineAZ hero photos are landscape close-ups, and the food is not
 * always centred inside the frame.
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

/** "Name, subtitle", or "Name et ..." when the subtitle already starts with "et". */
function withSubtitle(name, subtitle) {
  if (!subtitle) return name;
  const tail = lowerFirst(subtitle);
  return /^et\s/i.test(tail) ? `${name} ${tail}` : `${name}, ${tail}`;
}

function keywordList(name, tags) {
  const words = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return [...new Set([...words, ...tags.map((tag) => tag.toLowerCase())])];
}

function buildMarkdown({
  title,
  slug,
  name,
  description,
  steps,
  ingredients,
  persons,
  minutes,
  tips = [],
  url,
}) {
  const keywords = keywordList(name, []);
  const intro = [/[.!?]$/.test(name) ? name : `${name}.`];
  const duration = formatDuration(minutes);
  if (duration) intro.push(`Prêt en ${duration}.`);

  const lines = [
    '---',
    `title: ${title}`,
    `author: ${AUTHORS}`,
    `keywords: ${AUTHORS}, cooking, recipe, ${keywords.join(', ')}, food, cuisine`,
    '---',
    '',
    `![${lowerFirst(title || name)}](./${slug}.webp)`,
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
      ...tips.map((tip) => `- **${tip.question}** ${tip.answer}`),
    );
  }
  lines.push('', '## Lien', `[CuisineAZ](${url})`, '');
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
    if (/\b(voir|cf\.?|photo)\b/i.test(ingredient)) {
      notes.push(`Ingrédient renvoie à une note : « ${ingredient} »`);
    }
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

async function fetchRecipe(url) {
  const pageUrl = new URL(url);
  if (!/(^|\.)cuisineaz\.com$/i.test(pageUrl.hostname)) {
    throw new Error(`Pas une adresse CuisineAZ : ${url}`);
  }

  const html = await get(url);
  const recipe = findRecipeJson(html);
  const name = cleanText(recipe.name?.trim());
  if (!name) throw new Error('Nom de la recette introuvable.');
  const description = cleanText(recipe.description ?? '');
  const total = totalMinutes(recipe.totalTime);
  const minutes =
    total ??
    ((totalMinutes(recipe.prepTime) ?? 0) +
      (totalMinutes(recipe.cookTime) ?? 0) ||
      null);
  const persons = servingsOf(recipe.recipeYield);
  const parsedIngredients = (recipe.recipeIngredient ?? [])
    .map((line) => formatIngredient(cleanText(line)))
    .filter((ingredient) => ingredient.text);
  const steps = instructionTexts(recipe.recipeInstructions)
    .map((text) => tidyStep(withoutStepPhotos(cleanText(text))))
    .filter(Boolean);
  const { lines: ingredients, notes: ingredientNotes } = fillMissingQuantities(
    parsedIngredients,
    steps,
  );
  const tips = opts['no-tips'] ? [] : findFaq(html);
  const categoryText = [recipe.recipeCategory, recipe.keywords]
    .flat()
    .filter(Boolean)
    .join(' ');

  const notes = inspect({
    name,
    ingredients,
    steps,
    minutes,
    persons,
    notes: ingredientNotes,
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
    description,
    minutes,
    persons: persons ?? 2,
    ingredients,
    steps,
    tips,
    categoryText,
    notes,
  };
}

/** Folder of a recipe whose link is the same CuisineAZ page, if any. */
function importedAs(url) {
  const id = url.match(/-(\d+)\.aspx(?:[/?#]|$)/i)?.[1];
  if (!id) return null;
  for (const entry of fs.readdirSync(RECIPES_DIR, { withFileTypes: true })) {
    const file = path.join(RECIPES_DIR, entry.name, 'recipe.md');
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    if (fs.readFileSync(file, 'utf8').includes(`-${id}.aspx`)) {
      return entry.name;
    }
  }
  return null;
}

async function importRecipe(url) {
  const data = await fetchRecipe(url);
  const notes = [...data.notes];

  const title = opts.title ?? titleCase(data.name);
  const slug = opts.slug ?? slugify(data.name);
  const description = opts.description ?? `${data.name} (CuisineAZ)`;
  const tags = opts.tags
    ? opts.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : guessTags(
        `${data.name} ${data.ingredients.join(' ')}`,
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

  const urls = photoCandidates(data.recipe);
  if (!urls.length) throw new Error('Photo CuisineAZ introuvable.');
  const photo = await preparePhoto(urls, !opts['no-crop'], opts['crop-left']);
  if (!opts['no-crop'] && !photo.square) {
    notes.push('Le recadrage n’est pas carré : vérifiez l’aperçu.');
  }
  const preview = path.join(os.tmpdir(), `cuisineaz-${slug}-square.png`);
  await writeSquarePreview(photo.webp, preview);

  const markdown = buildMarkdown({
    title,
    slug,
    name: data.name,
    description: data.description,
    steps: data.steps,
    ingredients: data.ingredients,
    persons: data.persons,
    minutes: data.minutes,
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
  source   : page CuisineAZ (JSON-LD)
  portions : ${data.persons}
  temps    : ${data.minutes ?? '?'} minutes
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
        title: '',
        slug: 'check',
        name: recipe.name,
        description: recipe.description,
        steps: recipe.steps,
        ingredients: recipe.ingredients,
        persons: recipe.persons,
        minutes: recipe.minutes,
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
          `${recipe.name} ${recipe.ingredients.join(' ')}`,
          recipe.ingredients,
          recipe.categoryText,
        ).join(',');
        if (tags !== ref.tags) problems.push(`tags devinés : ${tags}`);
      }
      if (ref.slug !== undefined) {
        const slug = slugify(recipe.name);
        if (slug !== ref.slug) problems.push(`slug : ${slug}`);
      }
      if (ref.tips !== undefined && recipe.tips.length !== ref.tips) {
        problems.push(`astuces : ${recipe.tips.length} au lieu de ${ref.tips}`);
      }
      if (ref.square !== undefined || ref.cropShifted !== undefined) {
        const photo = await preparePhoto(
          photoCandidates(recipe.recipe),
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
