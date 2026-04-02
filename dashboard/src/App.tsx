/**
 * App — Dashboard application shell.
 *
 * Responsibilities:
 * - Auth gate (login screen when unauthenticated)
 * - Page routing (dashboard ↔ settings)
 * - Filter bar with date mode selection
 * - Data orchestration via useDashboardData hook
 * - Error Boundaries around each major section
 */

import { useState, useEffect, useMemo } from 'react'
import './index.css'

import type { FilterMode, Page, Settings, Vigencia } from './types'
import { fetchApi } from './api'
import { setAuthToken } from './api'
import { getDateRange, loadSettings, saveSettings, FILTER_PRESETS } from './helpers'
import { useDashboardData } from './hooks/useDashboardData'

import { useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'

import { ErrorBoundary } from './components/ErrorBoundary'
import { KPICards } from './components/KPICards'
import { VendedoresPanel } from './components/VendedoresPanel'
import { DailyTimeline } from './components/DailyTimeline'
import { InteractiveDataSection } from './components/InteractiveDataSection'
import { SettingsPage } from './components/SettingsPage'
import { ChatDrawer } from './components/ChatDrawer'

// ══════════════════════════════════════════════════════════════
// ── MAIN APP ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

export default function App() {
  const { isAuthenticated, isLoading: authLoading, token, user, logout } = useAuth()
  const [chatOpen, setChatOpen] = useState(false)
  const [page, setPage] = useState<Page>('dashboard')
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [vigencias, setVigencias] = useState<Vigencia[]>([])
  const [selectedVigencia, setSelectedVigencia] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('vigencia')
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null)
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({})
  const [ownerTeams, setOwnerTeams] = useState<Record<string, string>>({})
  const [vendedoresExpanded, setVendedoresExpanded] = useState(false)

  // Data fetching hook — owns loading, error, cache, abort
  const { data, crossData, loading, error, selectedDate, setSelectedDate, fetchData } = useDashboardData()

  // Sync auth token into the API module
  useEffect(() => {
    setAuthToken(token)
  }, [token])

  // Fetch owner names + teams once authenticated
  useEffect(() => {
    if (!isAuthenticated) return
    fetchApi<{ names: Record<string, string>; teams: Record<string, string> }>('/owners')
      .then(res => {
        setOwnerNames(res.names)
        setOwnerTeams(res.teams)
      })
      .catch(() => { /* non-critical — vendedores panel will show IDs */ })
  }, [isAuthenticated])

  // Load vigencias once authenticated, then apply per-month overrides
  useEffect(() => {
    if (!isAuthenticated) return
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
      .catch(() => { /* vigencia selector will be empty */ })
  }, [isAuthenticated, settings.vigenciaOverrides])

  // Active date range from current filter mode
  const activeDates = useMemo(() => {
    if (filterMode === 'vigencia' && selectedVigencia) {
      const [from, to] = selectedVigencia.split('|')
      // Find the selected vigencia and its predecessor for previous period
      const currentVig = vigencias.find(v => v.from === from && v.to === to)
      if (currentVig) {
        const prevVig = vigencias.find(v => v.month === currentVig.month - 1)
          || (currentVig.month === 1 ? null : undefined) // January has no prev in same year
        if (prevVig) {
          return { from, to, previousFrom: prevVig.from, previousTo: prevVig.to }
        }
      }
      return { from, to }
    }
    if (filterMode === 'custom') return null // manual trigger
    return getDateRange(filterMode)
  }, [filterMode, selectedVigencia, vigencias])

  // Auto-fetch when activeDates changes (except custom)
  useEffect(() => {
    if (activeDates && filterMode !== 'custom') {
      const { from, to } = activeDates
      const previousFrom = 'previousFrom' in activeDates ? activeDates.previousFrom : undefined
      const previousTo = 'previousTo' in activeDates ? activeDates.previousTo : undefined
      fetchData(from, to, previousFrom, previousTo)
    }
  }, [activeDates, filterMode, fetchData])

  const handleApplyCustom = () => {
    if (customFrom && customTo) fetchData(customFrom, customTo)
  }

  const handleFilterChange = (mode: FilterMode) => {
    setFilterMode(mode)
    setSelectedDate(null) // Reset day selection when period changes
  }

  const handleSaveSettings = (s: Settings) => {
    setSettings(s)
    saveSettings(s)
  }

  // ── AUTH GATE (after all hooks) ─────────────────────────────
  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="spinner" />
        <div className="auth-loading-text">Verificando sesión...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
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
          <button className="header-btn" onClick={logout} title={`Cerrar sesión (${user?.displayName})`}>🚪</button>
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

        {/* Dashboard Content — each section wrapped in ErrorBoundary */}
        {data && !loading && (
          <>
            <ErrorBoundary message="Error en indicadores KPI">
              <KPICards data={data} settings={settings} selectedDate={selectedDate} crossData={crossData} />
            </ErrorBoundary>

            <ErrorBoundary message="Error en panel de vendedores">
              <VendedoresPanel
                crossData={crossData}
                ownerNames={ownerNames}
                ownerTeams={ownerTeams}
                selectedVendedor={selectedVendedor}
                onSelectVendedor={setSelectedVendedor}
                expanded={vendedoresExpanded}
                onToggleExpanded={() => setVendedoresExpanded(v => !v)}
              />
            </ErrorBoundary>

            <ErrorBoundary message="Error en evolución diaria">
              <DailyTimeline
                crossData={crossData}
                from={data.period.from}
                to={data.period.to}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                selectedVendedor={selectedVendedor}
              />
            </ErrorBoundary>

            <ErrorBoundary message="Error en datos interactivos">
              <InteractiveDataSection data={data} crossData={crossData} selectedDate={selectedDate} selectedVendedor={selectedVendedor} ownerNames={ownerNames} />
            </ErrorBoundary>
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
