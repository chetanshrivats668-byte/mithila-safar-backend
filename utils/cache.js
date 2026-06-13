/**
 * Redis-backed LRU + TTL response cache for Express.
 * ==================================================
 * Use as middleware on read-heavy routes:
 *
 *     import { cacheResponse, invalidate } from './utils/cache.js';
 *     router.get('/api/listings/cab', cacheResponse({ ttl: 60_000 }), handler);
 *
 * After a mutation, drop the related prefix(es):
 *     invalidate('/api/listings/cab');
 */

import redisClient from './redisClient.js';

const DEFAULT_TTL = 30_000; // 30s

function buildKey(req) {
    const vary = req.headers['authorization']
        ? '|auth=' + req.headers['authorization'].slice(0, 32)
        : '';
    return req.method + ' ' + req.originalUrl + vary;
}

/**
 * Express middleware.
 * @param {object} opts
 * @param {number} [opts.ttl]        - ms before entry expires
 * @param {boolean}[opts.respectAuth] - if false, ignore Authorization header when keying
 */
export function cacheResponse(opts = {}) {
    const ttl = Number.isFinite(opts.ttl) ? opts.ttl : DEFAULT_TTL;
    const respectAuth = opts.respectAuth !== false;

    return async function cacheMw(req, res, next) {
        if (req.method !== 'GET') return next();
        if (req.headers['cache-control'] === 'no-store') return next();
        if (respectAuth && req.headers['authorization']) return next();

        const key = buildKey(req);

        try {
            const hitStr = await redisClient.get(key);
            if (hitStr) {
                const hit = JSON.parse(hitStr);
                res.setHeader('X-Cache', 'HIT');
                res.setHeader('Age', String(Math.floor((Date.now() - hit.stored) / 1000)));
                if (hit.etag) res.setHeader('ETag', hit.etag);
                res.status(hit.status);
                return res.send(hit.body);
            }
        } catch (e) {
            console.warn('[cache] read error:', e.message);
        }

        res.setHeader('X-Cache', 'MISS');

        // Wrap res.send to capture the body
        const originalSend = res.send.bind(res);
        res.send = function (body) {
            try {
                if (res.statusCode === 200 && body !== undefined && body !== null) {
                    const entry = {
                        stored: Date.now(),
                        status: res.statusCode,
                        body,
                        etag: res.getHeader('ETag') || null,
                    };
                    redisClient.set(key, JSON.stringify(entry), 'PX', ttl)
                        .catch(err => console.warn('[cache] write failed:', err.message));
                }
            } catch (e) {
                console.warn('[cache] failed to store response:', e.message);
            }
            return originalSend(body);
        };

        next();
    };
}

/** Drop all cache entries whose key contains `needle`. */
export async function invalidate(needle) {
    try {
        if (!needle) {
            // Full reset: delete all keys starting with "GET " or "POST "
            const keys = await redisClient.keys('*');
            for (const key of keys) {
                if (key.startsWith('GET ') || key.startsWith('POST ')) {
                    await redisClient.del(key);
                }
            }
            return;
        }
        const keys = await redisClient.keys(`*${needle}*`);
        for (const key of keys) {
            await redisClient.del(key);
        }
    } catch (e) {
        console.warn('[cache] invalidate failed:', e.message);
    }
}

/**
 * Like cacheResponse, but for non-GET requests whose result is fully determined
 * by the request body. Keys on `req.body` (JSON-stringified, sorted).
 *
 * Use only on public, idempotent search endpoints — never on writes.
 */
export function cacheResponseByBody(opts = {}) {
    const ttl = Number.isFinite(opts.ttl) ? opts.ttl : DEFAULT_TTL;

    return async function cacheMw(req, res, next) {
        if (req.headers['cache-control'] === 'no-store') return next();
        if (req.headers['authorization']) return next();

        // Stable key from a sorted-key JSON of the body.
        let bodyKey = '';
        try {
            const sorted = Object.keys(req.body || {}).sort().reduce((o, k) => {
                o[k] = req.body[k];
                return o;
            }, {});
            bodyKey = JSON.stringify(sorted);
        } catch {
            return next();
        }
        const key = req.method + ' ' + req.originalUrl.split('?')[0] + '::' + bodyKey;

        try {
            const hitStr = await redisClient.get(key);
            if (hitStr) {
                const hit = JSON.parse(hitStr);
                res.setHeader('X-Cache', 'HIT');
                res.setHeader('Age', String(Math.floor((Date.now() - hit.stored) / 1000)));
                res.status(hit.status);
                return res.send(hit.body);
            }
        } catch (e) {
            console.warn('[cache] read error:', e.message);
        }

        res.setHeader('X-Cache', 'MISS');

        const originalSend = res.send.bind(res);
        res.send = function (body) {
            try {
                if (res.statusCode === 200 && body !== undefined && body !== null) {
                    const entry = {
                        stored: Date.now(),
                        status: res.statusCode,
                        body,
                        etag: null,
                    };
                    redisClient.set(key, JSON.stringify(entry), 'PX', ttl)
                        .catch(err => console.warn('[cache] write failed:', err.message));
                }
            } catch (e) {
                console.warn('[cache] failed to store POST response:', e.message);
            }
            return originalSend(body);
        };

        next();
    };
}

/** Read-only stats for /api/admin/cache-stats (handy for debugging). */
export async function stats() {
    try {
        const dbsize = await redisClient.dbsize();
        return {
            entries: dbsize,
            max: 'unlimited (handled by Redis memory limits)',
            defaultTtl: DEFAULT_TTL,
        };
    } catch {
        return {
            entries: 0,
            max: 'unknown',
            defaultTtl: DEFAULT_TTL,
        };
    }
}
