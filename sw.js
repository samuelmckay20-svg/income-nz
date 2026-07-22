const VERSION = '2.0.3';
const CACHE = 'income-nz-' + VERSION;
const SHELL = [
  '/income-nz/',
  '/income-nz/index.html',
  '/income-nz/manifest.json',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(SHELL).catch(function(err) {
        console.warn('SW cache error:', err);
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // NEVER intercept API calls, external scripts, or non-GET requests
  if (e.request.method !== 'GET') return;
  if (url.includes('synology.me')) return;
  if (url.includes('anthropic.com')) return;
  if (url.includes('cdnjs.cloudflare.com')) return;
  if (url.includes('googleapis.com')) return;

  // Only cache our own shell files
  var isShell = url.includes('/income-nz/index.html') ||
                url.includes('/income-nz/manifest.json') ||
                url.endsWith('/income-nz/');

  if (!isShell) return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      // Network first for shell — always try to get fresh version
      return fetch(e.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback only
        return cached || caches.match('/income-nz/index.html');
      });
    })
  );
});

self.addEventListener('message', function(e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
