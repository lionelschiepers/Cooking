/**
 * Cooking helpers for a recipe page: tick ingredients off while you gather
 * them, keep the screen awake while cooking, and print the recipe.
 *
 * Loaded as a plain module by the static recipe pages (no bundling), so it
 * must not import anything.
 */

const INGREDIENTS_HEADING = /^ingr[ée]dients?\b/i;
const STEPS_HEADING = /^(recette|pr[ée]paration|instructions?)\b/i;
const STORAGE_PREFIX = 'recettes:ingredients:';

function readChecked(key) {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(key) ?? '[]'));
  } catch {
    return new Set();
  }
}

function writeChecked(key, indexes) {
  try {
    if (indexes.length) {
      sessionStorage.setItem(key, JSON.stringify(indexes));
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable (private mode); ticking still works.
  }
}

/** Collects the bullet lists that belong to the "Ingrédients" section. */
function findIngredientLists(content) {
  const heading = [...content.querySelectorAll('h2, h3')].find((el) =>
    INGREDIENTS_HEADING.test(el.textContent.trim()),
  );
  if (!heading) return [];

  const rank = Number(heading.tagName[1]);
  const lists = [];
  for (let el = heading.nextElementSibling; el; el = el.nextElementSibling) {
    const level = /^H([1-6])$/.exec(el.tagName);
    if (
      level &&
      (Number(level[1]) <= rank || STEPS_HEADING.test(el.textContent.trim()))
    ) {
      break;
    }
    if (el.tagName === 'UL' && !el.querySelector('ul, ol')) {
      lists.push(el);
    }
  }
  return lists;
}

function enhanceIngredients(content, key) {
  if (content.dataset.ingredientsReady) return;
  const lists = findIngredientLists(content);
  if (!lists.length) return;
  content.dataset.ingredientsReady = 'true';

  const storageKey = STORAGE_PREFIX + key;
  const saved = readChecked(storageKey);
  const boxes = [];

  for (const list of lists) {
    list.classList.add('ingredient-list');
    for (const item of [...list.children]) {
      if (item.tagName !== 'LI') continue;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = saved.has(boxes.length);
      const text = document.createElement('span');
      text.append(...item.childNodes);
      const label = document.createElement('label');
      label.append(box, text);
      item.append(label);
      boxes.push(box);
    }
  }

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'button-quiet ingredient-reset';
  reset.textContent = 'Tout décocher';
  // After the lists, so showing it never moves the ingredients being ticked.
  lists.at(-1).after(reset);

  const update = () => {
    const checked = boxes.flatMap((box, index) => (box.checked ? [index] : []));
    reset.hidden = checked.length === 0;
    writeChecked(storageKey, checked);
  };

  for (const box of boxes) box.addEventListener('change', update);
  reset.addEventListener('click', () => {
    for (const box of boxes) box.checked = false;
    update();
    boxes[0]?.focus();
  });
  update();
}

function setupPrint(root) {
  for (const button of root.querySelectorAll('[data-print]')) {
    if (button.dataset.ready) continue;
    button.dataset.ready = 'true';
    button.hidden = false;
    button.addEventListener('click', () => window.print());
  }
}

function setupWakeLock(root) {
  const slot = root.querySelector('[data-recipe-actions]');
  if (!slot || slot.dataset.ready || !('wakeLock' in navigator)) return;
  slot.dataset.ready = 'true';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toggle';
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML =
    '<span class="toggle-indicator" aria-hidden="true"></span>Garder l’écran allumé';

  const status = document.createElement('p');
  status.className = 'toggle-status';
  status.setAttribute('role', 'status');

  slot.append(button, status);

  let wanted = false;
  let sentinel = null;

  const render = (message = '') => {
    button.setAttribute('aria-pressed', String(wanted));
    status.textContent = message;
  };

  const acquire = async () => {
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
      return true;
    } catch {
      return false;
    }
  };

  button.addEventListener('click', async () => {
    if (wanted) {
      wanted = false;
      render();
      await sentinel?.release();
      sentinel = null;
      return;
    }
    wanted = true;
    render('L’écran reste allumé tant que cette page est ouverte.');
    if (!(await acquire())) {
      wanted = false;
      render('L’écran ne peut pas rester allumé sur cet appareil.');
    }
  });

  // The browser drops the lock when the tab is hidden; take it back on return.
  document.addEventListener('visibilitychange', () => {
    if (wanted && !sentinel && document.visibilityState === 'visible') {
      acquire();
    }
  });
}

function registerServiceWorker() {
  const manifest = document.querySelector('link[rel="manifest"]');
  if (
    !manifest ||
    !('serviceWorker' in navigator) ||
    location.protocol !== 'https:'
  ) {
    return;
  }
  navigator.serviceWorker
    .register(new URL('sw.js', manifest.href))
    .catch((error) => console.warn('Service worker non enregistré :', error));
}

export function initRecipePage({
  root = document,
  key = location.pathname + location.search,
} = {}) {
  const content = root.querySelector('#recipe-content');
  if (content) enhanceIngredients(content, key);
  setupPrint(root);
  setupWakeLock(root);
  registerServiceWorker();
}

if (document.body?.dataset.page === 'recipe') {
  initRecipePage();
}
