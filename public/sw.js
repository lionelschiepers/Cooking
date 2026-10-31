/**
 * Service worker: keeps the recipes readable offline.
 * Pages and recipes.json: network first, cached copy when offline.
 * Other files (styles, scripts, photos): cached copy first, refreshed in the background.
 */

const CACHE_NAME = 'recettes-v2';
const PRECACHE = ['./', './recipes.json', './favicon.svg', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .catch((error) => console.warn('[SW] Précache incomplet :', error)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function putInCache(request, response) {
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(event) {
  try {
    const response = await fetch(event.request);
    event.waitUntil(putInCache(event.request, response.clone()));
    return response;
  } catch (error) {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    if (event.request.mode === 'navigate') {
      const home = await caches.match(new URL('./', self.registration.scope));
      if (home) return home;
    }
    throw error;
  }
}

async function staleWhileRevalidate(event) {
  const cached = await caches.match(event.request);
  const refresh = fetch(event.request).then((response) =>
    putInCache(event.request, response.clone()).then(() => response),
  );
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(event));
  } else {
    event.respondWith(staleWhileRevalidate(event));
  }
});
