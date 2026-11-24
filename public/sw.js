// OnClock service worker.
//
// Bump BUILD_VERSION on any deploy that should force-refresh installed
// clients. Browsers detect any byte change in this file as a new SW and
// will install it on the next page load. The register-side helper
// (src/components/employee/PortalPwaRegister.tsx) periodically calls
// registration.update() so this check fires sooner than the default
// 24-hour browser interval.
const BUILD_VERSION = '2026-11-20-brand-3'
const CACHE_PREFIX = 'onclock-cache-'
const CURRENT_CACHE = `${CACHE_PREFIX}${BUILD_VERSION}`

self.addEventListener('install', (event) => {
  // skipWaiting() makes the new SW take over right away instead of
  // waiting for every tab to close â€” combined with clients.claim() in
  // activate, users see the latest build on the next page load.
  event.waitUntil(caches.open(CURRENT_CACHE).then(cache => cache.addAll(['/portal-offline.html', '/portal-offline.js'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Wipe every cache from older SW versions so stale shells / assets
      // can't survive across deploys.
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CURRENT_CACHE)
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
      // Tell every controlled tab "a new version is active" so the page
      // can decide whether to reload (the register component listens
      // for the controllerchange event and triggers location.reload()).
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        client.postMessage({ type: 'SW_ACTIVATED', version: BUILD_VERSION })
      }
    })(),
  )
})

// Allow the page to ask the waiting SW to take over immediately. The
// register-side helper sends { type: 'SKIP_WAITING' } when it detects a
// new SW in the "installed" state. Useful if we ever add a "Reload to
// apply update" toast in the UI.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Cache only the public offline shell, never authenticated HTML or API responses.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return
  if (['/portal-offline.html', '/portal-offline.js'].includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(url.pathname)))
  } else if (event.request.mode === 'navigate' && (url.pathname === '/portal' || url.pathname.startsWith('/portal/'))) {
    event.respondWith(fetch(event.request).catch(() => caches.match('/portal-offline.html')))
  }
})
