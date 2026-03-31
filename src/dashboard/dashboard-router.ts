/**
 * Dashboard API router.
 *
 * Endpoints:
 * - GET /api/dashboard/vigencias?year=2026&startDay=21&endDay=22
 * - GET /api/dashboard/leads?from=YYYY-MM-DD&to=YYYY-MM-DD  (Sprint 2)
 * - GET /api/dashboard/cache/stats
 * - DELETE /api/dashboard/cache (clear cache)
 *
 * Protected by API key via X-Dashboard-Key header.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { logger } from "../shared/logger.js";
import { getAllVigencias, getPreviousPeriod, type VigenciaConfig } from "./vigencia.js";
import { dashboardCache } from "./dashboard-cache.js";
import { fetchLeadsData, fetchBreakdown, fetchCrossData } from "./hubspot-queries.js";

const router = Router();

// ─── Constants ───────────────────────────────────────────────
/** Owner IDs to always exclude from lead counts. */
export const EXCLUDED_OWNER_IDS = [
  "2058415376", "79635496", "78939002", "79868309", "79868347",
  "83194003", "83194004", "83194005", "83194006", "83194007",
  "83194008", "596180848", "350718277", "1031288250",
];

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

// ─── API Key Middleware ──────────────────────────────────────
function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.DASHBOARD_API_KEY;

  // If no API key is configured, allow all requests (dev mode)
  if (!apiKey) {
    next();
    return;
  }

  const providedKey = req.headers["x-dashboard-key"] as string | undefined;
  if (!providedKey || providedKey !== apiKey) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or missing X-Dashboard-Key header",
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }
  next();
}

router.use(apiKeyAuth);

// ─── GET /vigencias ──────────────────────────────────────────
router.get("/vigencias", (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const startDay = parseInt(req.query.startDay as string) || 21;
  const endDay = parseInt(req.query.endDay as string) || 22;

  const config: Partial<VigenciaConfig> = { startDay, endDay };
  const vigencias = getAllVigencias(year, config);

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

// ─── GET /leads ──────────────────────────────────────────────
/** Smart TTL: historical periods cache longer since data doesn't change. */
function computeCacheTTL(from: string, to: string): number {
  const today = new Date().toISOString().split("T")[0];
  if (to < today) return 3600;  // Historical: 1 hour
  if (from === to) return 120;  // "Hoy": 2 minutes
  return 300;                   // Active period: 5 minutes
}

router.get("/leads", async (req: Request, res: Response) => {
  const { from, to } = req.query as { from?: string; to?: string };

  if (!from || !to) {
    res.status(400).json({
      error: { code: "INVALID_PARAMS", message: "from and to are required (YYYY-MM-DD)" },
    });
    return;
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    res.status(400).json({
      error: { code: "INVALID_DATE_FORMAT", message: "Dates must be in YYYY-MM-DD format" },
    });
    return;
  }

  // Check cache
  const cacheKey = dashboardCache.key("leads", { from, to });
  const cached = dashboardCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    // Compute previous period automatically
    const prev = getPreviousPeriod(from, to);

    const data = await fetchLeadsData(from, to, prev.from, prev.to);

    // Cache the response with smart TTL
    dashboardCache.set(cacheKey, data, computeCacheTTL(from, to));

    res.json(data);
  } catch (err: unknown) {
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

  const cacheKey = dashboardCache.key("crossData", { from, to });
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

