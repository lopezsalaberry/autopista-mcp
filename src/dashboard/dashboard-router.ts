/**
 * Dashboard API router.
 *
 * Endpoints:
 * - GET /api/dashboard/data (unified — combines leads KPIs, cross-data, and venta online)
 * - GET /api/dashboard/vigencias?year=2026&startDay=21&endDay=22
 * - GET /api/dashboard/leads?from=YYYY-MM-DD&to=YYYY-MM-DD (deprecated — use /data)
 * - GET /api/dashboard/cross-data?from=YYYY-MM-DD&to=YYYY-MM-DD (deprecated — use /data)
 * - GET /api/dashboard/venta-online?from=YYYY-MM-DD&to=YYYY-MM-DD (deprecated — use /data)
 * - GET /api/dashboard/breakdown?from=&to=&dimension=
 * - GET /api/dashboard/owners (HubSpot owner name resolution)
 * - GET /api/dashboard/config (current dashboard configuration)
 * - PUT /api/dashboard/config/excluded-owners (update excluded owners)
 * - GET /api/dashboard/cache/stats
 * - DELETE /api/dashboard/cache (clear cache)
 *
 * Protected by JWT authentication (local or Keycloak OIDC).
 * Auth routes at /api/dashboard/auth/* are public.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { logger } from "../shared/logger.js";
import { config } from "../shared/config.js";
import { getAllVigencias, getPreviousPeriod, type VigenciaConfig } from "./vigencia.js";
import { dashboardCache } from "./dashboard-cache.js";
import { DashboardConfig } from "./dashboard-config.js";
import { fetchLeadsData, fetchBreakdown, fetchCrossData, fetchVentaOnline } from "./hubspot-queries.js";
import { authRouter, dashboardAuth } from "./dashboard-auth.js";

const router = Router();

// ─── Dynamic Configuration ──────────────────────────────────
export const dashboardConfig = new DashboardConfig();

/** Get current excluded owner IDs (delegates to runtime config). */
export function getExcludedOwnerIds(): string[] {
  return dashboardConfig.getExcludedOwnerIds();
}

/** Maximum age to include (contacts with edad > this are excluded). */
export const MAX_AGE = 64;

/** Canal display name mapping. */
export const CANAL_DISPLAY_NAMES: Record<string, string> = {
  "REDES": "Forms META",
  "CHENGO": "Whatsapp Chengo",
  "WEB MEDICUS / COTI ONLINE": "Cotizador WEB",
  "OB WHATSAPP": "Whatsapp (OB)",
  "OB MAIL": "Email",
  "Comparadores": "Comparadores",
  "REFERIDOS": "Referidos",
  "INTERFAZ GH": "Interfaz GH",
  "Programa de Referidos": "Programa de Referidos",
  "Influencers": "Influencers",
  "Eventos": "Eventos",
};

/** All canal values to query. */
export const ALL_CANALES = Object.keys(CANAL_DISPLAY_NAMES);

// ─── Auth Routes (public — no token required) ───────────────
router.use("/auth", authRouter);

// ─── JWT Auth Middleware (protects all routes below) ─────────
router.use(dashboardAuth as unknown as import("express").RequestHandler);

// ─── GET /vigencias ──────────────────────────────────────────
router.get("/vigencias", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const startDay = parseInt(req.query.startDay as string) || 21;
  const endDay = parseInt(req.query.endDay as string) || 22;

  // Year bounds validation (CTO audit finding)
  const currentYear = new Date().getFullYear();
  if (isNaN(year) || year < 2020 || year > currentYear + 1) {
    res.status(400).json({
      error: {
        code: "INVALID_YEAR",
        message: `Year must be between 2020 and ${currentYear + 1}. Got: ${year}`,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const vigenciaConfig: Partial<VigenciaConfig> = { startDay, endDay };
  const vigencias = getAllVigencias(year, vigenciaConfig);

  res.json({
    year,
    config: { startDay, endDay },
    vigencias,
  });
});

// ─── GET /previous-period ────────────────────────────────────
router.get("/previous-period", (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  if (!from || !to) {
    res.status(400).json({ error: { code: "INVALID_PARAMS", message: "from and to are required (YYYY-MM-DD)" } });
    return;
  }
  const prev = getPreviousPeriod(from, to);
  res.json({ current: { from, to }, previous: prev });
});

// ─── GET /leads (deprecated — kept for backwards compat) ─────
/** Smart TTL: historical periods cache longer since data doesn't change. */
export function computeCacheTTL(from: string, to: string): number {
  const today = new Date().toISOString().split("T")[0];
  if (to < today) return 3600;  // Historical: 1 hour
  if (from === to) return 120;  // "Hoy": 2 minutes
  return 300;                   // Active period: 5 minutes
}

router.get("/leads", async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const previousFrom = req.query.previousFrom as string | undefined;
  const previousTo = req.query.previousTo as string | undefined;

  if (!from || !to) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "from and to are required (YYYY-MM-DD)" },
    });
    return;
  }

  // Validate date format
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    res.status(400).json({
      error: { code: "INVALID_DATE_FORMAT", message: "Dates must be in YYYY-MM-DD format" },
    });
    return;
  }

  // Validate optional previous period dates
  if ((previousFrom && !dateRe.test(previousFrom)) || (previousTo && !dateRe.test(previousTo))) {
    res.status(400).json({
      error: { code: "INVALID_DATE_FORMAT", message: "previousFrom/previousTo must be in YYYY-MM-DD format" },
    });
    return;
  }

  // Guard against excessively large date ranges (YTD max ~400 days)
  const MAX_RANGE_DAYS = 400;
  const rangeDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS || rangeDays < 0) {
    res.status(400).json({
      error: { code: "RANGE_TOO_LARGE", message: `Date range cannot exceed ${MAX_RANGE_DAYS} days` },
    });
    return;
  }

  // Check cache (include previous period in key when explicitly provided)
  const cacheKey = dashboardCache.key("leads", {
    from, to,
    ...(previousFrom && previousTo ? { previousFrom, previousTo } : {}),
  });
  const cached = dashboardCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    // Use explicit previous period if provided (e.g., from vigencia settings),
    // otherwise fall back to arithmetic calculation (same duration, immediately before)
    const prev = (previousFrom && previousTo)
      ? { from: previousFrom, to: previousTo }
      : getPreviousPeriod(from, to);

    const data = await fetchLeadsData(from, to, prev.from, prev.to);

    // Cache the response with smart TTL
    dashboardCache.set(cacheKey, data, computeCacheTTL(from, to));

    res.json(data);
  } catch (err: unknown) {
    // Stale-on-error fallback: serve expired cache data if available
    const stale = dashboardCache.get(cacheKey, { allowStale: true });
    if (stale) {
      const fetchedAt = dashboardCache.getFetchedAt(cacheKey);
      logger.warn({ err, from, to, fetchedAt }, "Serving stale leads data (HubSpot error)");
      res.set("X-Data-Stale", "true");
      res.json({ ...stale as Record<string, unknown>, _stale: true, _fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null });
      return;
    }
    logger.error({ err, from, to }, "Error fetching leads data");
    res.status(500).json({
      error: {
        code: "HUBSPOT_ERROR",
        message: err instanceof Error ? err.message : "Failed to fetch leads data",
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// ─── GET /breakdown ──────────────────────────────────────────
const VALID_DIMENSIONS = ["categoria_de_venta", "categoria", "canal", "campana"];

router.get("/breakdown", async (req: Request, res: Response) => {
  const { from, to, dimension } = req.query as { from?: string; to?: string; dimension?: string };

  if (!from || !to || !dimension) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "from, to, and dimension are required" },
    });
    return;
  }

  if (!VALID_DIMENSIONS.includes(dimension)) {
    res.status(400).json({
      error: { code: "INVALID_DIMENSION", message: `dimension must be one of: ${VALID_DIMENSIONS.join(", ")}` },
    });
    return;
  }

  // Parse parent filters from query string (e.g., &canal=REDES&categoria_de_venta=Pago)
  const parentFilters: Record<string, string> = {};
  for (const dim of VALID_DIMENSIONS) {
    if (dim !== dimension && req.query[dim]) {
      parentFilters[dim] = req.query[dim] as string;
    }
  }

  // Check cache
  const cacheKey = dashboardCache.key("breakdown", { from, to, dimension, ...parentFilters });
  const cached = dashboardCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const data = await fetchBreakdown(from, to, dimension, parentFilters);
    dashboardCache.set(cacheKey, data, computeCacheTTL(from, to));
    res.json(data);
  } catch (err: unknown) {
    logger.error({ err, from, to, dimension, parentFilters }, "Error fetching breakdown");
    res.status(500).json({
      error: {
        code: "HUBSPOT_ERROR",
        message: err instanceof Error ? err.message : "Failed to fetch breakdown data",
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// ─── GET /cross-data ──────────────────────────────────────────
// Separate endpoint for cross-dimensional data (fetched lazily after dashboard load)
router.get("/cross-data", async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };

  if (!from || !to) {
    res.status(400).json({ error: { code: "INVALID_PARAMS", message: "from and to are required" } });
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    res.status(400).json({
      error: { code: "INVALID_DATE_FORMAT", message: "Dates must be in YYYY-MM-DD format" },
    });
    return;
  }

  // Guard against excessively large date ranges
  const MAX_RANGE_DAYS = 400;
  const rangeDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS || rangeDays < 0) {
    res.status(400).json({
      error: { code: "RANGE_TOO_LARGE", message: `Date range cannot exceed ${MAX_RANGE_DAYS} days` },
    });
    return;
  }

  const CACHE_VERSION = "v2-smart-attr";
  const cacheKey = dashboardCache.key("crossData", { from, to, v: CACHE_VERSION });
  const cached = dashboardCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  // Set a 2-minute server-side timeout for this long-running request
  req.setTimeout(120_000);

  try {
    const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
    const toMs = new Date(`${to}T23:59:59.999Z`).getTime();
    const data = await fetchCrossData(fromMs, toMs);
    dashboardCache.set(cacheKey, data, computeCacheTTL(from, to));
    res.json(data);
  } catch (err: unknown) {
    // Stale-on-error fallback
    const stale = dashboardCache.get(cacheKey, { allowStale: true });
    if (stale) {
      const fetchedAt = dashboardCache.getFetchedAt(cacheKey);
      logger.warn({ err, from, to, fetchedAt }, "Serving stale cross-data (HubSpot error)");
      res.set("X-Data-Stale", "true");
      res.json(stale);
      return;
    }
    logger.error({ err, from, to }, "Error fetching cross data");
    res.status(500).json({
      error: {
        code: "HUBSPOT_ERROR",
        message: err instanceof Error ? err.message : "Failed to fetch cross data",
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// ─── Owner name resolution ───────────────────────────────────
const HUBSPOT_API = "https://api.hubapi.com";

/** Normalize owner name to title case, with email fallback. */
function normalizeName(first?: string, last?: string, email?: string, id?: string): string {
  const raw = [first, last].filter(Boolean).join(" ").trim();
  if (raw) {
    return raw.replace(/\b\w+/g, w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    );
  }
  if (email) {
    const prefix = email.split("@")[0].replace(/[._]/g, " ");
    return prefix.replace(/\b\w+/g, w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    );
  }
  return id || "Desconocido";
}

router.get("/owners", async (_req: Request, res: Response) => {
  const cacheKey = dashboardCache.key("owners-v2", {});
  const cached = dashboardCache.get<{ names: Record<string, string>; teams: Record<string, string> }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const response = await fetch(`${HUBSPOT_API}/crm/v3/owners?limit=500`, {
      headers: { Authorization: `Bearer ${config.HUBSPOT_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Owners API: ${response.status}`);
    }

    const data = await response.json();
    const names: Record<string, string> = {};
    const teams: Record<string, string> = {};

    for (const o of (data.results || []) as Array<{
      id: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      teams?: Array<{ id: string; name: string; primary?: boolean }>;
    }>) {
      names[o.id] = normalizeName(o.firstName, o.lastName, o.email, o.id);
      // Extract primary team name (fallback to first team), strip "Equipo de " prefix
      if (o.teams && o.teams.length > 0) {
        const primary = o.teams.find(t => t.primary) || o.teams[0];
        let teamName = primary.name.trim();
        // Strip common prefixes to show just supervisor/region
        if (teamName.startsWith('Equipo de ')) teamName = teamName.substring('Equipo de '.length);
        if (teamName.startsWith('Equipo ')) teamName = teamName.substring('Equipo '.length);
        teams[o.id] = teamName.trim();
      }
    }

    const result = { names, teams };
    dashboardCache.set(cacheKey, result, 3600); // 1 hour
    res.json(result);
  } catch (err: unknown) {
    logger.error({ err }, "Error fetching HubSpot owners");
    res.status(500).json({
      error: {
        code: "HUBSPOT_ERROR",
        message: err instanceof Error ? err.message : "Failed to fetch owners",
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// ─── Dashboard configuration ────────────────────────────────
router.get("/config", (_req: Request, res: Response) => {
  res.json(dashboardConfig.getConfig());
});

router.put("/config/excluded-owners", (req: Request, res: Response) => {
  const body = req.body;

  // Validate input
  if (!body || !body.excludedOwnerIds) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "excludedOwnerIds array is required" },
    });
    return;
  }

  if (!Array.isArray(body.excludedOwnerIds)) {
    res.status(400).json({
      error: { code: "INVALID_FORMAT", message: "excludedOwnerIds must be an array" },
    });
    return;
  }

  if (body.excludedOwnerIds.length === 0) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "excludedOwnerIds cannot be empty (at least 1 owner must be excluded to prevent accidental data exposure)",
      },
    });
    return;
  }

  if (body.excludedOwnerIds.length > 100) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "excludedOwnerIds cannot exceed 100 entries" },
    });
    return;
  }

  // Validate each ID is a numeric string
  const invalidIds = body.excludedOwnerIds.filter(
    (id: unknown) => typeof id !== "string" && typeof id !== "number",
  );
  if (invalidIds.length > 0) {
    res.status(400).json({
      error: { code: "INVALID_FORMAT", message: "Each excludedOwnerId must be a string or number" },
    });
    return;
  }

  // Apply
  dashboardConfig.setExcludedOwnerIds(
    body.excludedOwnerIds.map(String),
    () => dashboardCache.clear(),
  );

  logger.info(
    { count: body.excludedOwnerIds.length },
    "Excluded owner IDs updated via API",
  );

  res.json({
    ...dashboardConfig.getConfig(),
    cacheCleared: true,
  });
});

// ─── GET /venta-online ───────────────────────────────────────
router.get("/venta-online", async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  if (!from || !to) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "from and to are required (YYYY-MM-DD)", timestamp: new Date().toISOString() },
    });
    return;
  }

  // Validate date format (YYYY-MM-DD)
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    res.status(400).json({
      error: { code: "INVALID_DATE_FORMAT", message: "Dates must be YYYY-MM-DD", timestamp: new Date().toISOString() },
    });
    return;
  }

  // Guard against excessively large date ranges
  const MAX_RANGE_DAYS = 400;
  const rangeDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS || rangeDays < 0) {
    res.status(400).json({
      error: { code: "RANGE_TOO_LARGE", message: `Date range cannot exceed ${MAX_RANGE_DAYS} days`, timestamp: new Date().toISOString() },
    });
    return;
  }

  const cacheKey = dashboardCache.key("venta-online", { from, to });
  const cached = dashboardCache.get<{ total: number; period: { from: string; to: string } }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const data = await fetchVentaOnline(from, to);
    dashboardCache.set(cacheKey, data, computeCacheTTL(from, to));
    res.json(data);
  } catch (err: unknown) {
    // Stale-on-error fallback
    const stale = dashboardCache.get(cacheKey, { allowStale: true });
    if (stale) {
      const fetchedAt = dashboardCache.getFetchedAt(cacheKey);
      logger.warn({ err, from, to, fetchedAt }, "Serving stale venta-online (HubSpot error)");
      res.set("X-Data-Stale", "true");
      res.json(stale);
      return;
    }
    logger.error({ err, from, to }, "Error fetching venta online");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// ─── GET /data (unified endpoint) ────────────────────────────
/**
 * Unified dashboard data endpoint. Returns KPI totals, cross-data, and
 * venta online in a single response. This replaces 3 separate frontend
 * requests with 1.
 *
 * KPI totals come from lightweight HubSpot count queries (3-6 calls).
 * Cross-data comes from paginated contact fetch with smart attribution.
 * Venta online comes from a deal search query.
 *
 * All three run in parallel for minimum latency.
 */
router.get("/data", async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const previousFrom = req.query.previousFrom as string | undefined;
  const previousTo = req.query.previousTo as string | undefined;

  if (!from || !to) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "from and to are required (YYYY-MM-DD)", timestamp: new Date().toISOString() },
    });
    return;
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    res.status(400).json({
      error: { code: "INVALID_DATE_FORMAT", message: "Dates must be in YYYY-MM-DD format", timestamp: new Date().toISOString() },
    });
    return;
  }

  if ((previousFrom && !dateRe.test(previousFrom)) || (previousTo && !dateRe.test(previousTo))) {
    res.status(400).json({
      error: { code: "INVALID_DATE_FORMAT", message: "previousFrom/previousTo must be in YYYY-MM-DD format", timestamp: new Date().toISOString() },
    });
    return;
  }

  const MAX_RANGE_DAYS = 400;
  const rangeDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS || rangeDays < 0) {
    res.status(400).json({
      error: { code: "RANGE_TOO_LARGE", message: `Date range cannot exceed ${MAX_RANGE_DAYS} days`, timestamp: new Date().toISOString() },
    });
    return;
  }

  const cacheKey = dashboardCache.key("unified-data", {
    from, to,
    ...(previousFrom && previousTo ? { previousFrom, previousTo } : {}),
  });
  const cached = dashboardCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  // Allow long-running request for large date ranges
  req.setTimeout(120_000);

  try {
    // Resolve previous period
    const prev = (previousFrom && previousTo)
      ? { from: previousFrom, to: previousTo }
      : getPreviousPeriod(from, to);

    const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
    const toMs = new Date(`${to}T23:59:59.999Z`).getTime();

    // Fire all three data sources in parallel
    const [leadsData, crossData, ventaOnlineData] = await Promise.all([
      fetchLeadsData(from, to, prev.from, prev.to),
      fetchCrossData(fromMs, toMs),
      fetchVentaOnline(from, to).catch((err: unknown) => {
        // Venta online is non-critical — degrade gracefully
        logger.warn({ err }, "Venta online fetch failed (non-critical)");
        return { total: 0, period: { from, to } };
      }),
    ]);

    const result = {
      // Authoritative KPI totals (from HubSpot aggregate counts)
      ...leadsData,
      // Smart-attributed analytical data
      crossData,
      // Deal-based KPI
      ventaOnline: ventaOnlineData.total,
      // Response metadata
      _meta: {
        fetchedAt: new Date().toISOString(),
        version: "v1",
      },
    };

    dashboardCache.set(cacheKey, result, computeCacheTTL(from, to));
    res.json(result);
  } catch (err: unknown) {
    // Stale-on-error fallback
    const stale = dashboardCache.get(cacheKey, { allowStale: true });
    if (stale) {
      const fetchedAt = dashboardCache.getFetchedAt(cacheKey);
      logger.warn({ err, from, to, fetchedAt }, "Serving stale unified data (HubSpot error)");
      res.set("X-Data-Stale", "true");
      const staleRecord = stale as Record<string, unknown>;
      const existingMeta = (staleRecord._meta && typeof staleRecord._meta === "object")
        ? staleRecord._meta as Record<string, unknown>
        : {};
      res.json({
        ...staleRecord,
        _meta: {
          ...existingMeta,
          stale: true,
          staleSince: fetchedAt ? new Date(fetchedAt).toISOString() : null,
        },
      });
      return;
    }
    logger.error({ err, from, to }, "Error fetching unified dashboard data");
    res.status(500).json({
      error: {
        code: "HUBSPOT_ERROR",
        message: err instanceof Error ? err.message : "Failed to fetch dashboard data",
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// ─── Cache management ────────────────────────────────────────
router.get("/cache/stats", (_req: Request, res: Response) => {
  const stats = dashboardCache.stats();
  // Only expose size in production, not key contents
  if (process.env.NODE_ENV === "production") {
    res.json({ size: stats.size });
  } else {
    res.json(stats);
  }
});

router.delete("/cache", (_req: Request, res: Response) => {
  dashboardCache.clear();
  logger.info("Dashboard cache cleared");
  res.json({ message: "Cache cleared" });
});

export default router;
