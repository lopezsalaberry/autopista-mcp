/**
 * Pure utility functions and constants for the Growth Dashboard.
 * No React imports — framework-agnostic helpers only.
 */

import type { FilterMode, LeadsData, Settings, SortState } from './types'

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

export const DEFAULT_SETTINGS: Settings = {
  goalLeads: 10000,
  vigenciaOverrides: {},
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore corrupt data */ }
  return DEFAULT_SETTINGS
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
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

export function computeGoalProgress(data: LeadsData, settings: Settings) {
  const from = new Date(data.period.from)
  const to = new Date(data.period.to)
  const now = new Date()

  const totalDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000))
  const elapsed = Math.min(totalDays, Math.max(1, Math.ceil((now.getTime() - from.getTime()) / 86400000)))
  const pctElapsed = elapsed / totalDays

  // Resolve per-vigencia goal: check if the period matches a vigencia with a custom goal
  let effectiveGoal = settings.goalLeads
  for (const [, override] of Object.entries(settings.vigenciaOverrides)) {
    if (override.goalLeads && override.from === data.period.from && override.to === data.period.to) {
      effectiveGoal = override.goalLeads
      break
    }
  }

  // Pro-rate goal to elapsed time
  const proratedGoal = Math.round(effectiveGoal * pctElapsed)
  const leadsPct = proratedGoal > 0 ? (data.total / proratedGoal) * 100 : 0

  return {
    totalDays,
    elapsed,
    pctElapsed,
    proratedGoal,
    leadsPct: Math.min(leadsPct, 200),
    onTrack: data.total >= proratedGoal,
    fullGoal: effectiveGoal,
  }
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

export const FILTER_PRESETS: { mode: FilterMode; label: string; icon: string }[] = [
  { mode: 'hoy', label: 'Hoy', icon: '📅' },
  { mode: '7d', label: '7 días', icon: '📆' },
  { mode: '30d', label: '30 días', icon: '🗓️' },
  { mode: 'mtd', label: 'Mes', icon: '📊' },
  { mode: 'vigencia', label: 'Vigencia', icon: '🔄' },
  { mode: 'custom', label: 'Custom', icon: '✏️' },
]

export const MIN_LEADS_FOR_RATE_RANK = 5
