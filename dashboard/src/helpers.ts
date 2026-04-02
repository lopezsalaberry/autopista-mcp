/**
 * Pure utility functions and constants for the Growth Dashboard.
 * No React imports — framework-agnostic helpers only.
 */

import type { FilterMode, GoalDistribution, LeadsData, Settings, SortState, VigenciaOverride } from './types'

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

export function getDateRange(mode: FilterMode): { from: string; to: string } | null {
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
      return null // vigencia and custom handled separately
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
    console.warn(`Settings size (${json.length}B) exceeds ${MAX_SETTINGS_BYTES}B limit`)
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

// ── Goal Progress ───────────────────────────────────────────

/** Count calendar days between two ISO date strings, inclusive of both endpoints. */
function daysBetweenInclusive(from: string, to: string): number {
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
 * Uses timezone-safe, inclusive day counting so the prorated goal is
 * deterministic regardless of hour-of-day or browser timezone.
 */
export function computeGoalProgress(
  data: LeadsData,
  settings: Settings,
  effectiveGoal?: number,
) {
  const today = isoDate(new Date())
  const totalDays = daysBetweenInclusive(data.period.from, data.period.to)
  const elapsed = Math.min(
    totalDays,
    Math.max(1, daysBetweenInclusive(data.period.from, today)),
  )
  const pctElapsed = elapsed / totalDays

  const goal = effectiveGoal ?? settings.goalLeads

  // Pro-rate goal to elapsed time
  const proratedGoal = Math.round(goal * pctElapsed)
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
  { mode: 'hoy', label: 'Hoy' },
  { mode: '7d', label: '7 días' },
  { mode: '30d', label: '30 días' },
  { mode: 'mtd', label: 'Mes' },
  { mode: 'vigencia', label: 'Vigencia' },
  { mode: 'custom', label: 'Custom' },
]

export const MIN_LEADS_FOR_RATE_RANK = 5
