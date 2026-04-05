/**
 * Pure utility functions and constants for the Growth Dashboard.
 * No React imports — framework-agnostic helpers only.
 */

import type { FilterMode, GoalDistribution, LeadsData, Settings, SortState, Vigencia, VigenciaOverride } from './types'

// ── Formatting ──────────────────────────────────────────────

export const fmt = (n: number) => n.toLocaleString('es-AR')
export const fmtPct = (n: number) => `${n.toFixed(2)}%`

export function convClass(rate: number) {
  if (rate >= 5) return 'conv-high'
  if (rate >= 2) return 'conv-mid'
  return 'conv-low'
}

// ── Date Utilities ──────────────────────────────────────────

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getDateRange(mode: FilterMode): { from: string; to: string; previousFrom?: string; previousTo?: string } | null {
  const now = new Date()
  const today = isoDate(now)

  switch (mode) {
    case 'hoy':
      return { from: today, to: today }
    case '7d': {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      return { from: isoDate(d), to: today }
    }
    case '30d': {
      const d = new Date(now)
      d.setDate(d.getDate() - 29)
      return { from: isoDate(d), to: today }
    }
    case 'mtd': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: isoDate(first), to: today }
    }
    default:
      return null // vigencia, qtd, ytd, custom handled separately
  }
}

/**
 * Compute vigencia-based QTD range.
 * Quarters map to vigencia months: Q1=1-3, Q2=4-6, Q3=7-9, Q4=10-12.
 * Uses vigencia boundaries (custom from/to) rather than calendar dates.
 * Previous period = full previous quarter's vigencias.
 */
export function getVigenciaQuarterRange(
  vigencias: Vigencia[],
): { from: string; to: string; previousFrom?: string; previousTo?: string } | null {
  if (!vigencias.length) return null
  const today = isoDate(new Date())

  // Find the active or most recent vigencia to determine current quarter
  const activeVig = vigencias.find(v => v.from <= today && today <= v.to)
    || vigencias.filter(v => v.from <= today).sort((a, b) => b.fromMs - a.fromMs)[0]
  if (!activeVig) return null

  const currentQ = Math.ceil(activeVig.month / 3) // 1,2,3,4
  const qStartMonth = (currentQ - 1) * 3 + 1     // 1,4,7,10
  const qEndMonth = currentQ * 3                   // 3,6,9,12

  // Current quarter vigencias
  const qVigs = vigencias
    .filter(v => v.month >= qStartMonth && v.month <= qEndMonth)
    .sort((a, b) => a.fromMs - b.fromMs)
  if (!qVigs.length) return null

  const from = qVigs[0].from
  const lastTo = qVigs[qVigs.length - 1].to
  const to = today < lastTo ? today : lastTo

  // Previous quarter vigencias (e.g., Q2→Q1)
  const prevQStart = qStartMonth - 3
  const prevQEnd = qStartMonth - 1
  const prevVigs = vigencias
    .filter(v => v.month >= prevQStart && v.month <= prevQEnd)
    .sort((a, b) => a.fromMs - b.fromMs)

  if (prevVigs.length) {
    return {
      from, to,
      previousFrom: prevVigs[0].from,
      previousTo: prevVigs[prevVigs.length - 1].to,
    }
  }
  return { from, to }
}

/**
 * Compute vigencia-based YTD range.
 * Uses all vigencias for the year, from first vigencia's start to today.
 * Previous period = same vigencias in previous year (calendar fallback).
 */
export function getVigenciaYearRange(
  vigencias: Vigencia[],
): { from: string; to: string; previousFrom?: string; previousTo?: string } | null {
  if (!vigencias.length) return null
  const today = isoDate(new Date())

  const sorted = [...vigencias].sort((a, b) => a.fromMs - b.fromMs)
  const from = sorted[0].from
  const lastVig = sorted[sorted.length - 1]
  const to = today < lastVig.to ? today : lastVig.to

  // Previous year fallback: shift the entire range back by ~365 days
  const fromDate = new Date(`${from}T12:00:00Z`)
  const toDate = new Date(`${to}T12:00:00Z`)
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 1)
  toDate.setUTCFullYear(toDate.getUTCFullYear() - 1)

  return {
    from, to,
    previousFrom: isoDate(fromDate),
    previousTo: isoDate(toDate),
  }
}

export const SHORT_MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

export function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${SHORT_MONTHS[m - 1]}`
}

// ── Settings Persistence ────────────────────────────────────

const SETTINGS_KEY = 'medicus-dashboard-settings'
const MAX_SETTINGS_BYTES = 512_000 // 500KB guard

export const DEFAULT_SETTINGS: Settings = {
  goalLeads: 15000,
  years: [2025, 2026],
  vigenciaOverrides: {},
  goalDistribution: {},
}

/**
 * Historical vigencia seed data — business-defined goals and distributions.
 * Applied once as a migration for users who don't have this data yet.
 * Key format: "YYYY-MM", same as vigenciaKey().
 */
const HISTORICAL_SEED: Record<string, VigenciaOverride> = {
  // ── 2025 ──────────────────────────────────────────────────
  '2025-01': {
    from: '2024-12-20', to: '2025-01-21',
    goalLeads: 6000,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 52, Pago: 24, Outbound: 24 } } },
  },
  '2025-02': {
    from: '2025-01-20', to: '2025-02-21',
    goalLeads: 7000,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 41, Pago: 23, Outbound: 36 } } },
  },
  '2025-03': {
    from: '2025-02-19', to: '2025-03-20',
    goalLeads: 8000,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 53, Pago: 22, Outbound: 25 } } },
  },
  '2025-04': {
    from: '2025-03-21', to: '2025-04-21',
    goalLeads: 6000,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 64, Pago: 29, Outbound: 6 } } },
  },
  '2025-05': {
    from: '2025-04-22', to: '2025-05-20',
    goalLeads: 6000,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 63, Pago: 27, Outbound: 10 } } },
  },
  '2025-06': {
    from: '2025-05-21', to: '2025-06-18',
    goalLeads: 6000,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 53, Pago: 28, Outbound: 19 } } },
  },
  '2025-07': {
    from: '2025-06-19', to: '2025-07-21',
    goalLeads: 6000,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 55, Pago: 32, Outbound: 13 } } },
  },
  '2025-08': {
    from: '2025-07-22', to: '2025-08-20',
    goalLeads: 6000,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 50, Pago: 25, Outbound: 25 } } },
  },
  '2025-09': {
    from: '2025-08-21', to: '2025-09-22',
    goalLeads: 6900,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 50, Pago: 27, Outbound: 23 } } },
  },
  '2025-10': {
    from: '2025-09-23', to: '2025-10-20',
    goalLeads: 7935,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 50, Pago: 27, Outbound: 23 } } },
  },
  '2025-11': {
    from: '2025-10-21', to: '2025-11-20',
    goalLeads: 9125,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 50, Pago: 27, Outbound: 23 } } },
  },
  '2025-12': {
    from: '2025-11-21', to: '2025-12-20',
    goalLeads: 10494,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 50, Pago: 27, Outbound: 23 } } },
  },
  // ── 2026 (Ene–Mar, rest uses global defaults) ─────────────
  '2026-01': {
    from: '2025-12-20', to: '2026-01-20',
    goalLeads: 10494,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 50, Pago: 27, Outbound: 23 } } },
  },
  '2026-02': {
    from: '2026-01-20', to: '2026-02-20',
    goalLeads: 12000,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 50, Pago: 27, Outbound: 23 } } },
  },
  '2026-03': {
    from: '2026-02-21', to: '2026-03-20',
    goalLeads: 15000,
    distribution: { byCategoria: { enabled: true, allocations: { Organico: 50, Pago: 27, Outbound: 23 } } },
  },
}

/**
 * Migrate legacy settings with numeric month keys to YYYY-MM string keys.
 * Also seeds historical vigencia data on first run.
 * Runs transparently — if already migrated, returns as-is.
 */
function migrateSettings(raw: Record<string, unknown>): Settings {
  const base = { ...DEFAULT_SETTINGS, ...raw } as Settings

  // Ensure years array exists and includes 2025
  if (!Array.isArray(base.years) || base.years.length === 0) {
    base.years = [2025, new Date().getFullYear()]
  } else if (!base.years.includes(2025)) {
    base.years = [2025, ...base.years].sort((a, b) => a - b)
  }

  // Ensure goalDistribution exists
  if (!base.goalDistribution || typeof base.goalDistribution !== 'object') {
    base.goalDistribution = {}
  }

  // Migrate numeric vigencia keys → YYYY-MM string keys
  const overrides = base.vigenciaOverrides ?? {}
  const migrated: Record<string, typeof base.vigenciaOverrides[string]> = {}
  let needsMigration = false

  for (const [key, value] of Object.entries(overrides)) {
    const numKey = parseInt(key, 10)
    if (!isNaN(numKey) && numKey >= 1 && numKey <= 12 && key === String(numKey)) {
      // Legacy numeric key: assume current year
      const migratedKey = vigenciaKey({ year: base.years[0], month: numKey })
      migrated[migratedKey] = value
      needsMigration = true
    } else {
      // Already a string key like "2026-04"
      migrated[key] = value
    }
  }

  if (needsMigration) {
    base.vigenciaOverrides = migrated
  }

  // Seed historical vigencia data (one-time, non-destructive)
  if (!base.vigenciaOverrides['2025-01']) {
    for (const [key, seed] of Object.entries(HISTORICAL_SEED)) {
      // Only seed if the user hasn't manually set this key
      if (!base.vigenciaOverrides[key]) {
        base.vigenciaOverrides[key] = seed
      }
    }
  }

  return base
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return migrateSettings(JSON.parse(raw))
  } catch { /* ignore corrupt data */ }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: Settings): void {
  const json = JSON.stringify(s)
  if (json.length > MAX_SETTINGS_BYTES) {
    // Silently refuse to persist oversized settings — caller should prevent this
    return
  }
  localStorage.setItem(SETTINGS_KEY, json)
}

// ── Vigencia Key ────────────────────────────────────────────

/** Single source of truth for vigencia override keys: "YYYY-MM" */
export function vigenciaKey(v: { year: number; month: number }): string {
  return `${v.year}-${String(v.month).padStart(2, '0')}`
}


// ── Year Validation ─────────────────────────────────────────

const MIN_YEAR = 2020
const MAX_YEARS = 5

/** Add a year to the list with validation. Returns null if invalid. */
export function addYear(year: number, current: number[]): number[] | null {
  const currentYear = new Date().getFullYear()
  if (year < MIN_YEAR || year > currentYear + 1) return null
  if (current.includes(year)) return null
  if (current.length >= MAX_YEARS) return null
  return [...current, year].sort((a, b) => b - a)
}

// ── Goal Resolution ─────────────────────────────────────────

/** Resolve the effective goal and distribution for a given vigencia key. */
export function resolveEffectiveGoal(settings: Settings, vKey: string): {
  goal: number
  distribution: { byCategoria?: GoalDistribution; byCanal?: GoalDistribution }
} {
  const override = settings.vigenciaOverrides[vKey]
  return {
    goal: override?.goalLeads ?? settings.goalLeads,
    distribution: override?.distribution ?? settings.goalDistribution,
  }
}

/**
 * Aggregate goals for all vigencias overlapping a date range.
 * Used for QTD/YTD to sum the individual vigencia goals.
 * Returns null if no vigencias overlap.
 */
export function resolveAggregateGoal(
  settings: Settings,
  vigencias: Vigencia[],
  from: string,
  to: string,
): number | null {
  const overlapping = vigencias.filter(v => v.from <= to && v.to >= from)
  if (!overlapping.length) return null

  return overlapping.reduce((sum, v) => {
    const vKey = vigenciaKey({ year: v.year, month: v.month })
    const resolved = resolveEffectiveGoal(settings, vKey)
    return sum + resolved.goal
  }, 0)
}

// ── Sortable Table Helpers ──────────────────────────────────

export function toggleSort<K extends string>(prev: SortState<K> | null, key: K): SortState<K> {
  if (prev?.key === key) return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
  return { key, dir: key === 'displayName' || key === 'value' ? 'asc' : 'desc' }
}

export function applySortFn<T>(items: T[], sort: SortState | null): T[] {
  if (!sort) return items
  const { key, dir } = sort
  return [...items].sort((a, b) => {
    const av = (a as Record<string, unknown>)[key]
    const bv = (b as Record<string, unknown>)[key]
    if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av
    const as = String(av ?? '').toLowerCase()
    const bs = String(bv ?? '').toLowerCase()
    return dir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
  })
}

// ── Geographic Enrichment ───────────────────────────────────

import geoLookup from './data/geo-lookup.json'

const geoData = geoLookup as Record<string, { city: string; province: string } | string>

/** Enrich a zip code to city + province using the GeoNames static dataset.
 *  Dual-key lookup: tries raw value first (handles CPA format), falls back to 4-digit numeric. */
export function enrichZip(zip: string): { city: string; province: string } | null {
  if (!zip) return null
  const trimmed = zip.trim()
  if (!trimmed) return null
  // Try raw value first (handles CPA format like "C1425DKA" and "B2705")
  const raw = geoData[trimmed]
  if (raw && typeof raw === 'object') return raw
  // Fall back to 4-digit numeric extraction
  const numeric = trimmed.replace(/[^0-9]/g, '').slice(0, 4)
  if (numeric.length === 4) {
    const found = geoData[numeric]
    if (found && typeof found === 'object') return found
  }
  return null
}

// ── Goal Progress ───────────────────────────────────────────

/** Count calendar days between two ISO date strings, inclusive of both endpoints. */
export function daysBetweenInclusive(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const msFrom = Date.UTC(fy, fm - 1, fd)
  const msTo = Date.UTC(ty, tm - 1, td)
  return Math.max(1, Math.round((msTo - msFrom) / 86_400_000) + 1)
}

/**
 * Compute goal progress. Receives an optional resolved goal (from resolveEffectiveGoal).
 * Falls back to settings.goalLeads if effectiveGoal is not provided.
 *
 * For QTD/YTD with vigencias, proration is **vigencia-aware**:
 * - Completed vigencias → full goal
 * - Active vigencia → prorated by elapsed days within that vigencia
 * - Future vigencias → not counted
 *
 * For single-vigencia mode, uses standard elapsed-day proration.
 */
export function computeGoalProgress(
  data: LeadsData,
  settings: Settings,
  effectiveGoal?: number,
  vigencias?: Vigencia[],
) {
  const today = isoDate(new Date())
  const goal = effectiveGoal ?? settings.goalLeads

  // ── Vigencia-aware proration (QTD/YTD with multiple vigencias) ──
  if (vigencias && vigencias.length > 1) {
    // Find which vigencias overlap the data period
    const periodVigs = vigencias
      .filter(v => v.from <= data.period.to && v.to >= data.period.from)
      .sort((a, b) => a.fromMs - b.fromMs)

    if (periodVigs.length > 0) {
      let proratedGoal = 0
      const totalDays = daysBetweenInclusive(periodVigs[0].from, periodVigs[periodVigs.length - 1].to)
      let elapsedDays = 0

      for (const v of periodVigs) {
        const vKey = vigenciaKey({ year: v.year, month: v.month })
        const vGoal = resolveEffectiveGoal(settings, vKey).goal
        const vigDays = daysBetweenInclusive(v.from, v.to)

        if (v.to < today) {
          // Completed vigencia — full goal
          proratedGoal += vGoal
          elapsedDays += vigDays
        } else if (v.from <= today) {
          // Active vigencia — prorate by elapsed days within it
          const elapsedInVig = daysBetweenInclusive(v.from, today)
          proratedGoal += Math.round(vGoal * (elapsedInVig / vigDays))
          elapsedDays += elapsedInVig
        }
        // Future vigencias: skip (not started yet)
      }

      const pctElapsed = totalDays > 0 ? elapsedDays / totalDays : 0
      // Safety: prorated goal must never exceed the total goal for the period
      const clampedGoal = Math.min(proratedGoal, goal)
      const leadsPct = clampedGoal > 0 ? (data.total / clampedGoal) * 100 : 0

      return {
        totalDays,
        elapsed: elapsedDays,
        pctElapsed,
        proratedGoal: clampedGoal,
        leadsPct: Math.min(leadsPct, 200),
        onTrack: data.total >= clampedGoal,
        fullGoal: goal,
      }
    }
  }

  // ── Single vigencia fallback (standard elapsed-day proration) ──
  const totalDays = daysBetweenInclusive(data.period.from, data.period.to)
  const elapsed = Math.min(
    totalDays,
    Math.max(1, daysBetweenInclusive(data.period.from, today)),
  )
  const pctElapsed = elapsed / totalDays

  const rawProrated = Math.round(goal * pctElapsed)
  // Safety: prorated goal must never exceed the total goal
  const proratedGoal = Math.min(rawProrated, goal)
  const leadsPct = proratedGoal > 0 ? (data.total / proratedGoal) * 100 : 0

  return {
    totalDays,
    elapsed,
    pctElapsed,
    proratedGoal,
    leadsPct: Math.min(leadsPct, 200),
    onTrack: data.total >= proratedGoal,
    fullGoal: goal,
  }
}

/** Get the union of known categories + any from data/distribution, excluding 'Sin clasificar'. */
export function getCategoryList(
  data: LeadsData | null,
  distribution?: GoalDistribution,
): string[] {
  const KNOWN = ['Pago', 'Organico', 'Outbound']
  const fromData = data?.byCategoria
    .map(c => c.name)
    .filter(n => n !== 'Sin clasificar') ?? []
  const fromDistrib = distribution?.enabled
    ? Object.keys(distribution.allocations)
    : []
  return [...new Set([...KNOWN, ...fromData, ...fromDistrib])]
}

/** Canonical canal list for distribution panels. Union of known canals + data-derived. */
const KNOWN_CANALS = [
  'REDES', 'CHENGO', 'WEB MEDICUS / COTI ONLINE',
  'OB WHATSAPP', 'OB MAIL', 'Comparadores',
  'REFERIDOS', 'INTERFAZ GH', 'Programa de Referidos',
  'Influencers', 'Eventos', 'BBDD',
]

export function getCanalList(
  data: LeadsData | null,
  distribution?: GoalDistribution,
): string[] {
  const fromData = data?.byCanal
    .map(c => c.name)
    .filter(n => n !== 'Sin clasificar') ?? []
  const fromDistrib = distribution?.enabled
    ? Object.keys(distribution.allocations)
    : []
  return [...new Set([...KNOWN_CANALS, ...fromData, ...fromDistrib])]
}

// ── Constants ───────────────────────────────────────────────

export const CANAL_COLORS = [
  'var(--canal-1)', 'var(--canal-2)', 'var(--canal-3)',
  'var(--canal-4)', 'var(--canal-5)', 'var(--canal-6)', 'var(--canal-7)',
]

export const CAT_COLORS: Record<string, string> = {
  'Pago': 'var(--cat-pago)',
  'Organico': 'var(--cat-organico)',
  'Outbound': 'var(--cat-outbound)',
  'Sin clasificar': 'var(--cat-sin)',
}

export const FILTER_PRESETS: { mode: FilterMode; label: string }[] = [
  { mode: 'vigencia', label: 'Vigencia' },
  { mode: '30d', label: '30 días' },
  { mode: '7d', label: '7 días' },
  { mode: 'mtd', label: 'Mes' },
  { mode: 'qtd', label: 'QTD' },
  { mode: 'ytd', label: 'YTD' },
  { mode: 'hoy', label: 'Hoy' },
  { mode: 'custom', label: 'Custom' },
]

export const MIN_LEADS_FOR_RATE_RANK = 5
