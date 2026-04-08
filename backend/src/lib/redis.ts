/**
 * Redis cache layer with graceful fallback.
 * If Redis is unavailable, all operations silently return null/void.
 * The app works without Redis — it's a performance optimization, not a dependency.
 */

import Redis from 'ioredis';

let redis: Redis | null = null;
let isConnected = false;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

try {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      if (times > 3) return null; // Stop retrying after 3 attempts
      return Math.min(times * 500, 2000);
    },
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  redis.on('connect', () => {
    isConnected = true;
    console.log('[Redis] Connected');
  });

  redis.on('error', (err) => {
    if (isConnected) console.warn('[Redis] Connection lost:', err.message);
    isConnected = false;
  });

  redis.on('close', () => {
    isConnected = false;
  });

  // Attempt connection (non-blocking)
  redis.connect().catch(() => {
    console.warn('[Redis] Not available — running without cache');
    redis = null;
  });
} catch {
  console.warn('[Redis] Init failed — running without cache');
}

/** Get a cached value. Returns null if not found or Redis unavailable. */
export async function cacheGet<T = string>(key: string): Promise<T | null> {
  if (!redis || !isConnected) return null;
  try {
    const val = await redis.get(key);
    if (!val) return null;
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}

/** Set a cached value with TTL (seconds). */
export async function cacheSet(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
  if (!redis || !isConnected) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch { /* silent */ }
}

/** Delete a cached value. */
export async function cacheDel(key: string): Promise<void> {
  if (!redis || !isConnected) return;
  try {
    await redis.del(key);
  } catch { /* silent */ }
}

/** Delete all keys matching a pattern (e.g. "ws:*"). */
export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!redis || !isConnected) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch { /* silent */ }
}

/** Check if Redis is connected. */
export function isRedisConnected(): boolean {
  return isConnected;
}

/** Graceful shutdown. */
export async function closeRedis(): Promise<void> {
  if (redis) {
    try { await redis.quit(); } catch { /* silent */ }
  }
}

export default redis;
