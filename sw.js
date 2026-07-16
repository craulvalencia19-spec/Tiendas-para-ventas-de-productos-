// sw.js — Service worker mínimo para que Crissport cumpla los requisitos de PWA

const CACHE_NAME = 'crissport-cache-v1';

const CORE_ASSETS = [
  '/Tiendas-para-ventas-de-productos-/',
  '/Tiendas-para-ventas-de-productos-/index.html',
  '/Tiendas-para-ventas-de-productos-/style.css',
  '/Tiendas-para-ventas-de-productos-/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
