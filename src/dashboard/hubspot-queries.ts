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
export interface CrossDataRow {
  categoria: string;
  canal: string;
  campana: string;
  date: string;       // YYYY-MM-DD in America/Buenos_Aires timezone
  leads: number;
  converted: number;
  ownerId: string;    // hubspot_owner_id ("sin_asignar" if unset)
}

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

// ─── Paginated Contact Fetch for Cross-Data ─────────────────
const CROSS_DATA_PROPS = ["categoria", "canal", "campana", "convertido", "fecha_primera_asignacion", "edad", "hubspot_owner_id"];
const CROSS_CATEGORIES = ["Pago", "Organico", "Outbound"];

/**
 * Fetch ALL contacts split by category to stay under HubSpot's 10k pagination limit.
 * Groups into (categoria, canal, campana) → {leads, converted} for client-side filtering.
 * Includes a final pass for "Sin clasificar" (contacts with no categoria set).
 */
export async function fetchCrossData(fromMs: number, toMs: number): Promise<CrossDataRow[]> {
  const start = Date.now();
  const map = new Map<string, { leads: number; converted: number }>();
  let totalContacts = 0;
  let totalPages = 0;

  // Helper: paginate a single filter set and aggregate into the map
  async function paginateCategory(
    label: string,
    filters: Array<Record<string, unknown>>,
  ): Promise<void> {
    let after: string | undefined;
    let catPages = 0;

    do {
      const body: Record<string, unknown> = {
        filterGroups: [{ filters }],
        properties: CROSS_DATA_PROPS,
        limit: 100,
      };
      if (after) body.after = after;

      let data: any;
      for (let attempt = 0; attempt <= 5; attempt++) {
        const res = await fetch(`${API}/crm/v3/objects/contacts/search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.HUBSPOT_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000), // 15s per request
        });

        if (res.status === 429 && attempt < 5) {
          const retryAfter = parseInt(res.headers.get("retry-after") || "3", 10);
          const delay = retryAfter * 1000 * (attempt + 1);
          logger.warn({ attempt, delay, categoria: label }, "CrossData 429 — retrying");
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (!res.ok) {
          const errorBody = await res.text();
          logger.error({ status: res.status, body: errorBody, categoria: label, page: catPages }, "CrossData page error");
          throw new Error(`HubSpot API error: ${res.status}`);
        }

        data = await res.json();
        break;
      }

      if (!data) throw new Error("CrossData: max retries exceeded");

      for (const contact of data.results || []) {
        const props = contact.properties || {};

        // Filter out over-age contacts (consistent with KPI logic)
        const edad = parseInt(props.edad || "0", 10);
        if (edad > MAX_AGE) continue;

        // Bucket by date — HubSpot returns fecha_primera_asignacion as ISO "YYYY-MM-DD"
        const date = props.fecha_primera_asignacion || "unknown";

        const canal = props.canal || "Sin canal";
        const campana = props.campana || "Sin campaña";
        const isConverted = props.convertido === "true";
        const ownerId = props.hubspot_owner_id || "sin_asignar";

        const key = `${label}\x00${canal}\x00${campana}\x00${date}\x00${ownerId}`;
        const existing = map.get(key);
        if (existing) {
          existing.leads++;
          if (isConverted) existing.converted++;
        } else {
          map.set(key, { leads: 1, converted: isConverted ? 1 : 0 });
        }
        totalContacts++;
      }

      after = data.paging?.next?.after;
      catPages++;
      totalPages++;
    } while (after && catPages < 100);
  }

  // Pass 1-3: Known categories (Pago, Organico, Outbound)
  for (const categoria of CROSS_CATEGORIES) {
    await paginateCategory(categoria, [
      { propertyName: "dato_gh", operator: "EQ", value: "true" },
      { propertyName: "categoria_de_venta", operator: "EQ", value: "Retail" },
      { propertyName: "fecha_primera_asignacion", operator: "GTE", value: String(fromMs) },
      { propertyName: "fecha_primera_asignacion", operator: "LTE", value: String(toMs) },
      { propertyName: "categoria", operator: "EQ", value: categoria },
      { propertyName: "hubspot_owner_id", operator: "NOT_IN", values: EXCLUDED_OWNER_IDS },
    ]);
  }

  // Pass 4: "Sin clasificar" — contacts where categoria is not set
  // Uses NOT_HAS_PROPERTY (5 filters + 1 = 6, within limit)
  await paginateCategory("Sin clasificar", [
    { propertyName: "dato_gh", operator: "EQ", value: "true" },
    { propertyName: "categoria_de_venta", operator: "EQ", value: "Retail" },
    { propertyName: "fecha_primera_asignacion", operator: "GTE", value: String(fromMs) },
    { propertyName: "fecha_primera_asignacion", operator: "LTE", value: String(toMs) },
    { propertyName: "categoria", operator: "NOT_HAS_PROPERTY" },
    { propertyName: "hubspot_owner_id", operator: "NOT_IN", values: EXCLUDED_OWNER_IDS },
  ]);

  const result: CrossDataRow[] = [];
  for (const [key, val] of map) {
    const [categoria, canal, campana, date, ownerId] = key.split("\x00");
    result.push({ categoria, canal, campana, date, ownerId, leads: val.leads, converted: val.converted });
  }

  const elapsed = Date.now() - start;
  logger.info({ elapsed, pages: totalPages, contacts: totalContacts, uniqueTuples: result.length }, "CrossData fetched");

  return result;
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

/** Get top campaigns with counts — parallelized via Promise.all. */
async function getTopCampanas(
  fromMs: number,
  toMs: number,
  campanaNames: string[],
): Promise<CampanaBreakdown[]> {
  const campanaResults = await Promise.all(
    campanaNames.map(async (name) => {
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
      return { name, total, converted };
    })
  );

  return campanaResults
    .filter(r => r.total > 0)
    .map(r => ({
      name: r.name,
      canal: "",
      count: r.total,
      converted: r.converted,
      rate: Number(((r.converted / r.total) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count);
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

// ─── UTM Breakdown (drill-down) ──────────────────────────────

export interface BreakdownItem {
  value: string;
  displayName: string;
  count: number;
  converted: number;
  rate: number;
  pct: number;
}

export interface BreakdownResponse {
  dimension: string;
  parentFilters: Record<string, string>;
  period: { from: string; to: string };
  total: number;
  items: BreakdownItem[];
}

/**
 * Fetch a breakdown by a single UTM dimension, optionally filtered
 * by parent dimensions (e.g., canal within a specific categoria).
 *
 * The HubSpot 6-filter limit constrains what we can do:
 * - Base filters: 5 (dato_gh, retail, date GTE, date LTE, owner NOT_IN)
 * - That leaves 1 slot for the drill-down dimension
 * - With 1 parent filter, we drop owner NOT_IN to fit
 * - With 2 parent filters, we drop owner NOT_IN to fit
 */
export async function fetchBreakdown(
  from: string,
  to: string,
  dimension: string,
  parentFilters: Record<string, string> = {},
): Promise<BreakdownResponse> {
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T23:59:59.999Z`).getTime();

  const parentEntries = Object.entries(parentFilters);
  const parentFilterCount = parentEntries.length;

  // Build filter set — drop owner NOT_IN if we need room for parents + dimension
  // Base: dato_gh(1) + retail(2) + date_gte(3) + date_lte(4) = 4
  // With owner: +1 = 5
  // Available slots: 6 - base = remaining for parents + dimension discovery
  const useOwnerFilter = parentFilterCount === 0; // only if no parents
  const buildFilters = (): Array<Record<string, unknown>> => {
    const f: Array<Record<string, unknown>> = [
      { propertyName: "dato_gh", operator: "EQ", value: "true" },
      { propertyName: "categoria_de_venta", operator: "EQ", value: "Retail" },
      { propertyName: "fecha_primera_asignacion", operator: "GTE", value: String(fromMs) },
      { propertyName: "fecha_primera_asignacion", operator: "LTE", value: String(toMs) },
    ];
    if (useOwnerFilter) {
      f.push({ propertyName: "hubspot_owner_id", operator: "NOT_IN", values: EXCLUDED_OWNER_IDS });
    }
    for (const [prop, val] of parentEntries) {
      f.push({ propertyName: prop, operator: "EQ", value: val });
    }
    return f;
  };

  // Step 1: Get parent-filtered total
  const { total: rawTotal } = await hubspotSearch(buildFilters());

  // Step 2: Discover unique values for the target dimension
  const dimProp = dimension; // e.g., "categoria_de_venta", "canal", "campana"
  let uniqueValues: string[];

  // Use known values for well-known dimensions
  if (dimProp === "categoria_de_venta") {
    uniqueValues = ["Pago", "Organico", "Outbound"];
  } else if (dimProp === "canal") {
    uniqueValues = ALL_CANALES;
  } else {
    // Discover from sample for campana or any other dimension
    const { results } = await hubspotSearch(
      buildFilters(),
      [dimProp],
      100,
    );
    const freq = new Map<string, number>();
    for (const c of results) {
      const val = c.properties?.[dimProp];
      if (val) freq.set(val, (freq.get(val) || 0) + 1);
    }
    uniqueValues = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15) // top 15 values
      .map(([name]) => name);
  }

  // Step 3: Query total + converted for each unique value — parallelized
  const itemResults = await Promise.all(
    uniqueValues.map(async (val) => {
      const dimFilter = { propertyName: dimProp, operator: "EQ", value: val };

      // Total: buildFilters() handles filter budget (drops owner when parents present)
      const totalFilters = [...buildFilters(), dimFilter];

      // Converted: need base(4) + parent(s) + dim(1) + convertido(1)
      let convertedFilters: Array<Record<string, unknown>>;

      if (parentFilterCount === 0) {
        // No parents: base(4) + dim(1) + convertido(1) = 6 ✅
        convertedFilters = [
          { propertyName: "dato_gh", operator: "EQ", value: "true" },
          { propertyName: "categoria_de_venta", operator: "EQ", value: "Retail" },
          { propertyName: "fecha_primera_asignacion", operator: "GTE", value: String(fromMs) },
          { propertyName: "fecha_primera_asignacion", operator: "LTE", value: String(toMs) },
          dimFilter,
          { propertyName: "convertido", operator: "EQ", value: "true" },
        ];
      } else {
        const allConvertedFilters = [
          { propertyName: "dato_gh", operator: "EQ", value: "true" },
          { propertyName: "categoria_de_venta", operator: "EQ", value: "Retail" },
          { propertyName: "fecha_primera_asignacion", operator: "GTE", value: String(fromMs) },
          { propertyName: "fecha_primera_asignacion", operator: "LTE", value: String(toMs) },
          ...parentEntries.map(([prop, v]) => ({ propertyName: prop, operator: "EQ", value: v })),
          dimFilter,
          { propertyName: "convertido", operator: "EQ", value: "true" },
        ];

        if (allConvertedFilters.length <= 6) {
          convertedFilters = allConvertedFilters;
        } else {
          // Must sacrifice parent filters: base(4) + dim(1) + convertido(1) = 6
          convertedFilters = [
            { propertyName: "dato_gh", operator: "EQ", value: "true" },
            { propertyName: "categoria_de_venta", operator: "EQ", value: "Retail" },
            { propertyName: "fecha_primera_asignacion", operator: "GTE", value: String(fromMs) },
            { propertyName: "fecha_primera_asignacion", operator: "LTE", value: String(toMs) },
            dimFilter,
            { propertyName: "convertido", operator: "EQ", value: "true" },
          ];
        }
      }

      const [countRes, convRes] = await Promise.all([
        hubspotSearch(totalFilters).then(r => r.total),
        hubspotSearch(convertedFilters).then(r => r.total),
      ]);

      return { val, countRes, convRes };
    })
  );

  const items: BreakdownItem[] = itemResults
    .filter(r => r.countRes > 0)
    .map(r => {
      const displayName = dimProp === "canal"
        ? (CANAL_DISPLAY_NAMES[r.val] || r.val)
        : r.val;
      // Clamp converted ≤ count (converted query may lack parent filter due to 6-filter limit)
      const clampedConverted = Math.min(r.convRes, r.countRes);
      return {
        value: r.val,
        displayName,
        count: r.countRes,
        converted: clampedConverted,
        rate: Number(((clampedConverted / r.countRes) * 100).toFixed(2)),
        pct: rawTotal > 0 ? Number(((r.countRes / rawTotal) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    dimension: dimProp,
    parentFilters,
    period: { from, to },
    total: rawTotal,
    items,
  };
}

