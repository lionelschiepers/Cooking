/**
 * Home page: recipe list with search, category filter and sorting.
 * The filter state is mirrored in the URL (?q=…&tag=…&sort=…) so a filtered
 * list can be bookmarked or shared.
 */

const DEFAULT_SORT = 'date-desc';
const SORT_OPTIONS = new Set([
  'date-desc',
  'date-asc',
  'title-asc',
  'title-desc',
]);
const EAGER_IMAGES = 4;
const CARD_SIZES =
  '(min-width: 80rem) 17rem, (min-width: 64rem) 22vw, (min-width: 40rem) 30vw, 46vw';
const EMPTY_PLATE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23C9D2CE'/%3E%3Ccircle cx='50' cy='50' r='31' fill='none' stroke='%237A8A86' stroke-width='1.5'/%3E%3C/svg%3E";

const ICONS = {
  play: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path fill="currentColor" d="M8 6.5v7l6-3.5z"/></svg>',
  external:
    '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M11 4h5v5M16 4l-7 7M14 11.5V16H4V6h4.5"/></svg>',
};

const KINDS = {
  youtube: {
    label: 'Vidéo YouTube',
    srText: ' (vidéo YouTube, nouvel onglet)',
    icon: ICONS.play,
  },
  external: {
    label: 'Site externe',
    srText: ' (site externe, nouvel onglet)',
    icon: ICONS.external,
  },
};

const dateFormatter = new Intl.DateTimeFormat('fr-BE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

let allRecipes = [];
let allTags = [];
let loaded = false;
const els = {};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Only allow http(s) and relative URLs in links and images. */
function safeUrl(url) {
  const value = String(url ?? '').trim();
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value);
  if (scheme && !['http', 'https'].includes(scheme[1].toLowerCase())) {
    return '#';
  }
  return value;
}

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Parses the "2026/02/12" dates used in recipes.json. */
function parseDate(value) {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value ?? '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function prepareRecipe(recipe) {
  const date = parseDate(recipe.date);
  const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
  return {
    ...recipe,
    tags,
    time: date ? date.getTime() : 0,
    isoDate: date ? date.toISOString().slice(0, 10) : '',
    displayDate: date ? dateFormatter.format(date) : '',
    searchText: normalize(
      [recipe.title, recipe.description, ...tags].join(' '),
    ),
  };
}

function recipeLink(recipe) {
  if (recipe.type === 'youtube' || recipe.type === 'external') {
    return { href: recipe.url, external: true };
  }
  const legacy = /\?md=([^/]+)/.exec(recipe.path ?? '');
  if (legacy) {
    return { href: `./recipes/${legacy[1]}/`, external: false };
  }
  return {
    href: `./${String(recipe.path ?? '').replace(/^\.?\//, '')}`,
    external: false,
  };
}

function createTagButton(tag, activeTag) {
  const pressed = tag === activeTag;
  return `<li><button type="button" class="tag" data-tag="${escapeHtml(tag)}" aria-pressed="${pressed}"><span class="sr-only">Filtrer par </span>${escapeHtml(tag)}</button></li>`;
}

/**
 * build-images.js writes "<photo>.w480.webp" (and 960, 1440) next to every
 * local photo. If a copy is missing, handleImageError falls back to src.
 */
function localSrcset(url) {
  if (!/^\.\/recipes\/.+\.(webp|jpe?g|png|avif)$/i.test(url)) return '';
  return [480, 960, 1440]
    .map((width) => {
      const variant = url.replace(/\.[a-z]+$/i, `.w${width}.webp`);
      return `${variant} ${width}w`;
    })
    .join(', ');
}

function createRecipeCard(recipe, index, activeTag) {
  const { href, external } = recipeLink(recipe);
  const kind = KINDS[recipe.type];
  const showDescription =
    recipe.description &&
    normalize(recipe.description) !== normalize(recipe.title);

  const image = safeUrl(recipe.image);
  const srcset = localSrcset(image);
  const imageAttrs = [
    `src="${escapeHtml(image)}"`,
    srcset ? `srcset="${escapeHtml(srcset)}" sizes="${CARD_SIZES}"` : '',
    'alt=""',
    `loading="${index < EAGER_IMAGES ? 'eager' : 'lazy'}"`,
    'decoding="async"',
    index === 0 ? 'fetchpriority="high"' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const linkAttrs = external
    ? ' target="_blank" rel="noopener noreferrer"'
    : '';

  const tags = recipe.tags.length
    ? `<ul class="tag-list" aria-label="Catégories">${recipe.tags
        .map((tag) => createTagButton(tag, activeTag))
        .join('')}</ul>`
    : '';

  return `
    <li class="plate-card">
      <div class="plate${recipe.type === 'youtube' ? ' plate--video' : ''}">
        <img ${imageAttrs}>
      </div>
      <h2 class="plate-title">
        <a class="plate-link" href="${escapeHtml(safeUrl(href))}"${linkAttrs}>${escapeHtml(recipe.title)}${kind ? `<span class="sr-only">${kind.srText}</span>` : ''}</a>
      </h2>
      ${kind ? `<p class="plate-kind" aria-hidden="true">${kind.icon}${kind.label}</p>` : ''}
      ${showDescription ? `<p class="plate-desc">${escapeHtml(recipe.description)}</p>` : ''}
      <div class="plate-meta">
        ${recipe.isoDate ? `<time class="plate-date" datetime="${recipe.isoDate}">${recipe.displayDate}</time>` : ''}
        ${tags}
      </div>
    </li>`;
}

function readControls() {
  return {
    query: els.search.value.trim(),
    tag: els.tag.value,
    sort: SORT_OPTIONS.has(els.sort.value) ? els.sort.value : DEFAULT_SORT,
  };
}

function filterRecipes(query, tag) {
  const terms = normalize(query)
    .split(/[\s,]+/)
    .filter(Boolean);
  return allRecipes.filter(
    (recipe) =>
      (!tag || recipe.tags.includes(tag)) &&
      terms.every((term) => recipe.searchText.includes(term)),
  );
}

function sortRecipes(recipes, sort) {
  const byTitle = (a, b) =>
    a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
  const sorted = [...recipes];
  switch (sort) {
    case 'date-asc':
      return sorted.sort((a, b) => a.time - b.time || byTitle(a, b));
    case 'title-asc':
      return sorted.sort(byTitle);
    case 'title-desc':
      return sorted.sort((a, b) => byTitle(b, a));
    default:
      return sorted.sort((a, b) => b.time - a.time);
  }
}

function countLabel(count) {
  return `${count} recette${count > 1 ? 's' : ''}`;
}

/** The most used categories, offered as a way out of an empty search. */
function popularTags(limit) {
  const counts = new Map();
  for (const recipe of allRecipes) {
    for (const tag of recipe.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .slice(0, limit)
    .map(([tag]) => tag);
}

/** Plain text, set with textContent: the query and tag come from the URL. */
function noResultsMessage(query, tag) {
  const quotedQuery = `«\u202F${query}\u202F»`;
  if (query && tag) {
    return `Aucune recette de la catégorie ${tag} ne correspond à ${quotedQuery}.`;
  }
  if (query) {
    return `Aucune recette ne correspond à ${quotedQuery}. Vérifiez l’orthographe ou cherchez un ingrédient.`;
  }
  if (tag) {
    return `Aucune recette dans la catégorie ${tag}.`;
  }
  return 'Aucune recette pour le moment.';
}

function renderNoResults(query, tag) {
  const widenButton =
    query && tag
      ? `<button type="button" class="button-quiet" data-action="all-categories">Chercher dans toutes les catégories</button>`
      : '';

  const suggestions =
    query && !tag
      ? `<p>Ou parcourez une catégorie&#8239;:</p>
         <ul class="tag-list" aria-label="Catégories">${popularTags(5)
           .map((t) => createTagButton(t, ''))
           .join('')}</ul>`
      : '';

  els.grid.innerHTML = `
    <div class="notice">
      <h2>Aucune recette trouvée</h2>
      <p data-message></p>
      <div class="notice-actions">
        <button type="button" class="button" data-action="reset">Voir toutes les recettes</button>
        ${widenButton}
      </div>
      ${suggestions}
    </div>`;
  els.grid.querySelector('[data-message]').textContent = noResultsMessage(
    query,
    tag,
  );
}

function syncUrl({ query, tag, sort }) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (tag) params.set('tag', tag);
  if (sort !== DEFAULT_SORT) params.set('sort', sort);
  const search = params.toString();
  const queryString = search ? `?${search}` : '';
  history.replaceState(
    history.state,
    '',
    `${location.pathname}${queryString}${location.hash}`,
  );
}

function render() {
  if (!loaded) return;
  const controls = readControls();
  const results = sortRecipes(
    filterRecipes(controls.query, controls.tag),
    controls.sort,
  );

  els.count.textContent =
    results.length === allRecipes.length
      ? countLabel(allRecipes.length)
      : `${countLabel(results.length)} sur ${allRecipes.length}`;

  els.grid.removeAttribute('aria-busy');
  if (results.length === 0) {
    renderNoResults(controls.query, controls.tag);
  } else {
    els.grid.innerHTML = `<ul class="plates">${results
      .map((recipe, index) => createRecipeCard(recipe, index, controls.tag))
      .join('')}</ul>`;
  }

  syncUrl(controls);
}

function showLoading() {
  els.count.textContent = 'Chargement des recettes…';
  els.grid.setAttribute('aria-busy', 'true');
  const placeholder =
    '<li class="plate-card"><div class="plate skeleton"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></li>';
  els.grid.innerHTML = `<ul class="plates" aria-hidden="true">${placeholder.repeat(8)}</ul>`;
}

function showError() {
  els.count.textContent = '';
  els.grid.removeAttribute('aria-busy');
  els.grid.innerHTML = `
    <div class="notice" role="alert">
      <h2>Impossible de charger les recettes</h2>
      <p>Vérifiez votre connexion internet puis réessayez.</p>
      <div class="notice-actions">
        <button type="button" class="button" data-action="retry">Réessayer</button>
      </div>
    </div>`;
}

function populateTagFilter() {
  const tags = new Set(allRecipes.flatMap((recipe) => recipe.tags));
  allTags = [...tags].sort((a, b) => a.localeCompare(b, 'fr'));
  els.tag.length = 1;
  for (const tag of allTags) {
    els.tag.add(new Option(tag, tag));
  }
}

function applyUrlState() {
  const params = new URLSearchParams(location.search);
  els.search.value = params.get('q') ?? '';
  const tag = params.get('tag');
  els.tag.value = tag && allTags.includes(tag) ? tag : '';
  const sort = params.get('sort');
  els.sort.value = SORT_OPTIONS.has(sort) ? sort : DEFAULT_SORT;
}

async function loadRecipes() {
  showLoading();
  try {
    const response = await fetch('./recipes.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    allRecipes = (data.recipes ?? []).map(prepareRecipe);
  } catch (error) {
    console.error('Impossible de charger recipes.json :', error);
    showError();
    return;
  }
  loaded = true;
  populateTagFilter();
  applyUrlState();
  render();
}

/** Falls back to the original image, then to an empty plate. */
function handleImageError(event) {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.hasAttribute('srcset')) {
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    return;
  }
  if (!img.dataset.empty) {
    img.dataset.empty = 'true';
    img.closest('.plate')?.classList.remove('plate--video');
    img.src = EMPTY_PLATE;
  }
}

function handleGridClick(event) {
  const tagButton = event.target.closest('button[data-tag]');
  if (tagButton) {
    const tag = tagButton.dataset.tag;
    els.tag.value = els.tag.value === tag ? '' : tag;
    render();
    els.tag.focus();
    return;
  }

  const action = event.target.closest('button[data-action]')?.dataset.action;
  if (action === 'reset') {
    els.search.value = '';
    els.tag.value = '';
    render();
    els.search.focus();
  } else if (action === 'all-categories') {
    els.tag.value = '';
    render();
    els.tag.focus();
  } else if (action === 'retry') {
    void loadRecipes();
  }
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.warn('Service worker non enregistré :', error);
      });
    });
  }
}

function init() {
  els.form = document.getElementById('filters');
  els.search = document.getElementById('search-input');
  els.tag = document.getElementById('tag-filter');
  els.sort = document.getElementById('sort-select');
  els.count = document.getElementById('results-count');
  els.grid = document.getElementById('recipe-grid');
  if (!els.form || !els.grid) return;

  els.form.addEventListener('submit', (event) => event.preventDefault());
  els.search.addEventListener('input', debounce(render, 250));
  els.tag.addEventListener('change', render);
  els.sort.addEventListener('change', render);
  els.grid.addEventListener('click', handleGridClick);
  els.grid.addEventListener('error', handleImageError, true);

  void loadRecipes();
  registerServiceWorker();
}

init();
