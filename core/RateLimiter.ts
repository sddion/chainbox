/**
 * RateLimitConfig defines limits for a specific key (identity, function, tenant).
 */
type RateLimitConfig = {
  maxRequests: number;
  windowMs: number;
};

/**
 * RateLimitBucket tracks usage within a time window.
 */
type RateLimitBucket = {
  count: number;
  windowStart: number;
};

/**
 * Default rate limit configuration from environment.
 */
const DEFAULT_LIMITS = {
  // Format: "100/minute" or "1000/hour"
  default: parseRateLimit(process.env.CHAINBOX_RATE_LIMIT_DEFAULT || "100/minute"),
};

/**
 * Parse rate limit string like "100/minute" into config object.
 */
function parseRateLimit(limit: string): RateLimitConfig {
  const match = limit.match(/^(\d+)\/(second|minute|hour)$/);
  if (!match) {
    return { maxRequests: 100, windowMs: 60000 }; // Default fallback
  }

  const maxRequests = parseInt(match[1]);
  const timeUnit = match[2];
  
  const windowMs = {
    second: 1000,
    minute: 60000,
    hour: 3600000,
  }[timeUnit] || 60000;

  return { maxRequests, windowMs };
}

/**
 * RateLimiter enforces request rate limits using a sliding window algorithm.
 * 
 * Configuration via environment:
 * - CHAINBOX_RATE_LIMIT_DEFAULT: Default limit (e.g., "100/minute")
 * - CHAINBOX_RATE_LIMIT_<FUNCTION>: Function-specific limits (e.g., "User.Create" → "10/minute")
 */
export class RateLimiter {
  private static buckets: Map<string, RateLimitBucket> = new Map();
  private static functionLimits: Map<string, RateLimitConfig> = new Map();

  /**
   * Initialize function-specific limits from environment.
   * Called lazily on first use.
   */
  private static initialized = false;
  private static Init() {
    if (this.initialized) return;
    this.initialized = true;

    // Parse CHAINBOX_RATE_LIMIT_* environment variables
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith("CHAINBOX_RATE_LIMIT_") && key !== "CHAINBOX_RATE_LIMIT_DEFAULT") {
        const fnName = key.replace("CHAINBOX_RATE_LIMIT_", "").replace(/_/g, ".");
        this.functionLimits.set(fnName, parseRateLimit(value || ""));
      }
    }
  }

  /**
   * Get the applicable rate limit config for a function/identity combination.
   */
  private static GetLimit(fnName: string, identityId?: string): RateLimitConfig {
    this.Init();

    // Check function-specific limit
    if (this.functionLimits.has(fnName)) {
      return this.functionLimits.get(fnName)!;
    }

    // Check function namespace limit (e.g., "Admin.*")
    const namespace = fnName.split(".")[0];
    if (this.functionLimits.has(`${namespace}.*`)) {
      return this.functionLimits.get(`${namespace}.*`)!;
    }

    return DEFAULT_LIMITS.default;
  }

  /**
   * Build a unique bucket key for rate limiting.
   */
  private static BuildKey(fnName: string, identityId?: string): string {
    return identityId ? `${identityId}:${fnName}` : `anonymous:${fnName}`;
  }

  /**
   * Check if a request is allowed under rate limits.
   * Returns true if allowed, false if rate limited.
   */
  public static IsAllowed(fnName: string, identityId?: string): boolean {
    const key = this.BuildKey(fnName, identityId);
    const limit = this.GetLimit(fnName, identityId);
    const now = Date.now();

    let bucket = this.buckets.get(key);

    // Create new bucket if none exists or window expired
    if (!bucket || now - bucket.windowStart > limit.windowMs) {
      bucket = { count: 0, windowStart: now };
      this.buckets.set(key, bucket);
    }

    // Check limit
    if (bucket.count >= limit.maxRequests) {
      return false;
    }

    // Increment count
    bucket.count++;
    return true;
  }

  /**
   * Get remaining requests for a key.
   */
  public static GetRemaining(fnName: string, identityId?: string): number {
    const key = this.BuildKey(fnName, identityId);
    const limit = this.GetLimit(fnName, identityId);
    const bucket = this.buckets.get(key);

    if (!bucket || Date.now() - bucket.windowStart > limit.windowMs) {
      return limit.maxRequests;
    }

    return Math.max(0, limit.maxRequests - bucket.count);
  }

  /**
   * Get time until rate limit resets for a key.
   */
  public static GetResetTime(fnName: string, identityId?: string): number {
    const key = this.BuildKey(fnName, identityId);
    const limit = this.GetLimit(fnName, identityId);
    const bucket = this.buckets.get(key);

    if (!bucket) {
      return 0;
    }

    const resetAt = bucket.windowStart + limit.windowMs;
    return Math.max(0, resetAt - Date.now());
  }

  /**
   * Enforce rate limit, throwing if exceeded.
   */
  public static Enforce(fnName: string, identityId?: string): void {
    if (!this.IsAllowed(fnName, identityId)) {
      throw {
        error: "RATE_LIMITED",
        function: fnName,
        identity: identityId || "anonymous",
        remaining: 0,
        resetMs: this.GetResetTime(fnName, identityId),
        message: `Rate limit exceeded for ${fnName}. Try again in ${Math.ceil(this.GetResetTime(fnName, identityId) / 1000)}s.`,
      };
    }
  }
}
