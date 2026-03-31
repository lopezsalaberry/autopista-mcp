import { useState, useEffect, useCallback } from 'react'
import './index.css'

// ── Types matching backend response ─────────────────────────
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

// ── API ─────────────────────────────────────────────────────
const API_BASE = '/api/dashboard'

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
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

// ── KPI Cards ───────────────────────────────────────────────
function KPICards({ data }: { data: LeadsData }) {
  const prev = data.previousPeriod
  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-label">Total Leads</div>
        <div className="kpi-value">{fmt(data.total)}</div>
        {prev && (
          <div className={`kpi-delta ${prev.deltaTotal >= 0 ? 'positive' : 'negative'}`}>
            <span className="arrow">{prev.deltaTotal >= 0 ? '▲' : '▼'}</span>
            {Math.abs(prev.deltaTotal).toFixed(1)}% vs anterior
          </div>
        )}
      </div>

      <div className="kpi-card">
        <div className="kpi-label">Convertidos</div>
        <div className="kpi-value">{fmt(data.converted)}</div>
        {prev && (
          <div className={`kpi-delta ${data.converted >= prev.converted ? 'positive' : 'negative'}`}>
            <span className="arrow">{data.converted >= prev.converted ? '▲' : '▼'}</span>
            {fmt(prev.converted)} anterior
          </div>
        )}
      </div>

      <div className="kpi-card">
        <div className="kpi-label">Tasa de Conversión</div>
        <div className="kpi-value">{fmtPct(data.conversionRate)}</div>
        {prev && (
          <div className={`kpi-delta ${prev.deltaConversion >= 0 ? 'positive' : 'negative'}`}>
            <span className="arrow">{prev.deltaConversion >= 0 ? '▲' : '▼'}</span>
            {Math.abs(prev.deltaConversion).toFixed(2)}pp
          </div>
        )}
      </div>

      {prev && (
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

// ── Categoría Composition ───────────────────────────────────
function CategoriaComposition({ data }: { data: LeadsData }) {
  return (
    <div className="panel">
      <div className="section-title">
        <span className="icon">📊</span> Composición por Categoría
      </div>
      <div className="composition-grid">
        {data.byCategoria.map(cat => (
          <div key={cat.name} className="composition-item">
            <div className="composition-pct" style={{ color: CAT_COLORS[cat.name] || 'var(--brand-primary)' }}>
              {cat.pct}%
            </div>
            <div className="composition-name">{cat.name}</div>
            <div className="composition-count">{fmt(cat.count)} leads · {fmtPct(cat.rate)} conv.</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Canal Bar Chart ─────────────────────────────────────────
function CanalChart({ data }: { data: LeadsData }) {
  const maxCount = Math.max(...data.byCanal.map(c => c.count))

  return (
    <div className="panel">
      <div className="section-title">
        <span className="icon">📡</span> Leads por Canal
      </div>
      <div className="bar-chart">
        {data.byCanal.map((canal, i) => (
          <div key={canal.name} className="bar-row">
            <div className="bar-label">{canal.displayName}</div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{
                  width: `${(canal.count / maxCount) * 100}%`,
                  background: CANAL_COLORS[i % CANAL_COLORS.length],
                }}
              >
                {canal.pct}%
              </div>
            </div>
            <div className="bar-value">{fmt(canal.count)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Conversion Table ────────────────────────────────────────
function ConversionTable({ data }: { data: LeadsData }) {
  return (
    <div className="panel">
      <div className="section-title">
        <span className="icon">🔄</span> Conversión por Canal
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Canal</th>
            <th>Leads</th>
            <th>Convertidos</th>
            <th>% Conversión</th>
          </tr>
        </thead>
        <tbody>
          {data.byCanal.map((canal, i) => (
            <tr key={canal.name}>
              <td>
                <span className="channel-dot" style={{ background: CANAL_COLORS[i % CANAL_COLORS.length] }} />
                {canal.displayName}
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
  )
}

// ── Top Campañas ────────────────────────────────────────────
function TopCampanas({ data }: { data: LeadsData }) {
  return (
    <div className="panel">
      <div className="section-title">
        <span className="icon">📋</span> Top Campañas
      </div>
      <div className="campana-list">
        {data.topCampanas.slice(0, 8).map(camp => (
          <div key={camp.name} className="campana-item">
            <div className="campana-name">{camp.name}</div>
            <div className="campana-stats">
              <div className="campana-count">{fmt(camp.count)}</div>
              <span className={`conv-badge ${convClass(camp.rate)}`}>
                {fmtPct(camp.rate)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main App ────────────────────────────────────────────────
export default function App() {
  const [vigencias, setVigencias] = useState<Vigencia[]>([])
  const [selectedVigencia, setSelectedVigencia] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [filterMode, setFilterMode] = useState<'vigencia' | 'custom'>('vigencia')
  const [data, setData] = useState<LeadsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load vigencias on mount
  useEffect(() => {
    const year = new Date().getFullYear()
    fetchApi<{ vigencias: Vigencia[] }>(`/vigencias?year=${year}`)
      .then(res => {
        setVigencias(res.vigencias)
        // Default to current month or most recent
        const currentMonth = new Date().getMonth() + 1
        const currentVig = res.vigencias.find(v => v.month === currentMonth)
          || res.vigencias[res.vigencias.length - 1]
        if (currentVig) {
          setSelectedVigencia(`${currentVig.from}|${currentVig.to}`)
        }
      })
      .catch(err => setError(err.message))
  }, [])

  // Fetch data when dates change
  const fetchData = useCallback(async (from: string, to: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchApi<LeadsData>(`/leads?from=${from}&to=${to}`)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (filterMode === 'vigencia' && selectedVigencia) {
      const [from, to] = selectedVigencia.split('|')
      fetchData(from, to)
    }
  }, [filterMode, selectedVigencia, fetchData])

  const handleApplyCustom = () => {
    if (customFrom && customTo) {
      fetchData(customFrom, customTo)
    }
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div>
          <h1>Growth Dashboard</h1>
          <div className="subtitle">Medicus — Leads & Conversión</div>
        </div>
        {data && !loading && (
          <div style={{ textAlign: 'right', fontSize: '0.85rem', opacity: 0.8 }}>
            {data.period.from} → {data.period.to}
          </div>
        )}
      </header>

      <div className="dashboard-body">
        {/* Filters */}
        <div className="filter-bar">
          <div className="filter-label">Periodo</div>

          <select
            value={filterMode}
            onChange={e => setFilterMode(e.target.value as 'vigencia' | 'custom')}
          >
            <option value="vigencia">Vigencia</option>
            <option value="custom">Personalizado</option>
          </select>

          {filterMode === 'vigencia' ? (
            <select
              value={selectedVigencia}
              onChange={e => setSelectedVigencia(e.target.value)}
            >
              {vigencias.map(v => (
                <option key={v.month} value={`${v.from}|${v.to}`}>
                  {v.name} ({v.from} → {v.to})
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
              />
              <span style={{ color: 'var(--text-muted)' }}>→</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
              />
              <button
                className="retry-btn"
                style={{ padding: '8px 16px', margin: 0 }}
                onClick={handleApplyCustom}
              >
                Aplicar
              </button>
            </>
          )}
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
                if (filterMode === 'vigencia' && selectedVigencia) {
                  const [from, to] = selectedVigencia.split('|')
                  fetchData(from, to)
                } else if (filterMode === 'custom' && customFrom && customTo) {
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
            <KPICards data={data} />
            <CategoriaComposition data={data} />

            <div className="grid-2">
              <CanalChart data={data} />
              <ConversionTable data={data} />
            </div>

            <TopCampanas data={data} />
          </>
        )}
      </div>
    </div>
  )
}
