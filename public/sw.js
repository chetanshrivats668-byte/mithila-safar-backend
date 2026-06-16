// ============================================================
// Yatri Point — Service Worker (PWA Offline Support)
// ============================================================
const CACHE_NAME = 'ms-booking-v4';

// Files to cache for offline use
const OFFLINE_ASSETS = [
    '/',
    '/index.html',
    '/collab-routes.html',
    '/collaborator-dashboard.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
];

// ===== INSTALL: cache core shell =====
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(OFFLINE_ASSETS).catch(() => {
                // Silently fail — some files may not exist yet
            });
        })
    );
    self.skipWaiting();
});

// ===== ACTIVATE: clean up old caches =====
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// ===== FETCH: network-first, fall back to cache =====
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Never intercept API calls or Firebase — always go to network
    if (
        url.pathname.startsWith('/api/') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('google.com') ||
        request.method !== 'GET'
    ) {
        return; // let browser handle natively
    }

    // For everything else: network first, cache fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cache successful HTML/CSS/JS responses
                if (response.ok && (
                    url.pathname.endsWith('.html') ||
                    url.pathname.endsWith('.css') ||
                    url.pathname.endsWith('.js') ||
                    url.pathname === '/'
                )) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(() => {
                // Network failed — try cache
                return caches.match(request).then((cached) => {
                    if (cached) return cached;
                    // Ultimate fallback for navigation requests
                    if (request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});
