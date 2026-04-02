/**
 * Smart Attribution Engine v2 — read-time correction layer.
 *
 * Mirrors the proposed HubSpot workflow from the attribution audit:
 * fixes categoría using hs_analytics_source, fills null canals from
 * source correlation, and enriches generic campaign names.
 *
 * Design principles:
 *   - Canal is NEVER overridden when present (business truth)
 *   - No campaign name pattern matching
 *   - Same logic as the proposed HubSpot workflow fix
 *   - Pure functions, no side effects
 *
 * @module smart-attribution
 */

import { logger } from "../shared/logger.js";

// ─── Constants ──────────────────────────────────────────────

const PAID_SOURCES = new Set([
  "PAID_SEARCH",
  "PAID_SOCIAL",
  "OTHER_CAMPAIGNS",
]);

const PAID_UTM_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "display",
  "banner",
  "paid",
  "adsmovil",
  "video_paid",
]);

const OUTBOUND_CHANNELS = new Set(["OB WHATSAPP", "OB MAIL"]);

const GENERIC_CAMPANAS = new Set([
  "cotizador online",
  "sin campaña",
  "sin campana",
  "(vacío)",
  "",
  "undefined",
  "null",
]);

/** source_data_1 values that are not useful as campaign names */
const GENERIC_SOURCE_DATA = new Set([
  "INTEGRATION",
  "IMPORT",
  "Facebook",
  "CRM_UI",
  "BCC_TO_CRM",
  "MOBILE_ANDROID",
  "MOBILE_IOS",
  "Unknown keywords (SSL)",
]);

// ─── Types ──────────────────────────────────────────────────

export interface ContactProps {
  canal?: string;
  campana?: string;
  categoria?: string;
  hs_analytics_source?: string;
  hs_analytics_source_data_1?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  [key: string]: string | undefined;
}

// ─── Attribution Functions ──────────────────────────────────

/**
 * Compute the correct category from multiple signals.
 *
 * Priority chain (mirrors proposed HubSpot workflow):
 *   1. canal ∈ OB channels       → Outbound (business action override)
 *   2. hs_analytics_source PAID  → Pago
 *   3. canal ∈ REDES/Comparadores → Pago
 *   4. utm_medium = paid variant  → Pago
 *   5. catch-all                  → Organico
 */
export function computeSmartCategoria(props: ContactProps): string {
  const canal = props.canal ?? "";
  const source = props.hs_analytics_source ?? "";
  const utmMedium = props.utm_medium?.toLowerCase() ?? "";

  // 1. Outbound channels ALWAYS override — business action > traffic signal
  if (OUTBOUND_CHANNELS.has(canal)) {
    return "Outbound";
  }

  // 2. HubSpot analytics source — first-touch, most reliable
  if (PAID_SOURCES.has(source)) return "Pago";

  // 3. Canal-based paid classification (REDES = Meta forms, Comparadores = paid)
  if (canal === "REDES" || canal === "Comparadores") return "Pago";

  // 4. UTM medium fallback (for OFFLINE contacts with tracking)
  if (utmMedium && PAID_UTM_MEDIUMS.has(utmMedium)) return "Pago";

  // 5. Catch-all — gold standard: anything without a paid signal is organic
  return "Organico";
}

/**
 * Compute the best available channel.
 *
 * Core principle: the HubSpot `canal` field is the business point-of-entry.
 * It is ALWAYS preserved when present.
 *
 * Only when `canal` is null/empty do we infer from source correlation:
 *   PAID_SOCIAL  → REDES              (93% correlation in audit data)
 *   PAID_SEARCH  → WEB MEDICUS / COTI ONLINE (80% correlation)
 *   ORGANIC_*    → WEB MEDICUS / COTI ONLINE (highest correlation)
 *   OFFLINE      → "Sin canal"        (can't infer)
 */
export function computeSmartCanal(props: ContactProps): string {
  const canal = props.canal ?? "";

  // Canal exists → preserve it, always
  if (canal) return canal;

  // Canal is missing — infer from source (gold standard: never leave unclassified)
  const source = props.hs_analytics_source ?? "";

  if (source === "PAID_SOCIAL") return "REDES";

  if (
    source === "PAID_SEARCH" ||
    source === "ORGANIC_SEARCH" ||
    source === "DIRECT_TRAFFIC" ||
    source === "REFERRALS" ||
    source === "SOCIAL_MEDIA" ||
    source === "AI_REFERRALS"
  ) {
    return "WEB MEDICUS / COTI ONLINE";
  }

  return "Sin canal";
}

/**
 * Compute a human-readable traffic source label.
 *
 * Priority:
 *   1. hs_analytics_source (if not OFFLINE) → direct mapping
 *   2. OFFLINE + UTM signals → infer from utm_source/medium
 *   3. OFFLINE + canal → infer from channel context
 */
export function computeSmartSource(props: ContactProps): string {
  const source = props.hs_analytics_source ?? "";
  const utmSource = props.utm_source?.toLowerCase() ?? "";
  const utmMedium = props.utm_medium?.toLowerCase() ?? "";
  const canal = props.canal ?? "";

  // Non-OFFLINE sources: direct mapping
  switch (source) {
    case "PAID_SEARCH":
      return "Google Ads";
    case "PAID_SOCIAL":
      if (utmSource === "instagram" || utmSource === "ig") return "Instagram Ads";
      if (utmSource === "tiktok") return "TikTok Ads";
      return "Meta Ads";
    case "OTHER_CAMPAIGNS":
      return "Programática";
    case "ORGANIC_SEARCH":
      return "Orgánico";
    case "DIRECT_TRAFFIC":
      return "Directo";
    case "SOCIAL_MEDIA":
      return "Social orgánico";
    case "REFERRALS":
    case "AI_REFERRALS":
      return "Referral";
  }

  // OFFLINE: HubSpot marks API/import contacts as OFFLINE.
  // Infer the real source from UTMs first, then canal.

  // UTM-based (228 contacts have google/cpc despite being OFFLINE)
  if (utmSource === "google" && utmMedium === "cpc") return "Google Ads";
  if (utmMedium === "display") return "Programática";
  if (utmSource === "meta" || utmSource === "ig" || utmSource === "instagram") return "Meta Ads";

  // Canal-based inference for remaining OFFLINE contacts.
  // Only deterministic channels can reliably tell us the traffic source.
  // CHENGO/WEB MEDICUS are channels, not sources — we don't know if they
  // saw a Google Ad, Meta Ad, or came organically before using them.
  switch (canal) {
    case "REDES":
      return "Meta Ads";
    case "Comparadores":
      return "Comparadores";
    case "OB WHATSAPP":
    case "OB MAIL":
      return "Outbound";
    case "REFERIDOS":
    case "Programa de Referidos":
      return "Referidos";
    case "INTERFAZ GH":
      return "Interfaz GH";
    case "Influencers":
      return "Influencers";
    case "Eventos":
      return "Eventos";
    case "BBDD":
      return "BBDD";
    default:
      // CHENGO, WEB MEDICUS, empty, or any other → unknown traffic source
      return "Desconocido";
  }
}

/**
 * Compute the best available campaign name.
 *
 * Enriches generic values ("Cotizador Online", empty) from UTM/source_data.
 * Does NOT use campaign names for attribution decisions.
 */
export function computeSmartCampana(props: ContactProps): string {
  const campana = props.campana?.trim() ?? "";
  const utmCampaign = props.utm_campaign?.trim() ?? "";
  const sourceData1 = props.hs_analytics_source_data_1?.trim() ?? "";

  // If campana has a meaningful value, use it
  if (campana && !GENERIC_CAMPANAS.has(campana.toLowerCase())) {
    return campana;
  }

  // Fallback to UTM campaign
  if (utmCampaign) return utmCampaign;

  // Fallback to source_data_1 (skip generic integration values)
  if (sourceData1 && !GENERIC_SOURCE_DATA.has(sourceData1)) {
    // Numeric Google Ads campaign IDs → prefix for readability
    if (/^\d{8,}$/.test(sourceData1)) {
      return `Ads #${sourceData1}`;
    }
    return sourceData1;
  }

  return campana || "Sin campaña";
}

// ─── Observability ──────────────────────────────────────────

export interface ReclassificationStats {
  totalProcessed: number;
  categoriaMoved: number;
  canalMoved: number;
  campanaEnriched: number;
}

export function createStats(): ReclassificationStats {
  return { totalProcessed: 0, categoriaMoved: 0, canalMoved: 0, campanaEnriched: 0 };
}

export function recordReclassification(
  stats: ReclassificationStats,
  rawCategoria: string,
  rawCanal: string,
  rawCampana: string,
  smartCategoria: string,
  smartCanal: string,
  smartCampana: string,
): void {
  stats.totalProcessed++;
  if (smartCategoria !== rawCategoria) stats.categoriaMoved++;
  if (smartCanal !== rawCanal) stats.canalMoved++;
  if (smartCampana !== rawCampana) stats.campanaEnriched++;
}

export function logStats(
  stats: ReclassificationStats,
  period: { from: number; to: number },
): void {
  if (stats.totalProcessed === 0) return;

  logger.info(
    {
      reclassified: {
        total: stats.totalProcessed,
        categoriaMoved: stats.categoriaMoved,
        canalMoved: stats.canalMoved,
        campanaEnriched: stats.campanaEnriched,
        categoriaPct: Number(((stats.categoriaMoved / stats.totalProcessed) * 100).toFixed(1)),
        canalPct: Number(((stats.canalMoved / stats.totalProcessed) * 100).toFixed(1)),
      },
      period,
    },
    "Smart attribution reclassification stats",
  );
}
