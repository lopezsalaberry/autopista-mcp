/**
 * InteractiveDataSection — Tabbed data section with Categorías, Canales, and Campañas.
 * All data is client-side aggregated from crossData for instant filtering.
 */

import { useState, useMemo, useCallback } from 'react'
import type { CrossDataRow, GoalDistribution, LeadsData, SortState } from '../types'
import { fmt, fmtPct, convClass, toggleSort, applySortFn, CANAL_COLORS, CAT_COLORS } from '../helpers'
import { SortIcon } from './SortIcon'
import { IconPieChart, IconRadio, IconMegaphone } from './Icons'

// Canal display names — co-located here since only this component uses them
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

export function InteractiveDataSection({ data, crossData, selectedDate, selectedVendedor, ownerNames, distribution, effectiveGoal }: {
  data: LeadsData
  crossData: CrossDataRow[]
  selectedDate: string | null
  selectedVendedor: string | null
  ownerNames: Record<string, string>
  distribution?: { byCategoria?: GoalDistribution; byCanal?: GoalDistribution }
  effectiveGoal?: number
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
    // Fallback to server-side data only while cross-data is loading
    if (!crossDataReady) {
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
    // Fallback to server-side data only while cross-data is loading
    if (!crossDataReady) {
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

  // ── Categorías — always use cross-data when ready for consistency ─
  const categoriasToShow = useMemo(() => {
    // Fall back to server-side data only while cross-data is loading
    if (!crossDataReady) return data.byCategoria

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
          <span className="section-icon"><IconPieChart /></span> Composición por Categoría
          {hasAnyFilter && (
            <button className="filter-clear" onClick={clearAll}>
              ✕ Limpiar filtros
            </button>
          )}
        </div>
        <div className="composition-grid">
          {categoriasToShow.map(cat => {
            // Sub-goal info from distribution
            const catDist = distribution?.byCategoria
            const allocPct = catDist?.enabled ? (catDist.allocations[cat.name] ?? 0) : 0
            const subGoal = effectiveGoal && allocPct > 0 ? Math.round(effectiveGoal * (allocPct / 100)) : 0

            return (
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
                {subGoal > 0 && !selectedDate && (
                  <div className="composition-subgoal">
                    <div className="subgoal-bar-track">
                      <div
                        className={`subgoal-bar-fill ${cat.count >= subGoal ? 'on-track' : 'behind'}`}
                        style={{ width: `${Math.min((cat.count / subGoal) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="composition-subgoal-text">
                      {fmt(cat.count)}/{fmt(subGoal)} ({allocPct}%)
                    </span>
                  </div>
                )}
              </div>
            )
          })}
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
          <span className="section-icon"><IconRadio /></span> Canales{canalTitle ? ` — ${canalTitle}` : ''}
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
          <span className="section-icon"><IconMegaphone /></span> Campañas{campanaTitle ? ` — ${campanaTitle}` : ''}
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
