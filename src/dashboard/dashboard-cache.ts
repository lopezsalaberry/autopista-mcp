/**
 * In-memory cache with TTL for dashboard API responses.
 * Prevents hammering HubSpot API on every dashboard page load.
 *
 * Supports stale-on-error: when external APIs are down and cache
 * has expired, get({ allowStale: true }) returns the last known
 * good data with staleness metadata.
 */

interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
  fetchedAt: number;
}

export class DashboardCache {
  private store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries = 50) {
    this.maxEntries = maxEntries;
  }

  /** Get cached data or null if expired/missing. With allowStale, returns expired data as fallback. */
  get<T = unknown>(key: string, opts?: { allowStale?: boolean }): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      // Return stale data when requested (stale-on-error pattern)
      if (opts?.allowStale) return entry.data as T;
      // Don't delete — keep for future stale-on-error fallback.
      // Entries are evicted by LRU (set) or clear() instead.
      return null;
    }
    return entry.data as T;
  }

  /** Check if a cached entry is stale (expired but still in store). */
  isStale(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    return Date.now() > entry.expiresAt;
  }

  /** Get fetch timestamp for a cached entry (for stale data UX). */
  getFetchedAt(key: string): number | null {
    const entry = this.store.get(key);
    return entry?.fetchedAt ?? null;
  }

  /** Cache data with TTL in seconds. Evicts oldest if at capacity. */
  set<T = unknown>(key: string, data: T, ttlSeconds: number): void {
    // Evict oldest entry if at capacity (LRU)
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
      fetchedAt: Date.now(),
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
  stats(): { size: number; active: number; keys: string[] } {
    const now = Date.now();
    let active = 0;
    for (const [, v] of this.store) {
      if (now <= v.expiresAt) active++;
    }
    // Don't evict expired entries — they serve as stale-on-error fallback
    return { size: this.store.size, active, keys: [...this.store.keys()] };
  }
}

export const dashboardCache = new DashboardCache();
