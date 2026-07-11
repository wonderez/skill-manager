/**
 * CacheService — generic TTL-based in-memory cache for API responses.
 *
 * Provides a lightweight, dependency-free caching layer that can be used
 * by any backend route or service to avoid redundant computation or
 * expensive I/O. Entries auto-expire after their TTL elapses and are
 * lazily evicted on access.
 *
 * Observability: hit/miss counters are tracked so callers can monitor
 * cache effectiveness via `stats()`.
 *
 * Design:
 * - Static class method pattern (consistent with other services).
 * - Internal storage: `Map<string, { value: unknown; expiresAt: number }>`.
 * - Default TTL: 30 000 ms (30 seconds).
 * - No `any` type — uses `unknown` with casts at the boundary.
 */

// ==================== Type Definitions ====================

/** Internal cache entry shape. */
interface CacheEntry {
  /** The cached value (opaque to the cache itself). */
  value: unknown;
  /** Absolute epoch timestamp (ms) at which this entry expires. */
  expiresAt: number;
}

/** Snapshot of cache statistics for observability. */
export interface CacheStats {
  /** Number of entries currently held in the cache. */
  entries: number;
  /** Total cache hits since the service started. */
  hits: number;
  /** Total cache misses since the service started. */
  misses: number;
  /** Hit rate as a fraction in [0, 1]. Returns 0 when no lookups have occurred. */
  hitRate: number;
}

// ==================== Constants ====================

/** Default time-to-live for cache entries: 30 seconds. */
const DEFAULT_TTL_MS = 30_000;

// ==================== Service ====================

export class CacheService {
  /** Internal storage keyed by caller-provided cache key. */
  private static store = new Map<string, CacheEntry>();

  /** Cumulative hit counter for `stats()`. */
  private static hitCount = 0;

  /** Cumulative miss counter for `stats()`. */
  private static missCount = 0;

  /**
   * Retrieve a cached value by key.
   *
   * Returns `null` if the key is absent or has expired (expired entries
   * are evicted on access). Increments the hit or miss counter accordingly.
   *
   * @param key Cache key to look up.
   * @returns The cached value, or `null` on miss / expiry.
   */
  static get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount++;
      return null;
    }

    // Lazy expiration: evict and count as a miss if the TTL has elapsed.
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return entry.value as T;
  }

  /**
   * Store a value in the cache with an optional TTL.
   *
   * @param key Cache key under which to store the value.
   * @param value The value to cache.
   * @param ttlMs Time-to-live in milliseconds. Defaults to 30 000 ms.
   */
  static set<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
    const expiresAt = Date.now() + Math.max(0, ttlMs);
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Invalidate a single cache key.
   *
   * @param key The cache key to remove.
   */
  static invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Invalidate all cache keys matching a regex pattern.
   *
   * Useful for bulk invalidation when a resource changes (e.g.
   * `invalidatePattern('^skills:')` clears all skill-list caches).
   *
   * @param pattern A string that is compiled into a RegExp. All keys
   *                that test positive against the pattern are removed.
   */
  static invalidatePattern(pattern: string): void {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      // If the pattern is not a valid regex, treat it as a literal prefix match.
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear the entire cache, removing all entries.
   * Hit/miss counters are reset to zero as well.
   */
  static clear(): void {
    this.store.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Get a value from the cache, or compute it via the factory function
   * and store the result for subsequent lookups.
   *
   * @param key Cache key.
   * @param factory Async function that produces the value on a miss.
   * @param ttlMs Time-to-live in milliseconds. Defaults to 30 000 ms.
   * @returns The cached or freshly-computed value.
   */
  static async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Return a snapshot of cache statistics for observability.
   *
   * @returns An object with entry count, hit/miss totals, and hit rate.
   */
  static stats(): CacheStats {
    // Purge expired entries so the count is accurate.
    this.purgeExpired();

    const total = this.hitCount + this.missCount;
    return {
      entries: this.store.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: total === 0 ? 0 : this.hitCount / total,
    };
  }

  // ==================== Private Helpers ====================

  /**
   * Remove all expired entries from the store.
   * Called internally by `stats()` to keep the entry count accurate.
   */
  private static purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}
