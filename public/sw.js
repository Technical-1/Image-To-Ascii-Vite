// Hand-rolled offline service worker — no dependencies, matching the app's
// zero-runtime-dependency design. Strategy: stale-while-revalidate for every
// same-origin GET. The app shell and its hashed assets are cached the first
// time they're fetched under this worker's control, so afterwards the whole
// app works offline — including opening a `#s=` share link, whose artwork
// lives entirely in the URL and is regenerated client-side.
//
// To ship an update, bump CACHE; the old cache is purged on activate and the
// new worker takes control immediately (skipWaiting + clients.claim). The
// `/sw.js` response itself is served no-cache (see vercel.json) so a new
// worker version is noticed promptly.
const CACHE = 'image-to-ascii-v1';

self.addEventListener('install', () => {
    // Activate this worker as soon as it's installed, without waiting for all
    // tabs of the old version to close.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
            // Take control of already-open pages so caching starts immediately.
            await self.clients.claim();
        })(),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Only GETs are cacheable; let everything else hit the network untouched.
    if (request.method !== 'GET') return;

    // Don't touch cross-origin requests (CDNs, analytics, etc.).
    if (new URL(request.url).origin !== self.location.origin) return;

    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE);
            const cached = await cache.match(request);

            // Revalidate in the background: refresh the cache when online, but
            // never let a network failure reject the response.
            const fromNetwork = fetch(request)
                .then((response) => {
                    if (response && response.ok) cache.put(request, response.clone());
                    return response;
                })
                .catch(() => null);

            // Serve cache immediately if we have it; otherwise wait for network.
            const response = cached || (await fromNetwork);
            if (response) return response;

            // Offline with nothing cached for this URL: for a page navigation,
            // fall back to the cached app shell so the SPA can still boot.
            if (request.mode === 'navigate') {
                const shell = (await cache.match('/index.html')) || (await cache.match('/'));
                if (shell) return shell;
            }

            return Response.error();
        })(),
    );
});
