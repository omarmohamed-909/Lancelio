// Only the public offline document and install icons enter Cache Storage.
// Account pages, API calls, Next RSC requests and mutations always use the network.
export const workerSource = String.raw`
const PREFIX = 'lancelio-offline-';
const PUBLIC_FILES = ['/offline', '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PUBLIC_FILES.map(path => new Request(path, {cache: 'reload', credentials: 'omit'})));
  })());
  // Updates wait for open windows to close; never interrupt an unsaved form.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/offline')) || Response.error();
      }
    })());
    return;
  }

  if (!url.search && PUBLIC_FILES.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(url.pathname)) || fetch(request);
    })());
  }
});
`;
