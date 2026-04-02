/**
 * Shared TypeScript interfaces for the Growth Dashboard.
 * Single source of truth — all components import from here.
 */

// ── Data Shapes ─────────────────────────────────────────────

export interface CrossDataRow {
  categoria: string
  canal: string
  campana: string
  date: string
  leads: number
  converted: number
  ownerId: string
}

export interface LeadsData {
  period: { from: string; to: string }
  total: number
  converted: number
  conversionRate: number
  byCategoria: Array<{ name: string; count: number; converted: number; rate: number; pct: number }>
  byCanal: Array<{ name: string; displayName: string; count: number; converted: number; rate: number; pct: number }>
  topCampanas: Array<{ name: string; count: number; converted: number; rate: number }>
  previousPeriod: {
    from: string; to: string; total: number; converted: number
    conversionRate: number; deltaTotal: number; deltaConversion: number
  } | null
}

export interface Vigencia {
  name: string; month: number; year: number
  from: string; to: string; fromMs: number; toMs: number
}

export interface VigenciaOverride {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
  goalLeads?: number  // per-month goal (overrides global)
  distribution?: {
    byCategoria?: GoalDistribution
    byCanal?: GoalDistribution
  }
}

export interface GoalDistribution {
  enabled: boolean
  allocations: Record<string, number>  // name → percentage (0-100)
}

export interface Settings {
  goalLeads: number
  years: number[]  // dynamic year list, validated: 2020 ≤ year ≤ currentYear+1, max 5
  vigenciaOverrides: Record<string, VigenciaOverride>  // "YYYY-MM" key
  goalDistribution: {
    byCategoria?: GoalDistribution
    byCanal?: GoalDistribution
  }
}

// ── UI State Types ──────────────────────────────────────────

export type FilterMode = 'hoy' | '7d' | '30d' | 'mtd' | 'vigencia' | 'custom'
export type Page = 'dashboard' | 'settings'

export type SortDir = 'asc' | 'desc'
export interface SortState<K extends string = string> { key: K; dir: SortDir }
