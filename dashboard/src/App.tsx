import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import './index.css'
import { ChatDrawer } from './components/ChatDrawer'
import { DailyTimeline } from './components/DailyTimeline'

interface CrossDataRow {
  categoria: string
  canal: string
  campana: string
  date: string
  leads: number
  converted: number
  ownerId: string
}

// ── Types ───────────────────────────────────────────────────
interface LeadsData {
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

interface Vigencia {
  name: string; month: number; year: number
  from: string; to: string; fromMs: number; toMs: number
}

interface VigenciaOverride {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
  goalLeads?: number  // per-month goal (overrides global)
}

interface Settings {
  goalLeads: number
  vigenciaOverrides: Record<number, VigenciaOverride> // month (1-12) → custom dates
}

type FilterMode = 'hoy' | '7d' | '30d' | 'mtd' | 'vigencia' | 'custom'
type Page = 'dashboard' | 'settings'

// ── API ─────────────────────────────────────────────────────
const API_BASE = '/api/dashboard'

async function fetchApi<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `API error: ${res.status}`)
  }
  return res.json()
}

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('es-AR')
const fmtPct = (n: number) => `${n.toFixed(2)}%`

const CANAL_COLORS = [
  'var(--canal-1)', 'var(--canal-2)', 'var(--canal-3)',
  'var(--canal-4)', 'var(--canal-5)', 'var(--canal-6)', 'var(--canal-7)',
]

const CAT_COLORS: Record<string, string> = {
  'Pago': 'var(--cat-pago)',
  'Organico': 'var(--cat-organico)',
  'Outbound': 'var(--cat-outbound)',
  'Sin clasificar': 'var(--cat-sin)',
}

function convClass(rate: number) {
  if (rate >= 5) return 'conv-high'
  if (rate >= 2) return 'conv-mid'
  return 'conv-low'
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDateRange(mode: FilterMode): { from: string; to: string } | null {
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

// ── Settings persistence ────────────────────────────────────
const SETTINGS_KEY = 'medicus-dashboard-settings'

const DEFAULT_SETTINGS: Settings = {
  goalLeads: 10000,
  vigenciaOverrides: {},
}


function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS
}

function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

// ── Sortable table helpers ──────────────────────────────────
type SortDir = 'asc' | 'desc'
interface SortState<K extends string = string> { key: K; dir: SortDir }

function toggleSort<K extends string>(prev: SortState<K> | null, key: K): SortState<K> {
  if (prev?.key === key) return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
  return { key, dir: key === 'displayName' || key === 'value' ? 'asc' : 'desc' }
}

function applySortFn<T>(items: T[], sort: SortState | null): T[] {
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

function SortIcon({ active, dir }: { active: boolean; dir?: SortDir }) {
  if (!active) return <span className="sort-icon sort-icon-inactive">⇅</span>
  return <span className="sort-icon sort-icon-active">{dir === 'asc' ? '↑' : '↓'}</span>
}

// ── Goal progress calculation ───────────────────────────────
function computeGoalProgress(data: LeadsData, settings: Settings) {
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

// ── FILTER BAR LABELS ───────────────────────────────────────
const FILTER_PRESETS: { mode: FilterMode; label: string; icon: string }[] = [
  { mode: 'hoy', label: 'Hoy', icon: '📅' },
  { mode: '7d', label: '7 días', icon: '📆' },
  { mode: '30d', label: '30 días', icon: '🗓️' },
  { mode: 'mtd', label: 'Mes', icon: '📊' },
  { mode: 'vigencia', label: 'Vigencia', icon: '🔄' },
  { mode: 'custom', label: 'Custom', icon: '✏️' },
]

// ══════════════════════════════════════════════════════════════
// ── KPI Cards ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const SHORT_MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]
function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${SHORT_MONTHS[m - 1]}`
}
function KPICards({ data, settings, selectedDate, crossData }: {
  data: LeadsData; settings: Settings; selectedDate: string | null; crossData: CrossDataRow[]
}) {
  const prev = data.previousPeriod
  const goal = computeGoalProgress(data, settings)

  // When a day is selected, compute KPIs from crossData for that day
  const dayData = useMemo(() => {
    if (!selectedDate || !crossData.length) return null
    const rows = crossData.filter(r => r.date === selectedDate)
    const total = rows.reduce((s, r) => s + r.leads, 0)
    const converted = rows.reduce((s, r) => s + r.converted, 0)
    const conversionRate = total > 0 ? Number(((converted / total) * 100).toFixed(2)) : 0
    return { total, converted, conversionRate }
  }, [selectedDate, crossData])

  const displayTotal = dayData?.total ?? data.total
  const displayConverted = dayData?.converted ?? data.converted
  const displayRate = dayData?.conversionRate ?? data.conversionRate
  const showDeltas = !selectedDate // Hide deltas when filtering to a single day

  return (
    <div className="kpi-grid">
      {/* Total Leads */}
      <div className="kpi-card">
        <div className="kpi-label">Total Leads{selectedDate ? ` — ${formatDateShort(selectedDate)}` : ''}</div>
        <div className="kpi-value">{fmt(displayTotal)}</div>
        {showDeltas && prev && (
          <div className={`kpi-delta ${prev.deltaTotal >= 0 ? 'positive' : 'negative'}`}>
            <span className="arrow">{prev.deltaTotal >= 0 ? '▲' : '▼'}</span>
            {Math.abs(prev.deltaTotal).toFixed(1)}% vs anterior
          </div>
        )}
        {!selectedDate && settings.goalLeads > 0 && (
          <div className="kpi-goal">
            <div className="kpi-goal-track">
              <div
                className="kpi-goal-fill"
                style={{
                  width: `${Math.min(goal.leadsPct, 100)}%`,
                  background: goal.onTrack
                    ? 'linear-gradient(90deg, var(--green), #00e6a6)'
                    : 'linear-gradient(90deg, var(--amber), #ffc75f)',
                }}
              />
            </div>
            <div className="kpi-goal-text">
              {fmt(data.total)} / {fmt(goal.proratedGoal)} prorrateado
              <span style={{ opacity: 0.6 }}> (obj: {fmt(goal.fullGoal)})</span>
            </div>
          </div>
        )}
      </div>

      {/* Convertidos */}
      <div className="kpi-card">
        <div className="kpi-label">Convertidos</div>
        <div className="kpi-value">{fmt(displayConverted)}</div>
        {showDeltas && prev && (
          <div className={`kpi-delta ${data.converted >= prev.converted ? 'positive' : 'negative'}`}>
            <span className="arrow">{data.converted >= prev.converted ? '▲' : '▼'}</span>
            {fmt(prev.converted)} anterior
          </div>
        )}
      </div>

      {/* Tasa de Conversión */}
      <div className="kpi-card">
        <div className="kpi-label">Tasa de Conversión</div>
        <div className="kpi-value">{fmtPct(displayRate)}</div>
        {showDeltas && prev && (
          <div className={`kpi-delta ${prev.deltaConversion >= 0 ? 'positive' : 'negative'}`}>
            <span className="arrow">{prev.deltaConversion >= 0 ? '▲' : '▼'}</span>
            {Math.abs(prev.deltaConversion).toFixed(2)}pp
          </div>
        )}
      </div>

      {/* Periodo Anterior — only shown when NOT filtering by day */}
      {!selectedDate && prev && (
        <div className="kpi-card">
          <div className="kpi-label">Leads Periodo Anterior</div>
          <div className="kpi-value">{fmt(prev.total)}</div>
          <div className="kpi-delta" style={{ background: 'var(--brand-pale)', color: 'var(--brand-primary)' }}>
            {prev.from} → {prev.to}
          </div>
        </div>
      )}
    </div>
  )
}

// Canal display names for crossData aggregation
const CANAL_DISPLAY: Record<string, string> = {
  'REDES': 'Forms META',
  'CHENGO': 'Whatsapp Chengo',
  'WEB MEDICUS / COTI ONLINE': 'Cotizador WEB',
  'OB WHATSAPP': 'Whatsapp (OB)',
  'OB MAIL': 'Email',
  'Comparadores': 'Comparadores',
  'REFERIDOS': 'Referidos',
  'INTERFAZ GH': 'Interfaz GH',
  'Programa de Referidos': 'Programa de Referidos',
  'Influencers': 'Influencers',
  'Eventos': 'Eventos',
  'BBDD': 'BBDD',
}

// ══════════════════════════════════════════════════════════════
// ── VENDEDORES PANEL (App-level, filters everything below) ──
// ══════════════════════════════════════════════════════════════
const MIN_LEADS_FOR_RATE_RANK = 5

function VendedoresPanel({ crossData, ownerNames, ownerTeams, selectedVendedor, onSelectVendedor, expanded, onToggleExpanded }: {
  crossData: CrossDataRow[]
  ownerNames: Record<string, string>
  ownerTeams: Record<string, string>
  selectedVendedor: string | null
  onSelectVendedor: (v: string | null) => void
  expanded: boolean
  onToggleExpanded: () => void
}) {
  const [rankBy, setRankBy] = useState<'leads' | 'rate'>('leads')
  const [sort, setSort] = useState<SortState | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)

  const crossDataReady = crossData.length > 0

  const vendedores = useMemo(() => {
    if (!crossDataReady) return []

    const map = new Map<string, { leads: number; converted: number }>()
    for (const r of crossData) {
      const existing = map.get(r.ownerId)
      if (existing) {
        existing.leads += r.leads
        existing.converted += r.converted
      } else {
        map.set(r.ownerId, { leads: r.leads, converted: r.converted })
      }
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v.leads, 0)
    let items = Array.from(map.entries())
      .map(([ownerId, v]) => ({
        ownerId,
        name: ownerId === 'sin_asignar' ? 'Sin asignar' : (ownerNames[ownerId] || `ID ${ownerId}`),
        team: ownerTeams[ownerId] || '',
        leads: v.leads,
        converted: v.converted,
        rate: v.leads > 0 ? Number(((v.converted / v.leads) * 100).toFixed(2)) : 0,
        pct: total > 0 ? Number(((v.leads / total) * 100).toFixed(1)) : 0,
      }))
      .filter(v => v.leads > 0)

    // Filter by selected team
    if (selectedTeam) {
      items = items.filter(v => v.team === selectedTeam)
    }

    if (rankBy === 'rate') {
      items.sort((a, b) => {
        const aQ = a.leads >= MIN_LEADS_FOR_RATE_RANK ? 1 : 0
        const bQ = b.leads >= MIN_LEADS_FOR_RATE_RANK ? 1 : 0
        if (aQ !== bQ) return bQ - aQ
        return b.rate - a.rate
      })
    } else {
      items.sort((a, b) => b.leads - a.leads)
    }

    return items
  }, [crossData, crossDataReady, ownerNames, ownerTeams, rankBy, selectedTeam])

  // Extract unique teams that have active vendedores (leads > 0) for the dropdown
  // We compute this from the unfiltered vendedores (before team filter)
  const activeTeams = useMemo(() => {
    if (!crossDataReady) return new Set<string>()

    // Get all ownerIds with leads
    const activeOwners = new Set<string>()
    for (const r of crossData) {
      if (r.leads > 0) activeOwners.add(r.ownerId)
    }

    // Collect teams from active owners only
    const teams = new Set<string>()
    Array.from(activeOwners).forEach(ownerId => {
      const team = ownerTeams[ownerId]
      if (team) teams.add(team)
    })
    return teams
  }, [crossData, crossDataReady, ownerTeams])

  const uniqueTeams = useMemo(() => {
    return Array.from(activeTeams).sort()
  }, [activeTeams])

  const hasTeams = uniqueTeams.length > 0
  const maxLeads = Math.max(...vendedores.map(v => v.leads), 1)

  if (!crossDataReady) return null

  const selectedName = selectedVendedor
    ? (ownerNames[selectedVendedor] || selectedVendedor)
    : null

  return (
    <div className="panel vendedores-panel">
      <div className="section-title" onClick={onToggleExpanded} style={{ cursor: 'pointer' }}>
        <span className="icon">👥</span> Vendedores
        {selectedName && <span className="vendedor-active-label">— {selectedName}</span>}
        <span className="vendedores-count">{vendedores.length} vendedores</span>
        <div className="vendedor-controls">
          {expanded && (
            <>
              {hasTeams && (
                <select
                  className="team-filter-select"
                  value={selectedTeam || ''}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { setSelectedTeam(e.target.value || null) }}
                >
                  <option value="">Todos los supervisores</option>
                  {uniqueTeams.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
              <button
                className={`rank-toggle ${rankBy === 'leads' ? 'active' : ''}`}
                onClick={e => { e.stopPropagation(); setRankBy('leads') }}
              >
                Por Leads
              </button>
              <button
                className={`rank-toggle ${rankBy === 'rate' ? 'active' : ''}`}
                onClick={e => { e.stopPropagation(); setRankBy('rate') }}
              >
                Por Conversión
              </button>
            </>
          )}
        </div>
        {selectedVendedor && (
          <button className="filter-clear" onClick={e => { e.stopPropagation(); onSelectVendedor(null) }}>
            ✕ Quitar filtro
          </button>
        )}
        <span className={`collapse-chevron ${expanded ? 'expanded' : ''}`}>▾</span>
      </div>
      {expanded && (
        <>
          {vendedores.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No hay vendedores{selectedTeam ? ` del supervisor "${selectedTeam}"` : ''}
            </div>
          ) : (
            <table className="data-table sortable-table vendedores-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                  <th className="sortable-th" style={{ textAlign: 'left' }} onClick={() => setSort(s => toggleSort(s, 'displayName'))}>
                    Vendedor <SortIcon active={sort?.key === 'displayName'} dir={sort?.dir} />
                  </th>
                  {hasTeams && (
                    <th className="sortable-th" style={{ textAlign: 'left' }} onClick={() => setSort(s => toggleSort(s, 'team'))}>
                      Supervisor <SortIcon active={sort?.key === 'team'} dir={sort?.dir} />
                    </th>
                  )}
                  <th style={{ textAlign: 'left', width: '15%' }}>Distribución</th>
                  <th className="sortable-th" onClick={() => setSort(s => toggleSort(s, 'count'))}>
                    Leads <SortIcon active={sort?.key === 'count'} dir={sort?.dir} />
                  </th>
                  <th className="sortable-th" onClick={() => setSort(s => toggleSort(s, 'converted'))}>
                    Conv. <SortIcon active={sort?.key === 'converted'} dir={sort?.dir} />
                  </th>
                  <th className="sortable-th" onClick={() => setSort(s => toggleSort(s, 'rate'))}>
                    % Conv. <SortIcon active={sort?.key === 'rate'} dir={sort?.dir} />
                  </th>
                  <th style={{ width: '50px', textAlign: 'center' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {applySortFn(
                  vendedores.map((v, i) => ({
                    ...v,
                    displayName: v.name,
                    count: v.leads,
                    _rank: i + 1,
                  })),
                  sort,
                ).map(v => {
                  const rank = (v as Record<string, unknown>)._rank as number
                  const isActive = selectedVendedor === v.ownerId
                  const isDimmed = selectedVendedor && selectedVendedor !== v.ownerId
                  const belowThreshold = rankBy === 'rate' && v.leads < MIN_LEADS_FOR_RATE_RANK

                  return (
                    <tr
                      key={v.ownerId}
                      className={`drill-row vendedor-row ${isActive ? 'vendedor-active' : ''} ${isDimmed ? 'vendedor-dimmed' : ''} ${belowThreshold ? 'vendedor-below-threshold' : ''}`}
                      onClick={() => onSelectVendedor(selectedVendedor === v.ownerId ? null : v.ownerId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="vendedor-rank" style={{ textAlign: 'center' }}>
                        <span className="rank-num">{rank}</span>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <span className="vendedor-name">{v.name}</span>
                      </td>
                      {hasTeams && (
                        <td style={{ textAlign: 'left' }}>
                          <span className="vendedor-team">{v.team || '—'}</span>
                        </td>
                      )}
                      <td style={{ textAlign: 'left' }}>
                        <div className="inline-bar-track">
                          <div
                            className="inline-bar-fill vendedor-bar"
                            style={{ width: `${(v.leads / maxLeads) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td>{fmt(v.leads)}</td>
                      <td>{fmt(v.converted)}</td>
                      <td>
                        <span className={`conv-badge ${convClass(v.rate)}`}>
                          {fmtPct(v.rate)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {v.pct}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

function InteractiveDataSection({ data, crossData, selectedDate, selectedVendedor, ownerNames }: {
  data: LeadsData
  crossData: CrossDataRow[]
  selectedDate: string | null
  selectedVendedor: string | null
  ownerNames: Record<string, string>
}) {
  const [selectedCat, setSelectedCatRaw] = useState<string | null>(null)
  const [selectedCanal, setSelectedCanal] = useState<string | null>(null)
  const [canalSort, setCanalSort] = useState<SortState | null>(null)
  const [campanaSort, setCampanaSort] = useState<SortState | null>(null)

  // Reset canal when category changes
  const setSelectedCat = useCallback((valOrFn: string | null | ((prev: string | null) => string | null)) => {
    setSelectedCatRaw(prev => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn
      if (next !== prev) setSelectedCanal(null)
      return next
    })
  }, [])

  // ── Instant client-side aggregation from crossData ─────────
  const crossDataReady = crossData.length > 0

  const canalsToShow = useMemo(() => {
    // Fallback to server-side data while crossData loads (and no date/cat/vendedor filter)
    if (!crossDataReady || (!selectedCat && !selectedDate && !selectedVendedor)) {
      return data.byCanal.map(c => ({
        value: c.name,
        displayName: c.displayName,
        count: c.count,
        converted: c.converted,
        rate: c.rate,
        pct: c.pct,
      }))
    }

    // Filter + aggregate from crossData
    let rows = crossData
    if (selectedDate) rows = rows.filter(r => r.date === selectedDate)
    if (selectedCat) rows = rows.filter(r => r.categoria === selectedCat)
    if (selectedVendedor) rows = rows.filter(r => r.ownerId === selectedVendedor)

    const map = new Map<string, { leads: number; converted: number }>()
    for (const r of rows) {
      const existing = map.get(r.canal)
      if (existing) {
        existing.leads += r.leads
        existing.converted += r.converted
      } else {
        map.set(r.canal, { leads: r.leads, converted: r.converted })
      }
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v.leads, 0)
    return Array.from(map.entries())
      .map(([name, v]) => ({
        value: name,
        displayName: CANAL_DISPLAY[name] || name,
        count: v.leads,
        converted: v.converted,
        rate: v.leads > 0 ? Number(((v.converted / v.leads) * 100).toFixed(2)) : 0,
        pct: total > 0 ? Number(((v.leads / total) * 100).toFixed(1)) : 0,
      }))
      .filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [crossData, crossDataReady, selectedCat, selectedVendedor, selectedDate, data.byCanal])

  const campanasToShow = useMemo(() => {
    // Fallback to server-side data while crossData loads
    if (!crossDataReady || (!selectedCat && !selectedCanal && !selectedDate && !selectedVendedor)) {
      return data.topCampanas.map(c => ({
        value: c.name,
        displayName: c.name,
        count: c.count,
        converted: c.converted,
        rate: c.rate,
        pct: 0,
      }))
    }

    // Filter + aggregate from crossData
    let rows = crossData
    if (selectedDate) rows = rows.filter(r => r.date === selectedDate)
    if (selectedCat) rows = rows.filter(r => r.categoria === selectedCat)
    if (selectedVendedor) rows = rows.filter(r => r.ownerId === selectedVendedor)
    if (selectedCanal) rows = rows.filter(r => r.canal === selectedCanal)

    const map = new Map<string, { leads: number; converted: number }>()
    for (const r of rows) {
      const existing = map.get(r.campana)
      if (existing) {
        existing.leads += r.leads
        existing.converted += r.converted
      } else {
        map.set(r.campana, { leads: r.leads, converted: r.converted })
      }
    }

    return Array.from(map.entries())
      .map(([name, v]) => ({
        value: name,
        displayName: name,
        count: v.leads,
        converted: v.converted,
        rate: v.leads > 0 ? Number(((v.converted / v.leads) * 100).toFixed(2)) : 0,
        pct: 0,
      }))
      .filter(c => c.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [crossData, crossDataReady, selectedCat, selectedCanal, selectedVendedor, selectedDate, data.topCampanas])

  const maxCanalCount = Math.max(...canalsToShow.map(c => c.count), 1)

  // ── Categorías — recalculate when date is selected ─────────
  const categoriasToShow = useMemo(() => {
    if ((!selectedDate && !selectedVendedor) || !crossDataReady) return data.byCategoria

    let rows = crossData
    if (selectedDate) rows = rows.filter(r => r.date === selectedDate)
    if (selectedVendedor) rows = rows.filter(r => r.ownerId === selectedVendedor)

    const catMap = new Map<string, { count: number; converted: number }>()
    for (const r of rows) {
      const existing = catMap.get(r.categoria)
      if (existing) {
        existing.count += r.leads
        existing.converted += r.converted
      } else {
        catMap.set(r.categoria, { count: r.leads, converted: r.converted })
      }
    }

    const dayTotal = rows.reduce((s, r) => s + r.leads, 0)
    return ['Pago', 'Organico', 'Outbound', 'Sin clasificar']
      .map(name => {
        const v = catMap.get(name) || { count: 0, converted: 0 }
        return {
          name,
          count: v.count,
          converted: v.converted,
          rate: v.count > 0 ? Number(((v.converted / v.count) * 100).toFixed(2)) : 0,
          pct: dayTotal > 0 ? Number(((v.count / dayTotal) * 100).toFixed(1)) : 0,
        }
      })
      .filter(c => c.count > 0)
  }, [selectedDate, selectedVendedor, crossData, crossDataReady, data.byCategoria])

  // ── Filter state helpers ───────────────────────────────────
  const hasAnyFilter = !!selectedCat || !!selectedCanal || !!selectedVendedor

  const clearAll = () => {
    setSelectedCat(null)
    setSelectedCanal(null)
  }

  // Build title suffixes
  const vendedorName = selectedVendedor ? (ownerNames[selectedVendedor] || selectedVendedor) : ''
  const canalTitle = [selectedCat, vendedorName].filter(Boolean).join(' › ')
  const campanaTitle = [selectedCat, vendedorName, selectedCanal && (CANAL_DISPLAY[selectedCanal] || selectedCanal)].filter(Boolean).join(' › ')

  return (
    <>
      {/* Categoría Filter Chips */}
      <div className="panel">
        <div className="section-title">
          <span className="icon">📊</span> Composición por Categoría
          {hasAnyFilter && (
            <button className="filter-clear" onClick={clearAll}>
              ✕ Limpiar filtros
            </button>
          )}
        </div>
        <div className="composition-grid">
          {categoriasToShow.map(cat => (
            <div
              key={cat.name}
              className={`composition-item clickable ${selectedCat === cat.name ? 'active' : ''} ${selectedCat && selectedCat !== cat.name ? 'dimmed' : ''}`}
              onClick={() => setSelectedCat(prev => prev === cat.name ? null : cat.name)}
            >
              <div className="composition-pct" style={{ color: CAT_COLORS[cat.name] || 'var(--brand-primary)' }}>
                {cat.pct}%
              </div>
              <div className="composition-name">{cat.name}</div>
              <div className="composition-count">{fmt(cat.count)} leads · {fmtPct(cat.rate)} conv.</div>
            </div>
          ))}
        </div>
        {hasAnyFilter && (
          <div className="filter-active-banner">
            Filtros activos:
            {selectedCat && <span className="filter-chip">{selectedCat}</span>}
            {selectedVendedor && (
              <>
                <span className="filter-arrow-sep">›</span>
                <span className="filter-chip">{ownerNames[selectedVendedor] || selectedVendedor}</span>
              </>
            )}
            {selectedCanal && (
              <>
                <span className="filter-arrow-sep">›</span>
                <span className="filter-chip">{CANAL_DISPLAY[selectedCanal] || selectedCanal}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Canales — Clickable rows that filter campaigns */}
      <div className="panel">
        <div className="section-title">
          <span className="icon">📡</span> Canales{canalTitle ? ` — ${canalTitle}` : ''}
          {selectedCanal && (
            <button className="filter-clear" onClick={() => setSelectedCanal(null)}>
              ✕ Quitar filtro canal
            </button>
          )}
        </div>
        <table className="data-table sortable-table">
          <thead>
            <tr>
              <th className="sortable-th" style={{ textAlign: 'left' }} onClick={() => setCanalSort(s => toggleSort(s, 'displayName'))}>
                Canal <SortIcon active={canalSort?.key === 'displayName'} dir={canalSort?.dir} />
              </th>
              <th style={{ textAlign: 'left', width: '30%' }}>Distribución</th>
              <th className="sortable-th" onClick={() => setCanalSort(s => toggleSort(s, 'count'))}>
                Leads <SortIcon active={canalSort?.key === 'count'} dir={canalSort?.dir} />
              </th>
              <th className="sortable-th" onClick={() => setCanalSort(s => toggleSort(s, 'converted'))}>
                Conv. <SortIcon active={canalSort?.key === 'converted'} dir={canalSort?.dir} />
              </th>
              <th className="sortable-th" onClick={() => setCanalSort(s => toggleSort(s, 'rate'))}>
                % Conv. <SortIcon active={canalSort?.key === 'rate'} dir={canalSort?.dir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {applySortFn(canalsToShow, canalSort).map((canal, i) => (
              <tr
                key={canal.value}
                className={`drill-row ${selectedCanal === canal.value ? 'canal-active' : ''} ${selectedCanal && selectedCanal !== canal.value ? 'canal-dimmed' : ''}`}
                onClick={() => setSelectedCanal(prev => prev === canal.value ? null : canal.value)}
                style={{ cursor: 'pointer' }}
              >
                <td style={{ textAlign: 'left' }}>
                  <span className="channel-dot" style={{ background: CANAL_COLORS[i % CANAL_COLORS.length] }} />
                  {canal.displayName}
                </td>
                <td style={{ textAlign: 'left' }}>
                  <div className="inline-bar-track">
                    <div
                      className="inline-bar-fill"
                      style={{
                        width: `${(canal.count / maxCanalCount) * 100}%`,
                        background: CANAL_COLORS[i % CANAL_COLORS.length],
                      }}
                    />
                  </div>
                </td>
                <td>{fmt(canal.count)}</td>
                <td>{fmt(canal.converted)}</td>
                <td>
                  <span className={`conv-badge ${convClass(canal.rate)}`}>
                    {fmtPct(canal.rate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Campañas — filtered by category and/or canal */}
      <div className="panel">
        <div className="section-title">
          <span className="icon">📋</span> Campañas{campanaTitle ? ` — ${campanaTitle}` : ''}
        </div>
        {campanasToShow.length > 0 ? (
          <table className="data-table sortable-table">
            <thead>
              <tr>
                <th className="sortable-th" style={{ textAlign: 'left' }} onClick={() => setCampanaSort(s => toggleSort(s, 'displayName'))}>
                  Campaña <SortIcon active={campanaSort?.key === 'displayName'} dir={campanaSort?.dir} />
                </th>
                <th className="sortable-th" onClick={() => setCampanaSort(s => toggleSort(s, 'count'))}>
                  Leads <SortIcon active={campanaSort?.key === 'count'} dir={campanaSort?.dir} />
                </th>
                <th className="sortable-th" onClick={() => setCampanaSort(s => toggleSort(s, 'converted'))}>
                  Conv. <SortIcon active={campanaSort?.key === 'converted'} dir={campanaSort?.dir} />
                </th>
                <th className="sortable-th" onClick={() => setCampanaSort(s => toggleSort(s, 'rate'))}>
                  % Conv. <SortIcon active={campanaSort?.key === 'rate'} dir={campanaSort?.dir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {applySortFn(campanasToShow, campanaSort).slice(0, 15).map(camp => (
                <tr key={camp.value}>
                  <td style={{ textAlign: 'left', fontWeight: 500 }}>{camp.displayName}</td>
                  <td>{fmt(camp.count)}</td>
                  <td>{fmt(camp.converted)}</td>
                  <td>
                    <span className={`conv-badge ${convClass(camp.rate)}`}>
                      {fmtPct(camp.rate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
            Sin campañas para este filtro
          </div>
        )}
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// ── SETTINGS PAGE ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
// ── Supervisor Accordion Group (controlled — parent manages which is open) ──
function SupervisorGroup({ label, owners, excludedIds, excludedCount, total, allExcluded, someExcluded, onToggleGroup, onToggleOwner, isOpen, onToggle }: {
  label: string
  owners: Array<[string, string]>
  excludedIds: string[]
  excludedCount: number
  total: number
  allExcluded: boolean
  someExcluded: boolean
  onToggleGroup: () => void
  onToggleOwner: (id: string) => void
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div className={`supervisor-group ${allExcluded ? 'all-excluded' : ''}`}>
      <div className="supervisor-group-header" onClick={onToggle}>
        <input
          type="checkbox"
          checked={allExcluded}
          ref={el => { if (el) el.indeterminate = someExcluded }}
          onChange={e => { e.stopPropagation(); onToggleGroup() }}
          onClick={e => e.stopPropagation()}
        />
        <span className="supervisor-group-name">{label}</span>
        <span className="supervisor-group-count">
          {excludedCount > 0 && <span className="supervisor-excl-badge">{excludedCount}</span>}
          {total} vendedores
        </span>
        <span className={`collapse-chevron ${isOpen ? 'expanded' : ''}`}>▾</span>
      </div>
      {isOpen && (
        <div className="supervisor-group-body">
          {owners.map(([id, name]) => {
            const isExcluded = excludedIds.includes(id)
            return (
              <label key={id} className={`excluded-owner-item ${isExcluded ? 'is-excluded' : ''}`}>
                <input
                  type="checkbox"
                  checked={isExcluded}
                  onChange={() => onToggleOwner(id)}
                />
                <span className="excluded-owner-name">{name}</span>
                <span className="excluded-owner-id">ID: {id}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SettingsPage({ settings, onSave, onBack, vigenciasForSettings }: {
  settings: Settings
  onSave: (s: Settings) => void
  onBack: () => void
  vigenciasForSettings: Vigencia[]
}) {
  const [draft, setDraft] = useState<Settings>({ ...settings, vigenciaOverrides: { ...settings.vigenciaOverrides } })
  const [saved, setSaved] = useState(false)

  // Excluded owners state
  const [allOwners, setAllOwners] = useState<Record<string, string>>({})
  const [allTeams, setAllTeams] = useState<Record<string, string>>({})
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [excludedLoading, setExcludedLoading] = useState(true)
  const [excludedSaving, setExcludedSaving] = useState(false)
  const [excludedSaved, setExcludedSaved] = useState(false)
  const [excludedError, setExcludedError] = useState<string | null>(null)

  // Fetch owners + config on mount
  useEffect(() => {
    Promise.all([
      fetchApi<{ names: Record<string, string>; teams: Record<string, string> }>('/owners'),
      fetchApi<{ excludedOwnerIds: string[] }>('/config'),
    ])
      .then(([ownersData, config]) => {
        setAllOwners(ownersData.names)
        setAllTeams(ownersData.teams)
        setExcludedIds(config.excludedOwnerIds)
      })
      .catch(err => setExcludedError(err.message))
      .finally(() => setExcludedLoading(false))
  }, [])

  const handleSave = () => {
    onSave(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const update = (key: keyof Settings, value: number) => {
    setDraft(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const toggleExcluded = (ownerId: string) => {
    setExcludedIds(prev =>
      prev.includes(ownerId)
        ? prev.filter(id => id !== ownerId)
        : [...prev, ownerId]
    )
    setExcludedSaved(false)
  }

  const saveExcluded = async () => {
    if (excludedIds.length === 0) {
      setExcludedError('Debe haber al menos 1 propietario excluido')
      return
    }
    setExcludedSaving(true)
    setExcludedError(null)
    try {
      await fetch(`${API_BASE}/config/excluded-owners`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedOwnerIds: excludedIds }),
      })
      setExcludedSaved(true)
      setTimeout(() => setExcludedSaved(false), 3000)
    } catch (err) {
      setExcludedError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setExcludedSaving(false)
    }
  }

  const [ownerSearch, setOwnerSearch] = useState('')
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>⚙️ Configuración</h1>
          <div className="subtitle">Objetivos y parámetros del dashboard</div>
        </div>
        <button className="header-btn" onClick={onBack}>← Dashboard</button>
      </header>

      <div className="dashboard-body" style={{ maxWidth: '720px' }}>
        {/* Goals */}
        <div className="panel">
          <div className="section-title">
            <span className="icon">🎯</span> Objetivos de Vigencia
          </div>
          <p className="settings-desc">
            El objetivo de leads se prorrata automáticamente al periodo visualizado.
            Por ejemplo, si el objetivo mensual es 10.000 y ves los primeros 15 días,
            el objetivo del periodo será ~5.000.
          </p>

          <div className="settings-grid">
            <div className="settings-field">
              <label>Objetivo de Leads (mensual por defecto)</label>
              <input
                type="number"
                value={draft.goalLeads}
                onChange={e => update('goalLeads', parseInt(e.target.value) || 0)}
                min={0}
                step={500}
              />
              <span className="settings-hint">Se puede personalizar por vigencia abajo</span>
            </div>
          </div>
        </div>

        {/* Vigencia Config — Per Month */}
        <div className="panel">
          <div className="section-title">
            <span className="icon">📅</span> Vigencias {new Date().getFullYear()}
          </div>
          <p className="settings-desc">
            Cada vigencia tiene fechas predeterminadas (21→22), pero podés ajustar
            cada mes para que caigan en día hábil. Solo completá las que necesites cambiar.
          </p>

          <table className="data-table">
            <thead>
              <tr>
                <th>Vigencia</th>
                <th style={{ textAlign: 'left' }}>Desde</th>
                <th style={{ textAlign: 'left' }}>Hasta</th>
                <th style={{ textAlign: 'left' }}>Objetivo</th>
                <th style={{ textAlign: 'center', width: '60px' }}>Reset</th>
              </tr>
            </thead>
            <tbody>
              {vigenciasForSettings.map(v => {
                const override = draft.vigenciaOverrides[v.month]
                const hasOverride = !!override
                return (
                  <tr key={v.month} style={hasOverride ? { background: 'var(--brand-pale)' } : {}}>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td style={{ textAlign: 'left' }}>
                      <input
                        type="date"
                        className="filter-input"
                        value={override?.from || v.from}
                        onChange={e => {
                          const newOverrides = { ...draft.vigenciaOverrides }
                          newOverrides[v.month] = {
                            from: e.target.value,
                            to: override?.to || v.to,
                          }
                          setDraft(prev => ({ ...prev, vigenciaOverrides: newOverrides }))
                          setSaved(false)
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input
                        type="date"
                        className="filter-input"
                        value={override?.to || v.to}
                        onChange={e => {
                          const newOverrides = { ...draft.vigenciaOverrides }
                          newOverrides[v.month] = {
                            from: override?.from || v.from,
                            to: e.target.value,
                          }
                          setDraft(prev => ({ ...prev, vigenciaOverrides: newOverrides }))
                          setSaved(false)
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <input
                        type="number"
                        className="filter-input"
                        placeholder={String(draft.goalLeads)}
                        value={override?.goalLeads ?? ''}
                        style={{ width: '100px' }}
                        onChange={e => {
                          const newOverrides = { ...draft.vigenciaOverrides }
                          const val = parseInt(e.target.value)
                          newOverrides[v.month] = {
                            from: override?.from || v.from,
                            to: override?.to || v.to,
                            goalLeads: isNaN(val) ? undefined : val,
                          }
                          setDraft(prev => ({ ...prev, vigenciaOverrides: newOverrides }))
                          setSaved(false)
                        }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {hasOverride && (
                        <button
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={() => {
                            const newOverrides = { ...draft.vigenciaOverrides }
                            delete newOverrides[v.month]
                            setDraft(prev => ({ ...prev, vigenciaOverrides: newOverrides }))
                            setSaved(false)
                          }}
                        >
                          ↩
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Unified Exclusion Manager — Supervisor + Vendedores tree */}
        <div className="panel">
          <div className="section-title">
            <span className="icon">🚫</span> Exclusiones
          </div>
          <p className="settings-desc">
            Excluí vendedores individuales o supervisores completos.
            Los excluidos no aparecen en KPIs, ranking, ni datos del dashboard.
            <strong> Al guardar se limpia el cache automáticamente.</strong>
          </p>

          {excludedLoading ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
              Cargando propietarios...
            </div>
          ) : excludedError && Object.keys(allOwners).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--accent-red)' }}>
              Error: {excludedError}
            </div>
          ) : (
            <>
              <input
                type="text"
                className="owner-search-input"
                placeholder="Buscar supervisor o vendedor..."
                value={ownerSearch}
                onChange={e => setOwnerSearch(e.target.value)}
              />

              {/* Summary bar */}
              <div className="exclusion-summary-bar">
                <span>{excludedIds.length} excluidos de {Object.keys(allOwners).length} propietarios</span>
                <button
                  className="btn-primary"
                  onClick={saveExcluded}
                  disabled={excludedSaving}
                >
                  {excludedSaving ? 'Guardando...' : excludedSaved ? '✓ Guardado' : 'Guardar Exclusiones'}
                </button>
              </div>

              {excludedError && (
                <div style={{ color: 'var(--accent-red)', fontSize: '0.85rem', marginTop: '4px', marginBottom: '8px' }}>
                  {excludedError}
                </div>
              )}

              {/* Tree view */}
              <div className="exclusion-tree">
                {(() => {
                  // Build supervisor → owners map
                  const supervisorMap = new Map<string, Array<[string, string]>>()
                  const unassigned: Array<[string, string]> = []
                  const searchQ = ownerSearch.toLowerCase().trim()

                  for (const [ownerId, ownerName] of Object.entries(allOwners)) {
                    const team = allTeams[ownerId]
                    if (team) {
                      const existing = supervisorMap.get(team) || []
                      existing.push([ownerId, ownerName])
                      supervisorMap.set(team, existing)
                    } else {
                      unassigned.push([ownerId, ownerName])
                    }
                  }

                  // Sort owners within each group: excluded first, then alphabetical
                  const sortOwners = (arr: Array<[string, string]>) =>
                    arr.sort(([aId, aName], [bId, bName]) => {
                      const aE = excludedIds.includes(aId) ? 0 : 1
                      const bE = excludedIds.includes(bId) ? 0 : 1
                      if (aE !== bE) return aE - bE
                      return aName.localeCompare(bName)
                    })

                  // Build sorted supervisor list
                  const groups: Array<{ label: string; ownerIds: string[]; owners: Array<[string, string]> }> = []

                  const sortedSupervisors = Array.from(supervisorMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
                  for (const [supervisor, owners] of sortedSupervisors) {
                    sortOwners(owners)
                    groups.push({ label: supervisor, ownerIds: owners.map(o => o[0]), owners })
                  }
                  if (unassigned.length > 0) {
                    sortOwners(unassigned)
                    groups.push({ label: 'Sin supervisor', ownerIds: unassigned.map(o => o[0]), owners: unassigned })
                  }

                  // Filter by search
                  const filteredGroups = searchQ
                    ? groups.map(g => {
                        const labelMatch = g.label.toLowerCase().includes(searchQ)
                        const filteredOwners = labelMatch
                          ? g.owners
                          : g.owners.filter(([id, name]) => name.toLowerCase().includes(searchQ) || id.includes(searchQ))
                        if (filteredOwners.length === 0) return null
                        return { ...g, owners: filteredOwners, ownerIds: filteredOwners.map(o => o[0]) }
                      }).filter(Boolean) as typeof groups
                    : groups

                  if (filteredGroups.length === 0) {
                    return (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Sin resultados para &quot;{ownerSearch}&quot;
                      </div>
                    )
                  }

                  return filteredGroups.map(group => {
                    const excludedCount = group.ownerIds.filter(id => excludedIds.includes(id)).length
                    const allExcluded = excludedCount === group.ownerIds.length
                    const someExcluded = excludedCount > 0 && !allExcluded

                    const toggleGroup = () => {
                      if (allExcluded) {
                        setExcludedIds(prev => prev.filter(id => !group.ownerIds.includes(id)))
                      } else {
                        setExcludedIds(prev => {
                          const s = new Set(prev)
                          for (const id of group.ownerIds) s.add(id)
                          return Array.from(s)
                        })
                      }
                      setExcludedSaved(false)
                    }

                    const isSearching = !!searchQ

                    return (
                      <SupervisorGroup
                        key={group.label}
                        label={group.label}
                        owners={group.owners}
                        excludedIds={excludedIds}
                        excludedCount={excludedCount}
                        total={group.ownerIds.length}
                        allExcluded={allExcluded}
                        someExcluded={someExcluded}
                        onToggleGroup={toggleGroup}
                        onToggleOwner={(id) => { toggleExcluded(id) }}
                        isOpen={isSearching ? true : openGroup === group.label}
                        onToggle={() => setOpenGroup(prev => prev === group.label ? null : group.label)}
                      />
                    )
                  })
                })()}
              </div>
            </>
          )}
        </div>
        {/* Save Vigencia Settings */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onBack}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>
            {saved ? '✓ Guardado' : 'Guardar Configuración'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ── MAIN APP ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [chatOpen, setChatOpen] = useState(false)
  const [page, setPage] = useState<Page>('dashboard')
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [vigencias, setVigencias] = useState<Vigencia[]>([])
  const [selectedVigencia, setSelectedVigencia] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('vigencia')
  const [data, setData] = useState<LeadsData | null>(null)
  const [crossData, setCrossData] = useState<CrossDataRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null)
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({})
  const [ownerTeams, setOwnerTeams] = useState<Record<string, string>>({})
  const [vendedoresExpanded, setVendedoresExpanded] = useState(false)

  // Fetch owner names + teams once on mount
  useEffect(() => {
    fetchApi<{ names: Record<string, string>; teams: Record<string, string> }>('/owners')
      .then(res => {
        setOwnerNames(res.names)
        setOwnerTeams(res.teams)
      })
      .catch(err => console.warn('Failed to load owner names:', err))
  }, [])

  // Load vigencias on mount, then apply per-month overrides
  useEffect(() => {
    const year = new Date().getFullYear()
    fetchApi<{ vigencias: Vigencia[] }>(`/vigencias?year=${year}`)
      .then(res => {
        // Apply per-month overrides from settings
        const adjusted = res.vigencias.map(v => {
          const override = settings.vigenciaOverrides[v.month]
          if (override) {
            return {
              ...v,
              from: override.from,
              to: override.to,
              fromMs: new Date(`${override.from}T00:00:00.000Z`).getTime(),
              toMs: new Date(`${override.to}T23:59:59.999Z`).getTime(),
            }
          }
          return v
        })
        setVigencias(adjusted)
        const currentMonth = new Date().getMonth() + 1
        const currentVig = adjusted.find(v => v.month === currentMonth)
          || adjusted[adjusted.length - 1]
        if (currentVig) {
          setSelectedVigencia(`${currentVig.from}|${currentVig.to}`)
        }
      })
      .catch(err => setError(err.message))
  }, [settings.vigenciaOverrides])

  // Client-side cache + abort controller for request cancellation
  const clientCache = useRef(new Map<string, { data: LeadsData; crossData?: CrossDataRow[]; ts: number }>())
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (from: string, to: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    const key = `${from}|${to}`
    const cached = clientCache.current.get(key)
    const today = isoDate(new Date())
    const isHistorical = to < today
    const STALE_MS = isHistorical ? 30 * 60_000 : 2 * 60_000 // 30min historic, 2min active

    // Serve cache immediately if fresh enough
    if (cached && Date.now() - cached.ts < STALE_MS) {
      setData(cached.data)
      setCrossData(cached.crossData || [])
      setLoading(false)
      setError(null)
      return
    }

    // Show stale data while revalidating (no spinner if we have stale data)
    if (cached) {
      setData(cached.data)
      setCrossData(cached.crossData || [])
    } else {
      setLoading(true)
    }

    setError(null)
    setSelectedDate(null) // Reset day selection when fetching new period
    try {
      const result = await fetchApi<LeadsData>(
        `/leads?from=${from}&to=${to}`,
        abortRef.current.signal
      )
      clientCache.current.set(key, { data: result, ts: Date.now() })
      // Evict oldest if cache exceeds 20 entries
      if (clientCache.current.size > 20) {
        let oldestKey = '', oldestTs = Infinity
        clientCache.current.forEach((v, k) => {
          if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k }
        })
        if (oldestKey) clientCache.current.delete(oldestKey)
      }
      setData(result)

      // Lazy-fetch cross-data AFTER main data loads (separate rate limit window)
      // Reset stale crossData before fetching new
      if (!cached?.crossData) setCrossData([])
      const signal = abortRef.current?.signal
      fetchApi<CrossDataRow[]>(`/cross-data?from=${from}&to=${to}`, signal)
        .then(cd => {
          if (!signal?.aborted) {
            setCrossData(cd)
            const entry = clientCache.current.get(key)
            if (entry) entry.crossData = cd
          }
        })
        .catch(err => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          console.warn('CrossData fetch failed:', err)
        })
    } catch (err) {
      // Silently ignore aborted requests
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Only show error if we have no cached fallback
      if (!cached) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Active date range from current filter mode
  const activeDates = useMemo(() => {
    if (filterMode === 'vigencia' && selectedVigencia) {
      const [from, to] = selectedVigencia.split('|')
      return { from, to }
    }
    if (filterMode === 'custom') return null // manual trigger
    return getDateRange(filterMode)
  }, [filterMode, selectedVigencia])

  // Auto-fetch when activeDates changes (except custom)
  useEffect(() => {
    if (activeDates && filterMode !== 'custom') {
      fetchData(activeDates.from, activeDates.to)
    }
  }, [activeDates, filterMode, fetchData])

  const handleApplyCustom = () => {
    if (customFrom && customTo) fetchData(customFrom, customTo)
  }

  const handleFilterChange = (mode: FilterMode) => {
    setFilterMode(mode)
    setSelectedDate(null)  // Reset day selection when period changes
  }

  const handleSaveSettings = (s: Settings) => {
    setSettings(s)
    saveSettings(s)
  }

  // ── SETTINGS PAGE ──────────────────────────────────────────
  if (page === 'settings') {
    return (
      <SettingsPage
        settings={settings}
        onSave={handleSaveSettings}
        onBack={() => setPage('dashboard')}
        vigenciasForSettings={vigencias}
      />
    )
  }

  // ── DASHBOARD PAGE ─────────────────────────────────────────
  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div>
          <h1>Growth Dashboard</h1>
          <div className="subtitle">Medicus — Leads & Conversión</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {data && !loading && (
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              {data.period.from} → {data.period.to}
            </div>
          )}
          <button className="header-btn" onClick={() => setPage('settings')}>⚙️</button>
        </div>
      </header>

      <div className="dashboard-body">
        {/* Filter Pill Bar */}
        <div className="filter-bar">
          <div className="filter-pills">
            {FILTER_PRESETS.map(p => (
              <button
                key={p.mode}
                className={`filter-pill ${filterMode === p.mode ? 'active' : ''}`}
                onClick={() => handleFilterChange(p.mode)}
              >
                <span className="filter-pill-icon">{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>

          {/* Context Controls depending on mode */}
          <div className="filter-context">
            {filterMode === 'vigencia' && (
              <select
                value={selectedVigencia}
                onChange={e => setSelectedVigencia(e.target.value)}
                className="filter-select"
              >
                {vigencias.map(v => (
                  <option key={v.month} value={`${v.from}|${v.to}`}>
                    {v.name} ({v.from} → {v.to})
                  </option>
                ))}
              </select>
            )}

            {filterMode === 'custom' && (
              <div className="filter-custom">
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="filter-input"
                />
                <span className="filter-arrow">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="filter-input"
                />
                <button className="btn-primary btn-sm" onClick={handleApplyCustom}>
                  Aplicar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <div className="loading-text">Cargando datos de HubSpot...</div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="panel">
            <div className="error-panel">
              <div className="error-icon">⚠️</div>
              <div><strong>Error al cargar datos</strong></div>
              <div className="error-message">{error}</div>
              <button className="retry-btn" onClick={() => {
                if (activeDates) {
                  fetchData(activeDates.from, activeDates.to)
                } else if (customFrom && customTo) {
                  fetchData(customFrom, customTo)
                }
              }}>
                Reintentar
              </button>
            </div>
          </div>
        )}

        {/* Dashboard Content */}
        {data && !loading && (
          <>
            <KPICards data={data} settings={settings} selectedDate={selectedDate} crossData={crossData} />

            {/* Vendedores — Top-level filter, collapsed by default */}
            <VendedoresPanel
              crossData={crossData}
              ownerNames={ownerNames}
              ownerTeams={ownerTeams}
              selectedVendedor={selectedVendedor}
              onSelectVendedor={setSelectedVendedor}
              expanded={vendedoresExpanded}
              onToggleExpanded={() => setVendedoresExpanded(v => !v)}
            />

            <DailyTimeline
              crossData={crossData}
              from={data.period.from}
              to={data.period.to}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              selectedVendedor={selectedVendedor}
            />

            <InteractiveDataSection data={data} crossData={crossData} selectedDate={selectedDate} selectedVendedor={selectedVendedor} ownerNames={ownerNames} />
          </>
        )}
      </div>

      {/* Chat FAB */}
      {!chatOpen && (
        <button className="chat-fab" onClick={() => setChatOpen(true)} title="Asistente Medicus">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Chat Drawer */}
      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  )
}
