// Hand-rolled offline service worker — no dependencies, matching the app's
// zero-runtime-dependency design.
//
// Strategy: precache the app shell at install (so a single online visit is
// enough to go fully offline), then stale-while-revalidate every same-origin
// GET. A `#s=` share link works offline because its artwork lives in the URL
// and is regenerated client-side from the cached shell.
//
// To ship an update, bump CACHE; the old cache is purged on activate and the
// new worker takes control immediately (skipWaiting + clients.claim). The
// `/sw.js` response itself is served no-cache (see vercel.json) so a new
// worker version is noticed promptly.
const CACHE = 'image-to-ascii-v2';

// Cap on cached entries. Content-hashed asset filenames change every build, so
// without a bound old versions would accumulate forever between CACHE bumps.
const MAX_ENTRIES = 64;

// Precache the app shell so the FIRST online visit is enough to use the app
// offline afterwards. The hashed asset filenames aren't known ahead of time, so
// we fetch index.html and pull the same-origin src/href URLs out of it.
async function precacheShell(cache) {
    const res = await fetch('/', { cache: 'reload' });
    if (!res.ok) return;
    await cache.put('/', res.clone());

    const html = await res.text();
    const urls = new Set();
    const re = /(?:src|href)="([^"]+)"/g;
    let match;
    while ((match = re.exec(html))) {
        const url = match[1];
        // Same-origin absolute paths only (skip '/', '//cdn', 'data:', 'https:').
        if (url.startsWith('/') && !url.startsWith('//') && url !== '/') urls.add(url);
    }
    // allSettled so one missing asset can't abort precaching the rest.
    await Promise.allSettled([...urls].map((url) => cache.add(url)));
}

// FIFO-trim the cache (Cache.keys() returns insertion order; a re-put moves an
// entry to newest, so stale old-deploy assets sort oldest and evict first).
async function trimCache(cache) {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((key) => cache.delete(key)));
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE);
            // Best-effort: if we're offline at install, runtime caching fills in later.
            try { await precacheShell(cache); } catch { /* ignore */ }
            // Activate this worker as soon as it's installed.
            await self.skipWaiting();
        })(),
    );
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
                    // Skip 206 (partial) and any non-OK/opaque response so we never
                    // cache a truncated body and serve it as the full resource.
                    if (response && response.ok && response.status !== 206) {
                        cache.put(request, response.clone()).then(() => trimCache(cache));
                    }
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
