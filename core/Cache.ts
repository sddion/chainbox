/**
 * CacheEntry represents a cached result.
 */
type CacheEntry = {
  value: any;
  expiresAt: number;
  hits: number;
};

/**
 * CacheConfig for function-level caching rules.
 */
type CacheConfig = {
  ttlMs: number;
  keyFn?: (input: any) => string;
};

/**
 * Default cache configuration from environment.
 */
const DEFAULT_TTL_MS = parseInt(process.env.CHAINBOX_CACHE_DEFAULT_TTL_MS || "60000"); // 1 minute

/**
 * Cache provides result caching with TTL for Chainbox functions.
 * 
 * Caching conventions:
 * - Functions ending in ".Cached" are automatically cached
 * - Cache key = hash of function name + input
 * 
 * Configuration:
 * - CHAINBOX_CACHE_ENABLED: Enable/disable caching (default: true)
 * - CHAINBOX_CACHE_DEFAULT_TTL_MS: Default cache TTL (default: 60000)
 * - CHAINBOX_CACHE_MAX_SIZE: Maximum cache entries (default: 10000)
 */
export class Cache {
  private static enabled = process.env.CHAINBOX_CACHE_ENABLED !== "false";
  private static maxSize = parseInt(process.env.CHAINBOX_CACHE_MAX_SIZE || "10000");
  private static entries: Map<string, CacheEntry> = new Map();
  private static functionConfigs: Map<string, CacheConfig> = new Map();

  // Stats
  private static hits = 0;
  private static misses = 0;

  /**
   * Generate a cache key from function name and input.
   */
  private static GenerateKey(fnName: string, input: any): string {
    // Simple hash based on JSON stringification
    const inputStr = JSON.stringify(input || {});
    let hash = 0;
    for (let i = 0; i < inputStr.length; i++) {
      const char = inputStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${fnName}:${hash}`;
  }

  /**
   * Check if a function should be cached.
   */
  public static IsCacheable(fnName: string): boolean {
    if (!this.enabled) return false;
    // Functions ending in .Cached are automatically cached
    return fnName.endsWith(".Cached") || this.functionConfigs.has(fnName);
  }

  /**
   * Configure caching for a specific function.
   */
  public static Configure(fnName: string, config: CacheConfig): void {
    this.functionConfigs.set(fnName, config);
  }

  /**
   * Get the TTL for a function.
   */
  private static GetTTL(fnName: string): number {
    const config = this.functionConfigs.get(fnName);
    return config?.ttlMs || DEFAULT_TTL_MS;
  }

  /**
   * Get a cached result if available and not expired.
   */
  public static Get(fnName: string, input: any): any | undefined {
    if (!this.IsCacheable(fnName)) return undefined;

    const key = this.GenerateKey(fnName, input);
    const entry = this.entries.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      this.misses++;
      return undefined;
    }

    entry.hits++;
    this.hits++;
    return entry.value;
  }

  /**
   * Store a result in the cache.
   */
  public static Set(fnName: string, input: any, value: any): void {
    if (!this.IsCacheable(fnName)) return;

    // Evict oldest entries if at capacity
    if (this.entries.size >= this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) this.entries.delete(oldestKey);
    }

    const key = this.GenerateKey(fnName, input);
    const ttl = this.GetTTL(fnName);

    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      hits: 0,
    });
  }

  /**
   * Invalidate cache for a specific function and input.
   */
  public static Invalidate(fnName: string, input?: any): void {
    if (input !== undefined) {
      const key = this.GenerateKey(fnName, input);
      this.entries.delete(key);
    } else {
      // Invalidate all entries for this function
      for (const [key] of this.entries) {
        if (key.startsWith(fnName + ":")) {
          this.entries.delete(key);
        }
      }
    }
  }

  /**
   * Invalidate all cache entries matching a pattern.
   */
  public static InvalidatePattern(pattern: RegExp): void {
    for (const [key] of this.entries) {
      if (pattern.test(key)) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Clear the entire cache.
   */
  public static Clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics.
   */
  public static GetStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.entries.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Prune expired entries (can be called periodically).
   */
  public static Prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) {
        this.entries.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}
