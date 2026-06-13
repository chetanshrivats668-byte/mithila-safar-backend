import { isSupabaseAvailable } from './supabaseClient.js';

let RedisClientClass;
try {
  RedisClientClass = (await import('ioredis')).default;
} catch (e) {
  console.warn('[REDIS] ioredis package is not installed. Using local mock fallback client.');
}

class MockRedis {
  constructor() {
    this.store = new Map();
    this.expiries = new Map();
    console.log('[REDIS] Mock Client initialized.');
  }

  async get(key) {
    this._checkExpiry(key);
    return this.store.get(key) || null;
  }

  async set(key, value, expiryMode, expiryTime) {
    this.store.set(key, String(value));
    if (expiryMode === 'EX') {
      this.expiries.set(key, Date.now() + expiryTime * 1000);
    } else if (expiryMode === 'PX') {
      this.expiries.set(key, Date.now() + expiryTime);
    }
    return 'OK';
  }

  async del(key) {
    const deleted = this.store.delete(key);
    this.expiries.delete(key);
    return deleted ? 1 : 0;
  }

  async incr(key) {
    this._checkExpiry(key);
    let val = parseInt(this.store.get(key) || '0', 10);
    val++;
    this.store.set(key, String(val));
    return val;
  }

  async expire(key, seconds) {
    if (this.store.has(key)) {
      this.expiries.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }

  async keys(pattern) {
    const keys = [];
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.store.keys()) {
      this._checkExpiry(key);
      if (this.store.has(key) && regex.test(key)) {
        keys.push(key);
      }
    }
    return keys;
  }

  async scan(cursor, matchOpt, pattern, countOpt, count) {
    const matches = await this.keys(pattern || '*');
    return ['0', matches];
  }

  async dbsize() {
    return this.store.size;
  }

  _checkExpiry(key) {
    const exp = this.expiries.get(key);
    if (exp && Date.now() > exp) {
      this.store.delete(key);
      this.expiries.delete(key);
    }
  }
}

let redisClient;
const isProd = process.env.NODE_ENV === 'production';
const redisUrl = process.env.REDIS_URL;

if (RedisClientClass && redisUrl) {
  try {
    redisClient = new RedisClientClass(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      reconnectOnError: () => false
    });
    redisClient.on('error', (err) => {
      console.error('[REDIS] Client error:', err.message);
    });
  } catch (err) {
    console.error('[REDIS] Failed to initialize Redis client. Falling back to mock.', err);
    redisClient = new MockRedis();
  }
} else {
  if (isProd) {
    console.error('FATAL: REDIS_URL is required in production environment.');
    process.exit(1);
  }
  redisClient = new MockRedis();
}

export default redisClient;
