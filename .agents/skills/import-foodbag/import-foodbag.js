/**
 * Imports a foodbag.be recipe into this site.
 *
 *   node .agents/skills/import-foodbag/import-foodbag.js "<foodbag url>" [options]
 *
 * Writes recipes/<slug>/recipe.md, recipes/<slug>/<slug>.webp (cropped so the
 * plate sits in the middle of the home page's square thumbnail) and adds the
 * entry to recipes.json. Run with --help for the options.
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
const DEFAULT_COLLECTIONS = { dishes: 'dish', variants: 'dish_variants_v4' };
const MAX_SIDE = 1920;

const USAGE = `Usage: node .agents/skills/import-foodbag/import-foodbag.js "<url>" [options]
       node .agents/skills/import-foodbag/import-foodbag.js --check

  --persons <n>        Servings to import (default 2)
  --slug <slug>        Folder and id (default: from the title)
  --title <text>       Title (default: Foodbag name in title case)
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
    persons: { type: 'string', default: '2' },
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
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} : ${url}`);
  return type === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
}

/** Next.js streams the server data as self.__next_f.push([1, "..."]) chunks. */
function readFlightData(html) {
  const pushes = html.matchAll(
    /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g,
  );
  return [...pushes].map((match) => JSON.parse(match[1])).join('');
}

function readJsonObject(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('Objet JSON incomplet dans la page Foodbag.');
}

/** Pages of the current weeks embed the dish; older weeks only have it in Firestore. */
function findEmbeddedDish(flight, dishId) {
  for (let i = flight.indexOf('{"dish":{'); i !== -1;) {
    const { dish } = readJsonObject(flight, i);
    if (dish?.DishId === dishId) return dish;
    i = flight.indexOf('{"dish":{', i + 1);
  }
  return null;
}

/** The page reads Firestore directly; its public web config sits in the JS chunks. */
async function findFirebaseConfig(html) {
  const base = html.match(
    /(https:\/\/[^"'\s]+?\/_next\/)static\/chunks\//,
  )?.[1];
  const chunks = [...new Set(html.match(/static\/chunks\/[\w%.\-/]+?\.js/g))];
  if (!base || !chunks.length) throw new Error('Scripts Foodbag introuvables.');

  const found = {};
  for (let i = 0; i < chunks.length; i += 8) {
    const scripts = await Promise.all(
      chunks.slice(i, i + 8).map((chunk) => get(base + chunk).catch(() => '')),
    );
    for (const js of scripts) {
      found.apiKey ??= js.match(/apiKey:"(AIza[\w-]+)"/)?.[1];
      found.projectId ??= js.match(/projectId:"([\w-]+)"/)?.[1];
      // Collection names live in one enum, next to other enums with a "Dish" member.
      const collections = js.match(
        /\{[^{}]*\.DishVariantsV4="\w+"[^{}]*\}/,
      )?.[0];
      if (collections) {
        found.variants ??= collections.match(/\.DishVariantsV4="(\w+)"/)?.[1];
        found.dishes ??= collections.match(/\.Dish="(\w+)"/)?.[1];
      }
    }
    if (found.apiKey && found.projectId && found.variants && found.dishes)
      break;
  }
  if (!found.apiKey || !found.projectId) {
    throw new Error('Configuration Firebase de Foodbag introuvable.');
  }
  const defaults = Object.keys(DEFAULT_COLLECTIONS).filter(
    (key) => !found[key],
  );
  for (const key of defaults) found[key] = DEFAULT_COLLECTIONS[key];
  return { ...found, defaults };
}

function fromFirestore(value) {
  const [type, inner] = Object.entries(value)[0];
  switch (type) {
    case 'mapValue':
      return Object.fromEntries(
        Object.entries(inner.fields ?? {}).map(([key, v]) => [
          key,
          fromFirestore(v),
        ]),
      );
    case 'arrayValue':
      return (inner.values ?? []).map(fromFirestore);
    case 'integerValue':
    case 'doubleValue':
      return Number(inner);
    case 'nullValue':
      return null;
    default:
      return inner;
  }
}

const where = (fieldPath, op, value) => ({
  fieldFilter: { field: { fieldPath }, op, value },
});

// Foodbag stores week and year sometimes as numbers, sometimes as strings.
const numberOrString = (n) => ({
  arrayValue: {
    values: [{ integerValue: String(n) }, { stringValue: String(n) }],
  },
});

async function runQuery(config, collectionId, filters) {
  const query = {
    structuredQuery: {
      from: [{ collectionId }],
      where: { compositeFilter: { op: 'AND', filters } },
    },
  };
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents:runQuery?key=${config.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error(`Firestore ${res.status} : ${await res.text()}`);
  const rows = await res.json();
  return rows
    .filter((row) => row.document)
    .map((row) => fromFirestore({ mapValue: row.document }));
}

/** One document per week the dish was on the menu; prefer the week of the link. */
async function fetchDish(config, dishId, week, year) {
  const docs = await runQuery(config, config.dishes, [
    where('DishId', 'EQUAL', { stringValue: dishId }),
  ]);
  if (!docs.length) throw new Error(`Plat ${dishId} introuvable chez Foodbag.`);
  const num = (value) => parseInt(value, 10);
  const clean = (dish) => (/^\d+$/.test(String(dish.WeekNumber)) ? 0 : 1);
  const sameWeek = docs.filter(
    (dish) =>
      num(dish.WeekNumber) === Number(week) &&
      num(dish.YearNumber) === Number(year),
  );
  return (sameWeek.length ? sameWeek : docs).sort(
    (a, b) =>
      clean(a) - clean(b) ||
      num(b.YearNumber) - num(a.YearNumber) ||
      num(b.WeekNumber) - num(a.WeekNumber),
  )[0];
}

function fetchVariants(config, dishDocId, week, year) {
  return runQuery(config, config.variants, [
    where('DishId', 'EQUAL', { stringValue: dishDocId }),
    where('WeekNumber', 'IN', numberOrString(week)),
    where('YearNumber', 'IN', numberOrString(year)),
  ]);
}

/** The page gives a single thumbnail; Firestore lists every size, "original" being the largest. */
function photoUrl(dish) {
  const assets = dish.DigitalAssets;
  if (assets?.Thumbnail?.Url) return assets.Thumbnail.Url;
  if (!Array.isArray(assets) || !assets.length) return null;
  const original = assets.find((asset) => /^original/.test(asset.Key ?? ''));
  if (original) return original.Url;
  const area = (asset) => {
    const [w, h] = (asset.Key ?? '').match(/(\d+)x(\d+)/)?.slice(1) ?? [0, 0];
    return w * h;
  };
  return [...assets].sort((a, b) => area(b) - area(a))[0].Url;
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
  const n = Number(String(quantity).replace(',', '.'));
  if (!Number.isFinite(n)) return String(quantity);
  const whole = Math.trunc(n);
  const rest = Math.round((n - whole) * 100) / 100;
  if (!rest) return String(whole);
  if (!FRACTIONS[rest]) return String(n).replace('.', ',');
  return whole ? `${whole} ${FRACTIONS[rest]}` : FRACTIONS[rest];
}

/** "1,5", "1/2" or "1 1/2" as a number (NaN when it is not a quantity). */
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

const COUNT_UNITS = /^(pièces?|pc|stuks?|stuk)$/i;
const METRIC_UNITS = {
  g: 'gr',
  gr: 'gr',
  kg: 'kg',
  ml: 'ml',
  cl: 'cl',
  l: 'l',
};

function withDe(name) {
  return /^([aeiouyâàéèêëîïôûù]|huile|herbe)/i.test(name)
    ? `d'${name}`
    : `de ${name}`;
}

// Foodbag sometimes puts the size last: "brocoli grand" becomes "grand brocoli".
const SIZE_LAST = /^(.+?) (grande?s?|gros|grosses?|petite?s?)$/i;

// Foodbag names are often plural ("1 carottes"). Below 2, the words before the
// first preposition lose their plural; words ending in as/is/os/us stay (radis, frais, gros, jus).
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

// From 2 on, the same words become plural ("2 filets de poulet", "2 oignons rouges").
// Kept as is: words already plural, brands (capital), hyphenated words, "(porc)",
// and words after the first one ending in i ("pains panini").
const INVARIABLE = /^(mini|bio|extra)$/i;
function plural(name) {
  const words = name.split(' ');
  const end = words.findIndex((word) => PREPOSITION.test(word));
  return words
    .map((word, i) => {
      if ((end !== -1 && i >= end) || INVARIABLE.test(word)) return word;
      if (!/^\p{Ll}[\p{Ll}']*$/u.test(word) || /[sxz]$/i.test(word)) {
        return word;
      }
      if (/^chou$|e?au$/i.test(word)) return `${word}x`;
      return i > 0 && /i$/i.test(word) ? word : `${word}s`;
    })
    .join(' ');
}

// Foodbag sometimes repeats the unit in the name: "tranches" + "tranches de lard".
function withoutUnit(name, unit) {
  const stem = unit
    .toLowerCase()
    .replace(/s$/, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`^${stem}s? (de |d['’])`, 'i'), '');
}

const OPTIONAL_UNIT = /^facultatif$/i;

function formatIngredient(ingredient) {
  const quantity = formatQuantity(ingredient.Quantity);
  const unit = (ingredient.SizeFR ?? '').trim();
  const name = withoutUnit(
    (ingredient.ProductVariantFR ?? '').trim().replace(SIZE_LAST, '$2 $1'),
    unit,
  );
  if (OPTIONAL_UNIT.test(unit)) {
    return `${[quantity, name].filter(Boolean).join(' ')} (facultatif)`;
  }
  if (!unit || COUNT_UNITS.test(unit)) {
    const value = quantityValue(ingredient.Quantity);
    const counted = !quantity
      ? name
      : value < 2
        ? singular(name)
        : value >= 2
          ? plural(name)
          : name;
    return [quantity, counted].filter(Boolean).join(' ');
  }
  const metric = METRIC_UNITS[unit.toLowerCase()];
  if (metric) return [quantity, metric, name].filter(Boolean).join(' ');
  return `${quantity || '1'} ${unit} ${withDe(name)}`;
}

/** Foodbag order for the delivered items, then pantry basics, salt and pepper last. */
function sortIngredients(ingredients) {
  const rank = (i) =>
    !i.IsBasic ? 0 : /\b(sel|poivre)\b/i.test(i.ProductVariantFR) ? 2 : 1;
  return ingredients
    .map((ingredient, index) => ({ ingredient, index }))
    .sort(
      (a, b) => rank(a.ingredient) - rank(b.ingredient) || a.index - b.index,
    )
    .map(({ ingredient }) => ingredient);
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
  /saumon|cabillaud|maquereau|thon|truite|merlu|colin|dorade|poisson|crevette|scampi|moule|gambas|calamar|scampi|sardine|hareng|\bsole\b|\bbar\b|\blieu\b|églefin|haddock|tilapia|pangasius/;
const MEAT =
  /porc|b(œ|oe)uf|veau|agneau|canard|saucisse|haché|lard|jambon|poulet|dinde|chorizo|steak|pancetta|bacon|mignon|merguez|chipolata|volaille|salami|prosciutto|coppa|speck|gyros|kebab|boulette|viande/;
const PASTA =
  /pâtes|pates|spaghetti|tagliatelle|penne|orzo|linguine|lasagne|gnocchi|fusilli|rigatoni|farfalle|macaroni|fettuccine|ravioli|tortellini|conchiglie/;
const ASIAN =
  /nouilles|udon|ramen|wok|teriyaki|sriracha|gochujang|coréen|thaï|japonais|chinois|vietnamien|curry/;
// Stock and sauces name an animal without being the dish ("bouillon de poulet", "sauce poisson").
const NOT_MAIN = /bouillon|fond de|sauce|fumet|graisse/;

/** Tags from the name and subtitle, and from the delivered ingredients for meat, fish and pasta. */
function guessTags(text, ingredients = []) {
  const t = text.toLowerCase();
  const items = ingredients
    .filter((i) => !i.IsBasic)
    .map((i) => (i.ProductVariantFR ?? '').toLowerCase())
    .filter((name) => !NOT_MAIN.test(name))
    .join(' | ');
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
 * Finds the plate: the circle (radius 27–52% of the width) that the most edges
 * point to (a Hough transform along the gradient). It works for plates of any
 * colour; side bowls are too small to count.
 */
async function findPlate(buffer, width, height) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(240)
    .greyscale()
    .blur(1.5)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const N = W * H;
  const at = (x, y) => data[y * W + x];
  const gx = new Float32Array(N);
  const gy = new Float32Array(N);
  const mag = new Float32Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      gx[p] =
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x - 1, y) -
        at(x - 1, y + 1);
      gy[p] =
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1);
      mag[p] = Math.hypot(gx[p], gy[p]);
    }
  }

  // The strongest 15% of the edges vote for the centres at distance r on both sides.
  const threshold = Math.max(
    40,
    Float32Array.from(mag).sort()[Math.floor(N * 0.85)],
  );
  const rMin = Math.round(W * 0.27);
  const rMax = Math.round(W * 0.52);
  const votes = new Uint16Array((rMax - rMin + 1) * N);
  for (let p = 0; p < N; p++) {
    if (mag[p] < threshold) continue;
    const x = p % W;
    const y = (p - x) / W;
    const ux = gx[p] / mag[p];
    const uy = gy[p] / mag[p];
    for (let r = rMin; r <= rMax; r++) {
      for (const side of [1, -1]) {
        const cx = Math.round(x + side * ux * r);
        const cy = Math.round(y + side * uy * r);
        if (cx >= 0 && cy >= 0 && cx < W && cy < H) {
          votes[(r - rMin) * N + cy * W + cx]++;
        }
      }
    }
  }

  let best = null;
  for (let r = rMin; r <= rMax; r++) {
    const layer = (r - rMin) * N;
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        let sum = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const row = layer + (y + dy) * W + x;
          for (let dx = -2; dx <= 2; dx++) sum += votes[row + dx];
        }
        // Votes per pixel of circumference, so large circles are not favoured.
        const score = sum / (2 * Math.PI * r);
        if (!best || score > best.score) best = { x, y, r, score };
      }
    }
  }
  if (!best || best.score < 0.25) return null;
  const sx = width / W;
  const sy = height / H;
  return {
    x0: Math.round((best.x - best.r) * sx),
    x1: Math.round((best.x + best.r) * sx),
    y0: Math.round((best.y - best.r) * sy),
    y1: Math.round((best.y + best.r) * sy),
  };
}

/**
 * Trims the photo so the plate is in the middle. An axis already within 2% is
 * kept whole, and so is one where centring would cut a plate that leaves the frame.
 */
function centerOn(plate, width, height) {
  const axis = (size, start, end) => {
    const center = (start + end) / 2;
    const half = Math.min(center, size - center);
    if (size / 2 - half <= size * 0.02 || half < (end - start) / 2) {
      return [0, size];
    }
    const from = Math.max(0, Math.round(center - half));
    return [from, Math.min(size - from, Math.round(2 * half))];
  };
  const [left, cropWidth] = axis(width, plate.x0, plate.x1);
  const [top, cropHeight] = axis(height, plate.y0, plate.y1);
  return { left, top, width: cropWidth, height: cropHeight };
}

async function preparePhoto(url, crop) {
  const buffer = await get(url, 'buffer');
  const meta = await sharp(buffer).metadata();
  const [width, height] =
    (meta.orientation ?? 1) >= 5
      ? [meta.height, meta.width]
      : [meta.width, meta.height];

  let area = { left: 0, top: 0, width, height };
  let note = 'photo gardée entière (--no-crop)';
  let plate = null;
  if (crop) {
    plate = await findPlate(buffer, width, height);
    if (plate) {
      area = centerOn(plate, width, height);
      note = `assiette ${plate.x1 - plate.x0}px trouvée, recadrage ${area.width}x${area.height} depuis (${area.left}, ${area.top})`;
    } else {
      note = 'assiette non trouvée, photo gardée entière';
    }
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
    plate: Boolean(plate),
  };
}

/** The home page shows a centred square of every photo; this saves that square. */
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

// Foodbag steps point to step photos that this site does not show:
// "(voir photo)" is removed, "(voir astuce et photo)" becomes "(voir astuce)".
const SEE = /\s*\(voir ([^)]*)\)/gi;
const PHOTO = /^(la |les )?photos?$/i;
function withoutStepPhotos(text) {
  return text.replace(SEE, (match, what) => {
    const parts = what.split(/\s+et\s+|,\s*/);
    const kept = parts.filter((part) => !PHOTO.test(part.trim()));
    if (kept.length === parts.length) return match;
    return kept.length ? ` (voir ${kept.join(' et ')})` : '';
  });
}

/** "Name, subtitle", or "Name et ..." when the subtitle already starts with "et". */
function withSubtitle(name, subtitle) {
  if (!subtitle) return name;
  return /^et\s/i.test(subtitle)
    ? `${name} ${subtitle}`
    : `${name}, ${subtitle}`;
}

function buildMarkdown({ title, slug, dish, variant, persons, url }) {
  const name = dish.NameFR.trim();
  const subtitle = (dish.SubtitleFR ?? '').trim();
  const keywords = [name, subtitle]
    .join(', ')
    .toLowerCase()
    .split(/\s*,\s*(?:et\s+)?|\s+et\s+/)
    .filter(Boolean);
  const intro = [`${withSubtitle(name, subtitle)}.`];
  if (variant.TotalTime) intro.push(`Prêt en ${variant.TotalTime} minutes.`);

  const ingredients = sortIngredients(variant.Ingredients ?? []).map(
    (ingredient) => `- ${formatIngredient(ingredient)}`,
  );
  const steps = [...(variant.Directions ?? [])]
    .filter((step) => step.DescriptionFR?.trim())
    .sort((a, b) => a.Sequence - b.Sequence)
    .map(
      (step, i) =>
        `${i + 1}. ${withoutStepPhotos(
          step.DescriptionFR.replace(/\s*\n\s*/g, ' '),
        ).trim()}`,
    );

  const lines = [
    '---',
    `title: ${title}`,
    `author: ${AUTHORS}`,
    `keywords: ${AUTHORS}, cooking, recipe, ${keywords.join(', ')}, food, cuisine`,
    '---',
    '',
    `![${name}](./${slug}.webp)`,
    '',
    intro.join(' '),
    '',
    `## Ingrédients (${persons} ${persons > 1 ? 'personnes' : 'personne'})`,
    ...ingredients,
    '',
    '## Préparation',
    steps.join('\n\n'),
  ];
  if (dish.TipFR?.trim()) lines.push('', '## Astuce', dish.TipFR.trim());
  lines.push('', '## Lien', `[Foodbag](${url})`, '');
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

/** Flags data the script was not written for, so new Foodbag quirks get noticed. */
function inspect(dish, variant) {
  const notes = [];
  const ingredients = variant.Ingredients ?? [];
  const steps = variant.Directions ?? [];
  if (!ingredients.length) notes.push('Aucun ingrédient.');
  if (!steps.length) notes.push('Aucune étape de préparation.');
  if (!variant.TotalTime) notes.push('Temps total absent.');
  for (const ingredient of ingredients) {
    const name = ingredient.ProductVariantFR?.trim();
    if (!name) {
      notes.push(`Ingrédient sans nom : ${JSON.stringify(ingredient)}`);
    }
    const quantity = formatQuantity(ingredient.Quantity);
    if (quantity && !/^(\d+|\d+ \d\/\d|\d\/\d)$/.test(quantity)) {
      notes.push(`Quantité inhabituelle « ${ingredient.Quantity} » : ${name}`);
    }
  }
  steps.forEach((step, i) => {
    if (!step.DescriptionFR?.trim()) notes.push(`Étape ${i + 1} vide.`);
    if (/photo/i.test(withoutStepPhotos(step.DescriptionFR ?? ''))) {
      notes.push(`Étape ${i + 1} renvoie encore à une photo.`);
    }
  });
  const texts = [
    dish.NameFR,
    dish.SubtitleFR,
    dish.TipFR,
    ...ingredients.flatMap((i) => [i.ProductVariantFR, i.SizeFR]),
    ...steps.map((step) => step.DescriptionFR),
  ];
  const marked = texts.find((text) => MARKUP.test(text ?? ''));
  if (marked) {
    notes.push(`HTML ou entité dans le texte : « ${marked.slice(0, 80)} »`);
  }
  return notes;
}

/** Reads the dish and the variant closest to `wanted` servings; `notes` lists anything unusual. */
async function fetchRecipe(url, wanted) {
  const pageUrl = new URL(url);
  if (!/(^|\.)foodbag\.be$/.test(pageUrl.hostname)) {
    throw new Error(`Pas une adresse foodbag.be : ${url}`);
  }
  const dishId = pageUrl.searchParams.get('dishId');
  if (!dishId) throw new Error('Paramètre dishId absent de l’adresse.');

  const notes = [];
  const html = await get(url);
  const config = await findFirebaseConfig(html);
  if (config.defaults.length) {
    notes.push(
      `Collections Firestore absentes des scripts Foodbag (${config.defaults.join(', ')}) : noms par défaut utilisés.`,
    );
  }
  const weekDoc = pageUrl.searchParams
    .get('weekDocId')
    ?.match(/^W(\d+)Y(\d+)$/);
  const embedded = findEmbeddedDish(readFlightData(html), dishId);
  const dish =
    embedded ?? (await fetchDish(config, dishId, weekDoc?.[1], weekDoc?.[2]));
  const week = parseInt(dish.WeekNumber, 10);
  const year = parseInt(dish.YearNumber, 10);
  if (weekDoc && (week !== Number(weekDoc[1]) || year !== Number(weekDoc[2]))) {
    notes.push(
      `Semaine ${weekDoc[0]} introuvable : semaine ${week} de ${year} utilisée.`,
    );
  }

  const variants = await fetchVariants(config, dish.Id, week, year);
  if (!variants.length)
    throw new Error('Aucune variante trouvée dans Firestore.');

  const variant = variants.reduce((best, v) =>
    Math.abs(v.NumberOfPersons - wanted) <
    Math.abs(best.NumberOfPersons - wanted)
      ? v
      : best,
  );
  const persons = variant.NumberOfPersons;
  if (persons !== wanted) {
    notes.push(`Pas de version pour ${wanted} personnes : ${persons} utilisé.`);
  }
  notes.push(...inspect(dish, variant));
  const source = embedded ? 'page Foodbag' : 'Firestore';
  return { dish, variant, persons, source, notes };
}

/** Folder of a recipe whose Foodbag link has the same dish id, if any. */
function importedAs(url) {
  const dishId = new URL(url).searchParams.get('dishId');
  if (!dishId) return null;
  for (const entry of fs.readdirSync(RECIPES_DIR, { withFileTypes: true })) {
    const file = path.join(RECIPES_DIR, entry.name, 'recipe.md');
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    if (fs.readFileSync(file, 'utf8').includes(`dishId=${dishId}`)) {
      return entry.name;
    }
  }
  return null;
}

async function importRecipe(url) {
  const { dish, variant, persons, source, notes } = await fetchRecipe(
    url,
    Number(opts.persons),
  );

  const title = opts.title ?? titleCase(dish.NameFR.trim());
  const slug = opts.slug ?? slugify(dish.NameFR);
  const subtitle = (dish.SubtitleFR ?? '').trim();
  const description =
    opts.description ??
    `${withSubtitle(dish.NameFR.trim(), subtitle)} (Foodbag)`;
  const tags = opts.tags
    ? opts.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : guessTags(`${dish.NameFR} ${subtitle}`, variant.Ingredients);
  if (!tags.length) notes.push('Aucun tag deviné : passez --tags.');
  const date = opts.date ?? today();

  const recipesData = JSON.parse(fs.readFileSync(RECIPES_JSON, 'utf8'));
  const recipeDir = path.join(RECIPES_DIR, slug);
  const previous = importedAs(url);
  if (previous && previous !== slug) {
    const message = `Plat déjà importé dans recipes/${previous}/.`;
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

  const imageUrl = photoUrl(dish);
  if (!imageUrl) throw new Error('Photo Foodbag introuvable.');
  const photo = await preparePhoto(imageUrl, !opts['no-crop']);
  if (!opts['no-crop'] && !photo.plate) {
    notes.push(
      'Assiette non trouvée : photo gardée entière, vérifiez l’aperçu carré.',
    );
  }
  const preview = path.join(os.tmpdir(), `foodbag-${slug}-square.png`);
  await writeSquarePreview(photo.webp, preview);

  const markdown = buildMarkdown({ title, slug, dish, variant, persons, url });
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
  source   : ${source}
  portions : ${persons}
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
      const recipe = await fetchRecipe(ref.url, ref.persons ?? 2);
      notes = recipe.notes;
      const markdown = buildMarkdown({
        ...recipe,
        title: '',
        slug: 'check',
        url: ref.url,
      });
      const lines = new Set(markdown.split('\n'));
      for (const line of ref.expect ?? []) {
        if (!lines.has(line)) problems.push(`ligne absente : ${line}`);
      }
      if (ref.tags !== undefined) {
        const { dish, variant } = recipe;
        const tags = guessTags(
          `${dish.NameFR} ${dish.SubtitleFR ?? ''}`,
          variant.Ingredients,
        ).join(',');
        if (tags !== ref.tags) problems.push(`tags devinés : ${tags}`);
      }
      if (ref.plate !== undefined) {
        const photo = await preparePhoto(photoUrl(recipe.dish), true);
        if (photo.plate !== ref.plate) {
          problems.push(
            photo.plate ? 'assiette trouvée' : 'assiette non trouvée',
          );
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
