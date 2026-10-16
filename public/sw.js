const CACHE_SHELL = 'savory-shell-v2';
const CACHE_RUNTIME = 'savory-runtime-v2';
const SHELL_ASSETS = ['/', '/manifest.webmanifest', '/favicon.svg'];
const MAX_RUNTIME_ENTRIES = 40;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_SHELL)
            .then((cache) => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_SHELL && key !== CACHE_RUNTIME)
                        .map((key) => caches.delete(key)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

async function trimRuntimeCache() {
    const cache = await caches.open(CACHE_RUNTIME);
    const keys = await cache.keys();
    if (keys.length <= MAX_RUNTIME_ENTRIES) return;
    await Promise.all(keys.slice(0, keys.length - MAX_RUNTIME_ENTRIES).map((key) => cache.delete(key)));
}

function isImageRequest(request) {
    return request.destination === 'image' || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(request.url);
}

function isShellAsset(url) {
    return (
        url.origin === self.location.origin &&
        (url.pathname === '/' ||
            url.pathname.startsWith('/_astro/') ||
            url.pathname === '/manifest.webmanifest' ||
            url.pathname === '/favicon.svg' ||
            url.pathname === '/sw.js')
    );
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // App shell + bundled assets: cache-first
    if (isShellAsset(url)) {
        event.respondWith(
            caches.open(CACHE_SHELL).then(async (cache) => {
                const cached = await cache.match(request);
                if (cached) return cached;
                const response = await fetch(request);
                if (response.ok) cache.put(request, response.clone());
                return response;
            }),
        );
        return;
    }

    // Images: network-first, size-capped runtime cache
    if (isImageRequest(request)) {
        event.respondWith(
            caches.open(CACHE_RUNTIME).then(async (cache) => {
                try {
                    const response = await fetch(request);
                    if (response.ok) {
                        cache.put(request, response.clone());
                        trimRuntimeCache();
                    }
                    return response;
                } catch {
                    const cached = await cache.match(request);
                    if (cached) return cached;
                    throw new Error('Offline image unavailable');
                }
            }),
        );
        return;
    }

    // Everything else: network with cache fallback
    event.respondWith(
        fetch(request)
            .then(async (response) => {
                if (response.ok && url.origin === self.location.origin) {
                    const cache = await caches.open(CACHE_RUNTIME);
                    cache.put(request, response.clone());
                    trimRuntimeCache();
                }
                return response;
            })
            .catch(async () => {
                const cached =
                    (await caches.match(request)) || (await caches.match('/'));
                if (cached) return cached;
                return new Response('Offline', { status: 503, statusText: 'Offline' });
            }),
    );
});
