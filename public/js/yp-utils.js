/**
 * YP Utils — Yatri Point shared client library
 * =============================================
 * One file, four concerns:
 *   1. Skeleton loaders   — Skeleton.mount / Skeleton.unmount
 *   2. Server-down UI     — ServerError.show / ServerError.hide
 *   3. Debounce & throttle — YP.debounce / YP.throttle
 *   4. Smart apiFetch     — YP.api.get/post/... (timeout, retry, in-memory cache)
 *
 * Everything is exposed on a single `window.YP` namespace. No build step,
 * no dependencies. Just drop `yp-utils.js` into the page before `app.js`.
 */
(function (root) {
    'use strict';

    /* =====================================================================
     * 1) SKELETON LOADERS
     * =====================================================================
     * Renders an animated grey placeholder inside any container. Matches the
     * shape of typical result cards so the layout doesn't jump when content
     * arrives.
     */
    const Skeleton = (() => {
        const CSS = `
        .yp-skel { position: relative; overflow: hidden; background: #ececec; border-radius: 6px; }
        .yp-skel::after {
            content: ''; position: absolute; inset: 0;
            background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.55) 50%, rgba(255,255,255,0) 100%);
            transform: translateX(-100%);
            animation: yp-skel-shimmer 1.2s infinite;
        }
        @keyframes yp-skel-shimmer { 100% { transform: translateX(100%); } }
        .yp-skel-card {
            display: flex; flex-direction: column; gap: 10px;
            padding: 16px; border: 1px solid #eee; border-radius: 12px;
            background: #fff; margin-bottom: 12px;
        }
        .yp-skel-row { display: flex; gap: 12px; align-items: center; }
        .yp-skel-line { height: 12px; border-radius: 4px; }
        .yp-skel-circle { width: 44px; height: 44px; border-radius: 50%; }
        @media (prefers-reduced-motion: reduce) {
            .yp-skel::after { animation: none; }
        }
        `;

        function injectCssOnce() {
            if (document.getElementById('yp-skel-style')) return;
            const tag = document.createElement('style');
            tag.id = 'yp-skel-style';
            tag.textContent = CSS;
            document.head.appendChild(tag);
        }

        // Build a single skeleton card. Pass {lines, withAvatar, width}.
        function card({ lines = 3, withAvatar = true, lineWidths } = {}) {
            injectCssOnce();
            const widths = lineWidths || lines === 3
                ? ['60%', '90%', '40%']
                : Array(lines).fill('80%');
            const avatar = withAvatar ? '<div class="yp-skel yp-skel-circle"></div>' : '';
            const lineHtml = widths.map(w =>
                `<div class="yp-skel yp-skel-line" style="width:${w}; height:12px;"></div>`
            ).join('');
            return `
                <div class="yp-skel-card">
                    <div class="yp-skel-row">
                        ${avatar}
                        <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
                            ${lineHtml}
                        </div>
                    </div>
                </div>
            `;
        }

        // Mount N skeleton cards inside a container.
        function mount(container, count = 4) {
            if (!container) return;
            const host = typeof container === 'string' ? document.querySelector(container) : container;
            if (!host) return;
            host.dataset.ypPrevHtml = host.innerHTML;
            host.innerHTML = Array.from({ length: count }, () => card()).join('');
            host.classList.add('yp-skel-host');
        }

        // Restore whatever was there before mount().
        function unmount(container) {
            if (!container) return;
            const host = typeof container === 'string' ? document.querySelector(container) : container;
            if (!host) return;
            const hasSkeleton = host.querySelector('.yp-skel-card') || host.querySelector('.yp-skel');
            if (host.dataset.ypPrevHtml !== undefined) {
                if (hasSkeleton) {
                    host.innerHTML = host.dataset.ypPrevHtml;
                }
                delete host.dataset.ypPrevHtml;
            } else {
                if (hasSkeleton) {
                    host.innerHTML = '';
                }
            }
            host.classList.remove('yp-skel-host');
        }

        return { mount, unmount, card, injectCssOnce };
    })();


    /* =====================================================================
     * 2) SERVER-DOWN UI
     * =====================================================================
     * A polished full-viewport overlay. Only shown when apiFetch gives up
     * (network error / 5xx after retries). Auto-dismisses on recovery.
     */
    const ServerError = (() => {
        const CSS = `
        #yp-server-error {
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(15, 15, 20, 0.92);
            backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none;
            transition: opacity 0.25s ease;
            font-family: 'Inter', system-ui, sans-serif;
            color: #fff;
        }
        #yp-server-error.yp-visible { opacity: 1; pointer-events: auto; }
        #yp-server-error .yp-card {
            max-width: 420px; width: 90%;
            background: #1c1c24; border-radius: 18px;
            padding: 32px 24px; text-align: center;
            box-shadow: 0 30px 80px rgba(0,0,0,.5);
            transform: translateY(10px);
            transition: transform 0.3s ease;
        }
        #yp-server-error.yp-visible .yp-card { transform: translateY(0); }
        #yp-server-error .yp-icon {
            width: 72px; height: 72px; border-radius: 50%;
            background: linear-gradient(135deg, #d84e55, #ff7a82);
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 16px;
            animation: yp-pulse 2s infinite;
        }
        @keyframes yp-pulse {
            0%,100% { box-shadow: 0 0 0 0 rgba(216,78,85,0.5); }
            50%     { box-shadow: 0 0 0 14px rgba(216,78,85,0); }
        }
        #yp-server-error h2 { margin: 0 0 8px; font-size: 1.4rem; font-weight: 700; }
        #yp-server-error p  { margin: 0 0 22px; color: #b9b9c4; line-height: 1.5; font-size: 0.95rem; }
        #yp-server-error button {
            background: #d84e55; color: #fff; border: 0; border-radius: 999px;
            padding: 12px 28px; font-weight: 600; font-size: 0.95rem;
            cursor: pointer; transition: transform .15s ease, background .2s ease;
        }
        #yp-server-error button:hover { background: #c33e45; transform: translateY(-1px); }
        #yp-server-error button:active { transform: translateY(0); }
        #yp-server-error .yp-dots { display: inline-block; width: 1.2em; text-align: left; }
        #yp-server-error .yp-dots::after {
            content: ''; animation: yp-dots 1.2s steps(4, end) infinite;
        }
        @keyframes yp-dots {
            0%   { content: ''; }
            25%  { content: '.'; }
            50%  { content: '..'; }
            75%  { content: '...'; }
        }
        `;

        let host = null;
        let retrying = false;
        let hideTimer = null;

        function ensureHost() {
            if (host && document.body.contains(host)) return host;
            if (!document.getElementById('yp-server-error-style')) {
                const tag = document.createElement('style');
                tag.id = 'yp-server-error-style';
                tag.textContent = CSS;
                document.head.appendChild(tag);
            }
            host = document.createElement('div');
            host.id = 'yp-server-error';
            host.innerHTML = `
                <div class="yp-card" role="alertdialog" aria-live="assertive">
                    <div class="yp-icon" aria-hidden="true">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff"
                             stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </div>
                    <h2>Our servers are taking a breather</h2>
                    <p>Something went wrong on our end. Please try again in a moment<span class="yp-dots"></span></p>
                    <button type="button" data-yp-retry>Try Again</button>
                </div>
            `;
            document.body.appendChild(host);
            host.querySelector('[data-yp-retry]').addEventListener('click', () => {
                if (retrying) return;
                retrying = true;
                hide();
                // Notify any listeners that a manual retry was requested.
                root.dispatchEvent(new CustomEvent('yp:retry'));
                setTimeout(() => { retrying = false; }, 500);
            });
            return host;
        }

        function show() {
            const el = ensureHost();
            clearTimeout(hideTimer);
            // requestAnimationFrame so the transition fires
            requestAnimationFrame(() => el.classList.add('yp-visible'));
        }

        function hide() {
            if (!host) return;
            host.classList.remove('yp-visible');
        }

        return { show, hide };
    })();


    /* =====================================================================
     * 3) DEBOUNCE & THROTTLE
     * =====================================================================
     * Classic trailing-edge implementations. Throttle guarantees first
     * call fires immediately; subsequent calls within the window are
     * suppressed (with the latest args preserved for the trailing call).
     */
    function debounce(fn, wait = 300) {
        let t = null;
        function debounced(...args) {
            clearTimeout(t);
            t = setTimeout(() => { t = null; fn.apply(this, args); }, wait);
        }
        debounced.cancel = () => { clearTimeout(t); t = null; };
        debounced.flush  = (...args) => { clearTimeout(t); t = null; fn.apply(this, args); };
        return debounced;
    }

    function throttle(fn, wait = 300) {
        let last = 0, trailingTimer = null, lastArgs = null;
        function throttled(...args) {
            const now = Date.now();
            const remaining = wait - (now - last);
            lastArgs = args;
            if (remaining <= 0) {
                if (trailingTimer) { clearTimeout(trailingTimer); trailingTimer = null; }
                last = now;
                fn.apply(this, args);
            } else if (!trailingTimer) {
                trailingTimer = setTimeout(() => {
                    last = Date.now();
                    trailingTimer = null;
                    fn.apply(this, lastArgs);
                }, remaining);
            }
        }
        throttled.cancel = () => {
            last = 0; clearTimeout(trailingTimer); trailingTimer = null;
        };
        return throttled;
    }


    /* =====================================================================
     * 4) API FETCH WRAPPER + IN-MEMORY CACHE
     * =====================================================================
     * - api.get('/path', { cache: true, cacheTtl: 30000 }) for GETs only.
     * - Built-in timeout (default 12s), single retry on network errors for
     *   idempotent verbs, and a ServerError overlay after the retry fails.
     * - In-flight de-duplication: 5 concurrent calls to the same URL share
     *   one promise.
     * - ETag/304 awareness: the server can return 304; we just return the
     *   cached body.
     * - Cache version buster: call `YP.api.invalidate(prefix)` after
     *   mutations so the next GET hits the network.
     */
    const Api = (() => {
        const DEFAULT_TIMEOUT = 12000;
        const RETRY_DELAY = 600;
        const IDEMPOTENT = new Set(['GET', 'HEAD']);
        const memory = new Map();        // url -> { ts, ttl, data, etag }
        const inflight = new Map();      // url -> Promise

        function buildUrl(path, query) {
            if (/^https?:/i.test(path)) return path;
            // Reuse the same origin logic as app.js if API_URL isn't set yet.
            const base = (root.API_URL || (
                (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
                    ? 'http://localhost:3001'
                    : location.origin
            ));
            const url = new URL(path.replace(/^\/+/, '/'), base.endsWith('/') ? base : base + '/');
            if (query) {
                Object.keys(query).forEach(k => {
                    if (query[k] !== undefined && query[k] !== null) {
                        url.searchParams.set(k, query[k]);
                    }
                });
            }
            return url.toString();
        }

        function cacheKey(url, method) {
            return method.toUpperCase() + ' ' + url;
        }

        function fresh(entry) {
            return entry && (Date.now() - entry.ts) < entry.ttl;
        }

        async function rawFetch(url, init, timeout) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            try {
                return await fetch(url, { ...init, signal: controller.signal });
            } finally {
                clearTimeout(timer);
            }
        }

        async function doRequest(method, path, opts = {}) {
            const {
                body, headers = {}, query,
                timeout = DEFAULT_TIMEOUT,
                cache = false, cacheTtl = 30_000,
                retries = 1,
                showErrorOnFail = true,
                dedupe = true,
            } = opts;

            const url = buildUrl(path, query);
            const key = cacheKey(url, method);

            // Cache hit for GET
            if (cache && method === 'GET') {
                const hit = memory.get(key);
                if (fresh(hit)) {
                    return { data: hit.data, status: 200, cached: true, etag: hit.etag };
                }
            }

            // In-flight de-dup
            if (dedupe && method === 'GET' && inflight.has(key)) {
                return inflight.get(key);
            }

            const promise = (async () => {
                const init = {
                    method,
                    headers: { 'Accept': 'application/json', ...headers },
                };
                if (body !== undefined) {
                    init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
                    init.body = typeof body === 'string' ? body : JSON.stringify(body);
                }
                if (cache && method === 'GET') {
                    const hit = memory.get(key);
                    if (hit && hit.etag) init.headers['If-None-Match'] = hit.etag;
                }

                let res;
                let lastErr;
                const attempts = IDEMPOTENT.has(method) ? (retries + 1) : 1;
                for (let i = 0; i < attempts; i++) {
                    try {
                        res = await rawFetch(url, init, timeout);
                        break;
                    } catch (e) {
                        lastErr = e;
                        // Wait before retrying (backoff)
                        if (i < attempts - 1) await new Promise(r => setTimeout(r, RETRY_DELAY * (i + 1)));
                    }
                }

                if (!res) {
                    // Network / timeout after retries
                    if (showErrorOnFail) ServerError.show();
                    throw new ApiError('NETWORK', 0, lastErr?.message || 'Network error');
                }

                if (res.status === 304) {
                    const hit = memory.get(key);
                    if (hit) {
                        hit.ts = Date.now();
                        return { data: hit.data, status: 200, cached: true, etag: hit.etag };
                    }
                }

                let data = null;
                const ct = res.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    try { data = await res.json(); } catch { data = null; }
                } else {
                    try { data = await res.text(); } catch { data = null; }
                }

                if (!res.ok) {
                    if (showErrorOnFail && res.status >= 500) ServerError.show();
                    throw new ApiError('HTTP', res.status, data?.message || res.statusText, data);
                }

                if (cache && method === 'GET' && res.ok) {
                    memory.set(key, {
                        ts: Date.now(),
                        ttl: cacheTtl,
                        data,
                        etag: res.headers.get('ETag'),
                    });
                }
                return { data, status: res.status, cached: false, etag: res.headers.get('ETag') };
            })();

            if (dedupe && method === 'GET') {
                inflight.set(key, promise);
                promise.finally(() => inflight.delete(key));
            }
            return promise;
        }

        // Public surface
        return {
            get:  (path, opts) => doRequest('GET',    path, opts),
            post: (path, body, opts) => doRequest('POST',   path, { ...opts, body }),
            put:  (path, body, opts) => doRequest('PUT',    path, { ...opts, body }),
            del:  (path, body, opts) => doRequest('DELETE', path, { ...opts, body }),
            patch:(path, body, opts) => doRequest('PATCH',  path, { ...opts, body }),

            // Drop entries that start with `prefix` (matched on the key).
            invalidate(prefix) {
                if (!prefix) { memory.clear(); return; }
                for (const k of memory.keys()) {
                    if (k.includes(prefix)) memory.delete(k);
                }
            },
            // Stats for debugging / a future debug panel.
            stats() {
                return { entries: memory.size, inflight: inflight.size };
            },
        };
    })();

    class ApiError extends Error {
        constructor(kind, status, message, payload) {
            super(message);
            this.name = 'ApiError';
            this.kind = kind;       // 'NETWORK' | 'HTTP'
            this.status = status;   // 0 for network errors
            this.payload = payload;
        }
    }


    /* =====================================================================
     * EXPORT
     * ===================================================================== */
    root.YP = {
        debounce,
        throttle,
        Skeleton,
        ServerError,
        api: Api,
        ApiError,
    };
})(window);
