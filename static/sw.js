// Increment this version on every deploy to bust stale caches
const CACHE_VERSION = 'v1.1';
const CACHE_NAME = `writeai-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/static/index.html',
  '/static/style.css',
  '/static/script.js',
  '/static/favicon.png',
  '/static/manifest.json',
];

self.addEventListener('install', (event) => {
  // Take control immediately rather than waiting for old SW to die
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  // Delete all caches that don't match current version
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always go to network for API calls — never serve stale AI responses
  if (['/correct', '/apply-suggestion', '/apply-suggestions', '/chat', '/restructure', '/health'].includes(url.pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for navigation (ensures fresh HTML on deploy)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, images)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
