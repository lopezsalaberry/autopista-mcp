/**
 * In-memory cache with TTL for dashboard API responses.
 * Prevents hammering HubSpot API on every dashboard page load.
 */

interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
}

export class DashboardCache {
  private store = new Map<string, CacheEntry>();

  /** Get cached data or null if expired/missing. */
  get<T = unknown>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /** Cache data with TTL in seconds. */
  set<T = unknown>(key: string, data: T, ttlSeconds: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /** Generate a cache key from endpoint + params. */
  key(endpoint: string, params: Record<string, string | undefined>): string {
    const sorted = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return `${endpoint}?${sorted}`;
  }

  /** Clear all cached data. */
  clear(): void {
    this.store.clear();
  }

  /** Get cache stats. */
  stats(): { size: number; keys: string[] } {
    // Evict expired on stats call
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (now > v.expiresAt) this.store.delete(k);
    }
    return { size: this.store.size, keys: [...this.store.keys()] };
  }
}

export const dashboardCache = new DashboardCache();
