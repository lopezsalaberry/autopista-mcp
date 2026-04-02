/**
 * KPICards — Top-level KPI metric cards with delta comparison and goal progress.
 * Includes "Venta Online" card: deals in "Alta de Socio - Adm de Ventas"
 * owned by Promotor Directo, fetched from backend deal search.
 */

import { useMemo } from 'react'
import type { CrossDataRow, LeadsData, Settings, Vigencia } from '../types'
import { fmt, fmtPct, computeGoalProgress, formatDateShort } from '../helpers'

interface Props {
  data: LeadsData
  settings: Settings
  selectedDate: string | null
  crossData: CrossDataRow[]
  effectiveGoal?: number
  ventaOnline: number
  vigencias?: Vigencia[]
}

export function KPICards({ data, settings, selectedDate, crossData, effectiveGoal, ventaOnline, vigencias }: Props) {
  const prev = data.previousPeriod
  const goal = computeGoalProgress(data, settings, effectiveGoal, vigencias)

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
        <div className="kpi-label">
          Total Leads
          {selectedDate ? ` — ${formatDateShort(selectedDate)}` : ''}
        </div>
        <div className="kpi-value">{fmt(displayTotal)}</div>
        {showDeltas && prev && (
          <div className={`kpi-delta ${prev.deltaTotal >= 0 ? 'positive' : 'negative'}`}>
            <span className="arrow">{prev.deltaTotal >= 0 ? '▲' : '▼'}</span>
            {Math.abs(prev.deltaTotal).toFixed(1)}% vs anterior
          </div>
        )}
        {!selectedDate && effectiveGoal != null && effectiveGoal > 0 && (
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
            {formatDateShort(prev.from)} — {formatDateShort(prev.to)}
          </div>
        </div>
      )}

      {/* Venta Online — deals in Alta de Socio owned by Promotor Directo (rightmost) */}
      <div className="kpi-card kpi-venta-online">
        <div className="kpi-label">Venta Online</div>
        <div className="kpi-value">{fmt(ventaOnline)}</div>
        <div className="kpi-delta" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>
          Alta de Socio · Promotor Directo
        </div>
      </div>
    </div>
  )
}
