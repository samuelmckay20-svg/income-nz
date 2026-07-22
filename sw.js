const VERSION = '2.1.1';
const CACHE = 'income-nz-' + VERSION;

// Files worth pre-caching. index.html is the only one that MUST succeed —
// the rest are best-effort, so a missing asset can't break offline support.
const CRITICAL = [
  '/income-nz/',
  '/income-nz/index.html'
];
const OPTIONAL = [
  '/income-nz/manifest.json',
  '/income-nz/icon-192.png',
  '/income-nz/icon-512.png',
  '/income-nz/apple-touch-icon.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // cache.addAll() is atomic — a single 404 rejects the whole batch and
      // leaves the cache empty. Adding entries individually means one missing
      // file no longer takes offline support down with it.
      var critical = Promise.all(CRITICAL.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.error('[sw] critical asset failed:', url, err);
        });
      }));
      var optional = Promise.all(OPTIONAL.map(function(url) {
        return cache.add(url).catch(function() {
          console.warn('[sw] optional asset unavailable:', url);
        });
      }));
      return Promise.all([critical, optional]);
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
  if (e.request.method !== 'GET') return;

  var url;
  try {
    url = new URL(e.request.url);
  } catch (err) {
    return;   // unparseable — leave it to the network
  }

  // The Cache API only accepts http(s). Browser extensions, blob:, data:
  // and similar schemes throw on cache.put(), so ignore them entirely.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Only ever cache our own assets. Anything cross-origin (API, CDN,
  // analytics, extensions) passes straight through untouched.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(function(res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE)
            .then(function(cache) { return cache.put(e.request, copy); })
            .catch(function(err) { console.warn('[sw] cache put failed:', url.pathname, err); });
        }
        return res;
      })
      .catch(function() {
        return caches.match(e.request).then(function(hit) {
          return hit || caches.match('/income-nz/index.html');
        });
      })
  );
});
