// src/utils/cache.ts
// Intelligent LRU cache with TTL, memory + AsyncStorage tiers, integrity validation
// Prevents redundant API calls — products cached 24h, prices 1h, AI results 6h

import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from './logger';
import perf from './performance';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
  hits: number;
  checksum: string;
  version: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  byteSize: number;
}

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'shuddhaahar_cache_';
const MAX_MEMORY_ENTRIES = 50;

// TTLs in milliseconds
export const TTL = {
  PRODUCT:         24 * 60 * 60 * 1000,  // 24 hours — product data rarely changes
  PRICE:           60 * 60 * 1000,        // 1 hour — prices change daily
  AI_ANALYSIS:     6  * 60 * 60 * 1000,  // 6 hours — same product, same user = same result
  RECOMMENDATIONS: 6  * 60 * 60 * 1000,  // 6 hours
  SEARCH:          30 * 60 * 1000,        // 30 minutes
  USER_PROFILE:    5  * 60 * 1000,        // 5 minutes — refresh frequently
};

function checksum(data: unknown): string {
  // Simple but fast hash for integrity checks
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

class Cache {
  private memory: Map<string, CacheEntry<unknown>> = new Map();
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, byteSize: 0 };

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.cachedAt > entry.ttlMs;
  }

  private isValid<T>(entry: CacheEntry<T>): boolean {
    if (entry.version !== CACHE_VERSION) return false;
    if (this.isExpired(entry)) return false;
    // Integrity check
    if (checksum(entry.data) !== entry.checksum) {
      logger.warn('cache', 'Cache integrity check failed — data may be corrupted');
      return false;
    }
    return true;
  }

  private evictOldest() {
    if (this.memory.size < MAX_MEMORY_ENTRIES) return;
    // Remove least recently used (lowest hits + oldest)
    let oldestKey = '';
    let oldestScore = Infinity;
    this.memory.forEach((entry, key) => {
      const score = entry.hits + (entry.cachedAt / 1000000);
      if (score < oldestScore) { oldestScore = score; oldestKey = key; }
    });
    if (oldestKey) {
      this.memory.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const start = Date.now();

    // L1: Memory cache
    const memEntry = this.memory.get(key) as CacheEntry<T> | undefined;
    if (memEntry) {
      if (this.isValid(memEntry)) {
        memEntry.hits++;
        this.stats.hits++;
        perf.recordMetric('cache_read', Date.now() - start, 'ms', { tier: 'memory', hit: 'true' });
        return memEntry.data;
      }
      this.memory.delete(key);
    }

    // L2: AsyncStorage cache
    try {
      const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (raw) {
        const entry: CacheEntry<T> = JSON.parse(raw);
        if (this.isValid(entry)) {
          // Promote back to memory
          this.evictOldest();
          this.memory.set(key, { ...entry, hits: (entry.hits || 0) + 1 });
          this.stats.hits++;
          perf.recordMetric('cache_read', Date.now() - start, 'ms', { tier: 'storage', hit: 'true' });
          return entry.data;
        }
        // Expired — clean up
        AsyncStorage.removeItem(CACHE_PREFIX + key);
      }
    } catch (err) {
      logger.warn('cache', 'AsyncStorage read failed', { key }, err as Error);
    }

    this.stats.misses++;
    perf.recordMetric('cache_read', Date.now() - start, 'ms', { hit: 'false' });
    return null;
  }

  async set<T>(key: string, data: T, ttlMs: number): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      cachedAt: Date.now(),
      ttlMs,
      hits: 0,
      checksum: checksum(data),
      version: CACHE_VERSION,
    };

    // L1: Memory
    this.evictOldest();
    this.memory.set(key, entry as CacheEntry<unknown>);

    // L2: AsyncStorage (async, non-blocking)
    AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry)).catch(err => {
      logger.warn('cache', 'AsyncStorage write failed', { key });
    });

    logger.debug('cache', `Cached: ${key}`, { ttlHours: Math.round(ttlMs / 3600000 * 10) / 10 });
  }

  async invalidate(key: string): Promise<void> {
    this.memory.delete(key);
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // Remove all keys matching pattern from memory
    this.memory.forEach((_, key) => {
      if (key.includes(pattern)) this.memory.delete(key);
    });
    // Remove from storage
    try {
      const keys = await AsyncStorage.getAllKeys();
      const matching = keys.filter(k => k.startsWith(CACHE_PREFIX) && k.includes(pattern));
      if (matching.length) await AsyncStorage.multiRemove(matching);
    } catch { /* ignore */ }
  }

  async clear(): Promise<void> {
    this.memory.clear();
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length) await AsyncStorage.multiRemove(cacheKeys);
    } catch { /* ignore */ }
    logger.info('cache', 'Cache cleared');
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total === 0 ? 0 : Math.round((this.stats.hits / total) * 100),
      memoryEntries: this.memory.size,
    };
  }
}

export const cache = new Cache();
export default cache;
