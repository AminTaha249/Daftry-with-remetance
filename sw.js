// Minimal app-shell cache so the app works offline once installed.
// Daftary keeps all real data in localStorage/IndexedDB on the device already —
// this worker only needs to make sure the app page itself loads without a network.
//
// ⚠ Change CACHE_NAME (v2 → v3 …) every time you upload a new index.html,
//   so the new version is shown from the very first open.
const CACHE_NAME = 'daftary-shell-v10';

// The on-device invoice/notice reader (Tesseract) is downloaded once from these hosts and
// kept in its OWN cache, so it survives app updates and works offline afterwards.
// Only the reader's code and language data are downloaded — no image or data is ever sent.
const OCR_CACHE = 'daftary-ocr-lib-v1';
const OCR_HOSTS = ['cdn.jsdelivr.net', 'tessdata.projectnaptha.com'];

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== OCR_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isOcrAsset(url) {
  try { return OCR_HOSTS.includes(new URL(url).hostname); } catch (e) { return false; }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Reader library: cache-first from its own cache (versioned, pinned URLs never change).
  if (isOcrAsset(event.request.url)) {
    event.respondWith(
      caches.open(OCR_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            // opaque (no-cors) responses are cacheable too; they come from pinned versions
            if (response && (response.ok || response.type === 'opaque')) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // Cache-first for the app shell, falling back to network, so an update to
  // index.html is still picked up once it re-caches on the next successful load.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
