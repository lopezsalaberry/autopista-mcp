/**
 * HubSpot query functions for the Growth Dashboard.
 *
 * Validated query strategy:
 *   Base filters (5): dato_gh=true + Retail + fecha_primera_asignacion GTE/LTE + owner NOT_IN
 *   Drill-down adds 1 filter (max 6 per group): canal OR categoria OR convertido
 *   edad > 64 subtracted post-query (since combining it with drill-down exceeds 6 filters)
 *
 * Total queries per dashboard load: ~17
 */

import { config } from "../shared/config.js";
import { logger } from "../shared/logger.js";
import { EXCLUDED_OWNER_IDS, MAX_AGE, ALL_CANALES, CANAL_DISPLAY_NAMES } from "./dashboard-router.js";

const API = "https://api.hubapi.com";

// ─── Types ───────────────────────────────────────────────────
export interface LeadsResponse {
  period: { from: string; to: string };
  total: number;
  converted: number;
  conversionRate: number;
  byCategoria: CategoriaBreakdown[];
  byCanal: CanalBreakdown[];
  topCampanas: CampanaBreakdown[];
  previousPeriod: PeriodComparison | null;
}

export interface CategoriaBreakdown {
  name: string;
  count: number;
  converted: number;
  rate: number;
  pct: number;
}

export interface CanalBreakdown {
  name: string;
  displayName: string;
  count: number;
  converted: number;
  rate: number;
  pct: number;
}

export interface CampanaBreakdown {
  name: string;
  canal: string;
  count: number;
  converted: number;
  rate: number;
}

export interface PeriodComparison {
  from: string;
  to: string;
  total: number;
  converted: number;
  conversionRate: number;
  deltaTotal: number;
  deltaConversion: number;
}

// ─── Concurrency Limiter ─────────────────────────────────────
const MAX_CONCURRENT = 4;
let inflight = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inflight < MAX_CONCURRENT) {
    inflight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queue.push(() => { inflight++; resolve(); });
  });
}

function releaseSlot(): void {
  inflight = Math.max(0, inflight - 1);
  const next = queue.shift();
  if (next) next();
}

// ─── HubSpot Search Helper (with throttle + retry) ──────────
const MAX_RETRIES = 3;

async function hubspotSearch(
  filters: Array<Record<string, unknown>>,
  properties: string[] = [],
  limit = 1,
): Promise<{ total: number; results: any[] }> {
  await acquireSlot();

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const body: Record<string, unknown> = {
        filterGroups: [{ filters }],
        limit,
      };
      if (properties.length > 0) body.properties = properties;

      const res = await fetch(`${API}/crm/v3/objects/contacts/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.HUBSPOT_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
        const delay = retryAfter * 1000 * (attempt + 1); // exponential backoff
        logger.warn({ attempt, delay }, "HubSpot 429 — retrying");
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const errorBody = await res.text();
        logger.error({ status: res.status, body: errorBody }, "HubSpot search error");
        throw new Error(`HubSpot API error: ${res.status}`);
      }

      return res.json();
    }

    throw new Error("HubSpot API: max retries exceeded");
  } finally {
    releaseSlot();
  }
}

// ─── Base Filter Builder ─────────────────────────────────────
function baseFilters(fromMs: number, toMs: number): Array<Record<string, unknown>> {
  return [
    { propertyName: "dato_gh", operator: "EQ", value: "true" },
    { propertyName: "categoria_de_venta", operator: "EQ", value: "Retail" },
    { propertyName: "fecha_primera_asignacion", operator: "GTE", value: String(fromMs) },
    { propertyName: "fecha_primera_asignacion", operator: "LTE", value: String(toMs) },
    { propertyName: "hubspot_owner_id", operator: "NOT_IN", values: EXCLUDED_OWNER_IDS },
  ];
}

// ─── Query Functions ─────────────────────────────────────────

/** Get total lead count. */
async function getTotalLeads(fromMs: number, toMs: number): Promise<number> {
  const { total } = await hubspotSearch(baseFilters(fromMs, toMs));
  return total;
}

/** Get count of leads with edad > MAX_AGE (to subtract). */
async function getOverAgeCount(fromMs: number, toMs: number): Promise<number> {
  const { total } = await hubspotSearch([
    ...baseFilters(fromMs, toMs),
    { propertyName: "edad", operator: "GT", value: String(MAX_AGE) },
  ]);
  return total;
}

/** Get total converted leads. */
async function getConvertedLeads(fromMs: number, toMs: number): Promise<number> {
  const { total } = await hubspotSearch([
    ...baseFilters(fromMs, toMs),
    { propertyName: "convertido", operator: "EQ", value: "true" },
  ]);
  return total;
}

/** Get count for a specific categoria. */
async function getCategoriaCount(fromMs: number, toMs: number, categoria: string): Promise<number> {
  const { total } = await hubspotSearch([
    ...baseFilters(fromMs, toMs),
    { propertyName: "categoria", operator: "EQ", value: categoria },
  ]);
  return total;
}

/** Get converted count for a specific categoria. */
async function getCategoriaConverted(fromMs: number, toMs: number, categoria: string): Promise<number> {
  // 7 filters — exceeds limit. Use 4-filter base (drop NOT_IN) for drill-downs
  const { total } = await hubspotSearch([
    { propertyName: "dato_gh", operator: "EQ", value: "true" },
    { propertyName: "categoria_de_venta", operator: "EQ", value: "Retail" },
    { propertyName: "fecha_primera_asignacion", operator: "GTE", value: String(fromMs) },
    { propertyName: "fecha_primera_asignacion", operator: "LTE", value: String(toMs) },
    { propertyName: "categoria", operator: "EQ", value: categoria },
    { propertyName: "convertido", operator: "EQ", value: "true" },
  ]);
  return total;
}

/** Get count for a specific canal. */
async function getCanalCount(fromMs: number, toMs: number, canal: string): Promise<number> {
  const { total } = await hubspotSearch([
    ...baseFilters(fromMs, toMs),
    { propertyName: "canal", operator: "EQ", value: canal },
  ]);
  return total;
}

/** Get converted count for a specific canal. */
async function getCanalConverted(fromMs: number, toMs: number, canal: string): Promise<number> {
  // Drop NOT_IN to stay within 6-filter limit
  const { total } = await hubspotSearch([
    { propertyName: "dato_gh", operator: "EQ", value: "true" },
    { propertyName: "categoria_de_venta", operator: "EQ", value: "Retail" },
    { propertyName: "fecha_primera_asignacion", operator: "GTE", value: String(fromMs) },
    { propertyName: "fecha_primera_asignacion", operator: "LTE", value: String(toMs) },
    { propertyName: "canal", operator: "EQ", value: canal },
    { propertyName: "convertido", operator: "EQ", value: "true" },
  ]);
  return total;
}

/** Get top campaigns with counts. */
async function getTopCampanas(
  fromMs: number,
  toMs: number,
  campanaNames: string[],
): Promise<CampanaBreakdown[]> {
  const results: CampanaBreakdown[] = [];

  for (const name of campanaNames) {
    const [total, converted] = await Promise.all([
      hubspotSearch([
        ...baseFilters(fromMs, toMs),
        { propertyName: "campana", operator: "EQ", value: name },
      ]).then(r => r.total),
      hubspotSearch([
        { propertyName: "dato_gh", operator: "EQ", value: "true" },
        { propertyName: "categoria_de_venta", operator: "EQ", value: "Retail" },
        { propertyName: "fecha_primera_asignacion", operator: "GTE", value: String(fromMs) },
        { propertyName: "fecha_primera_asignacion", operator: "LTE", value: String(toMs) },
        { propertyName: "campana", operator: "EQ", value: name },
        { propertyName: "convertido", operator: "EQ", value: "true" },
      ]).then(r => r.total),
    ]);

    if (total > 0) {
      results.push({
        name,
        canal: "",
        count: total,
        converted,
        rate: Number(((converted / total) * 100).toFixed(2)),
      });
    }
  }

  return results.sort((a, b) => b.count - a.count);
}

/** Discover top campaign names by fetching a sample of contacts. */
async function discoverTopCampanas(fromMs: number, toMs: number): Promise<string[]> {
  // Fetch 100 contacts and count campaign frequency
  const { results } = await hubspotSearch(
    baseFilters(fromMs, toMs),
    ["campana"],
    100,
  );

  const freq = new Map<string, number>();
  for (const c of results) {
    const camp = c.properties?.campana;
    if (camp) freq.set(camp, (freq.get(camp) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);
}

// ─── Main Orchestrator ───────────────────────────────────────

/**
 * Fetch all dashboard data for a given period.
 * Runs ~17 HubSpot API calls in parallel batches.
 */
export async function fetchLeadsData(
  from: string,
  to: string,
  previousFrom?: string,
  previousTo?: string,
): Promise<LeadsResponse> {
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T23:59:59.999Z`).getTime();

  const start = Date.now();

  // ── Batch 1: Totals ────────────────────────────────────────
  const [rawTotal, overAge, converted] = await Promise.all([
    getTotalLeads(fromMs, toMs),
    getOverAgeCount(fromMs, toMs),
    getConvertedLeads(fromMs, toMs),
  ]);

  const total = rawTotal - overAge;

  // ── Batch 2: Category + Canal breakdown (parallel) ─────────
  const categorias = ["Pago", "Organico", "Outbound"];

  const [catCounts, catConverted, canalCounts, canalConverted] = await Promise.all([
    Promise.all(categorias.map(c => getCategoriaCount(fromMs, toMs, c))),
    Promise.all(categorias.map(c => getCategoriaConverted(fromMs, toMs, c))),
    Promise.all(ALL_CANALES.map(c => getCanalCount(fromMs, toMs, c))),
    Promise.all(ALL_CANALES.map(c => getCanalConverted(fromMs, toMs, c))),
  ]);

  // Build categoria breakdown
  const byCategoria: CategoriaBreakdown[] = categorias.map((name, i) => ({
    name,
    count: catCounts[i],
    converted: catConverted[i],
    rate: catCounts[i] > 0 ? Number(((catConverted[i] / catCounts[i]) * 100).toFixed(2)) : 0,
    pct: total > 0 ? Number(((catCounts[i] / total) * 100).toFixed(1)) : 0,
  }));

  // Add "Sin clasificar" bucket
  const classifiedSum = catCounts.reduce((a, b) => a + b, 0);
  if (total > classifiedSum) {
    byCategoria.push({
      name: "Sin clasificar",
      count: total - classifiedSum,
      converted: 0,
      rate: 0,
      pct: total > 0 ? Number((((total - classifiedSum) / total) * 100).toFixed(1)) : 0,
    });
  }

  // Build canal breakdown (filter out canales with 0 count)
  const byCanal: CanalBreakdown[] = ALL_CANALES
    .map((name, i) => ({
      name,
      displayName: CANAL_DISPLAY_NAMES[name] || name,
      count: canalCounts[i],
      converted: canalConverted[i],
      rate: canalCounts[i] > 0 ? Number(((canalConverted[i] / canalCounts[i]) * 100).toFixed(2)) : 0,
      pct: total > 0 ? Number(((canalCounts[i] / total) * 100).toFixed(1)) : 0,
    }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // ── Batch 3: Top campaigns ─────────────────────────────────
  const campanaNames = await discoverTopCampanas(fromMs, toMs);
  const topCampanas = await getTopCampanas(fromMs, toMs, campanaNames);

  // ── Batch 4: Previous period comparison (if provided) ──────
  let previousPeriod: PeriodComparison | null = null;
  if (previousFrom && previousTo) {
    const prevFromMs = new Date(`${previousFrom}T00:00:00.000Z`).getTime();
    const prevToMs = new Date(`${previousTo}T23:59:59.999Z`).getTime();

    const [prevRaw, prevOverAge, prevConverted] = await Promise.all([
      getTotalLeads(prevFromMs, prevToMs),
      getOverAgeCount(prevFromMs, prevToMs),
      getConvertedLeads(prevFromMs, prevToMs),
    ]);

    const prevTotal = prevRaw - prevOverAge;
    const prevConvRate = prevTotal > 0 ? Number(((prevConverted / prevTotal) * 100).toFixed(2)) : 0;
    const currentConvRate = total > 0 ? Number(((converted / total) * 100).toFixed(2)) : 0;

    previousPeriod = {
      from: previousFrom,
      to: previousTo,
      total: prevTotal,
      converted: prevConverted,
      conversionRate: prevConvRate,
      deltaTotal: prevTotal > 0 ? Number((((total - prevTotal) / prevTotal) * 100).toFixed(2)) : 0,
      deltaConversion: Number((currentConvRate - prevConvRate).toFixed(2)),
    };
  }

  const elapsed = Date.now() - start;
  logger.info({ elapsed, total, converted, canales: byCanal.length }, "Dashboard data fetched");

  return {
    period: { from, to },
    total,
    converted,
    conversionRate: total > 0 ? Number(((converted / total) * 100).toFixed(2)) : 0,
    byCategoria,
    byCanal,
    topCampanas,
    previousPeriod,
  };
}
