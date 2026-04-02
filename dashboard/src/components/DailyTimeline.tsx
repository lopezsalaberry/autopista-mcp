/**
 * DailyTimeline — Interactive line chart showing daily lead evolution.
 *
 * Architecture decisions:
 * - Uses Recharts (SVG-based) for React-native integration + future Brush support
 * - All data is client-side aggregated from crossData (zero additional API calls)
 * - Argentina timezone bucketing happens server-side in crossData
 * - Empty days are gap-filled to prevent misleading chart holes
 * - Hidden when period ≤ 2 days (pointless for single-day views)
 */

import { useState, useMemo, useCallback } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { CrossDataRow } from '../types'

interface DayPoint {
  date: string       // YYYY-MM-DD
  label: string      // "15 Mar" (short display)
  total: number
  pago: number
  organico: number
  outbound: number
  sinClasificar: number
  converted: number
}

/** Numeric-only keys used for category aggregation */
type DayPointNumericKey = 'total' | 'pago' | 'organico' | 'outbound' | 'sinClasificar' | 'converted'

interface DailyTimelineProps {
  crossData: CrossDataRow[]
  from: string        // YYYY-MM-DD
  to: string          // YYYY-MM-DD
  selectedDate: string | null
  onSelectDate: (date: string | null) => void
  selectedVendedor?: string | null
}

// ── Helpers ─────────────────────────────────────────────────

const SHORT_MONTHS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${SHORT_MONTHS[m - 1]}`
}

function generateDateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const current = new Date(`${from}T12:00:00Z`) // noon to avoid DST edge
  const end = new Date(`${to}T12:00:00Z`)

  while (current <= end) {
    const y = current.getUTCFullYear()
    const m = String(current.getUTCMonth() + 1).padStart(2, '0')
    const d = String(current.getUTCDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

const CATEGORY_MAP: Record<string, DayPointNumericKey> = {
  'Pago': 'pago',
  'Organico': 'organico',
  'Outbound': 'outbound',
  'Sin clasificar': 'sinClasificar',
}

// ── Series configuration ────────────────────────────────────

interface SeriesConfig {
  key: string
  dataKey: keyof DayPoint
  name: string
  color: string
  isPrimary?: boolean     // thicker, solid line
  defaultHidden?: boolean // start hidden
}

const ALL_SERIES: SeriesConfig[] = [
  { key: 'total',        dataKey: 'total',        name: 'Total',       color: 'var(--brand-primary)', isPrimary: true },
  { key: 'pago',         dataKey: 'pago',         name: 'Pago',        color: 'var(--cat-pago)' },
  { key: 'organico',     dataKey: 'organico',     name: 'Orgánico',    color: 'var(--cat-organico)' },
  { key: 'outbound',     dataKey: 'outbound',     name: 'Outbound',    color: 'var(--cat-outbound)' },
  { key: 'sinClasificar',dataKey: 'sinClasificar', name: 'Sin clas.',  color: 'var(--cat-sin)', defaultHidden: true },
  { key: 'converted',    dataKey: 'converted',    name: 'Convertidos', color: 'var(--green)', defaultHidden: true },
]

// ── Custom tooltip (respects hidden series) ─────────────────

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ payload: DayPoint }>
  visibleSeries?: Set<string>
}

function CustomTooltip({ active, payload, visibleSeries }: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload
  if (!point) return null

  const visible = visibleSeries

  return (
    <div className="timeline-tooltip">
      <div className="timeline-tooltip-title">{formatShortDate(point.date)}</div>
      {ALL_SERIES.filter(s => !visible || visible.has(s.key)).map((s, i) => (
        <div key={s.key}>
          {i === 1 && <div className="timeline-tooltip-divider" />}
          {s.key === 'converted' && <div className="timeline-tooltip-divider" />}
          <div className="timeline-tooltip-row">
            <span className="timeline-tooltip-dot" style={{ background: s.color }} />
            <span>{s.name}</span>
            <strong>{point[s.dataKey]}</strong>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Component ───────────────────────────────────────────────

export function DailyTimeline({
  crossData: rawCrossData,
  from,
  to,
  selectedDate,
  onSelectDate,
  selectedVendedor,
}: DailyTimelineProps) {

  // Pre-filter crossData by vendedor if selected
  const crossData = useMemo(() => {
    if (!selectedVendedor) return rawCrossData
    return rawCrossData.filter(r => r.ownerId === selectedVendedor)
  }, [rawCrossData, selectedVendedor])

  // Series visibility toggle — start with defaultHidden series hidden
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(
    () => new Set(ALL_SERIES.filter(s => s.defaultHidden).map(s => s.key))
  )

  const visibleSeries = useMemo(
    () => new Set(ALL_SERIES.filter(s => !hiddenSeries.has(s.key)).map(s => s.key)),
    [hiddenSeries]
  )

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        // Don't allow hiding ALL series
        const wouldBeHidden = ALL_SERIES.filter(s => next.has(s.key) || s.key === key).length
        if (wouldBeHidden >= ALL_SERIES.length) return prev
        next.add(key)
      }
      return next
    })
  }, [])

  // Aggregate crossData into daily points, filling gaps
  const timelineData = useMemo(() => {
    if (!crossData.length) return []

    const allDates = generateDateRange(from, to)

    // Aggregate from crossData
    type DayPointAgg = Record<DayPointNumericKey, number>
    const dayMap = new Map<string, DayPointAgg>()

    for (const row of crossData) {
      if (!row.date || row.date === 'unknown') continue

      const existing = dayMap.get(row.date)
      const catKey = CATEGORY_MAP[row.categoria] || 'sinClasificar'

      if (existing) {
        existing.total += row.leads
        existing.converted += row.converted
        existing[catKey] = (existing[catKey] || 0) + row.leads
      } else {
        const point: DayPointAgg = {
          total: row.leads,
          pago: 0,
          organico: 0,
          outbound: 0,
          sinClasificar: 0,
          converted: row.converted,
        }
        point[catKey] = row.leads
        dayMap.set(row.date, point)
      }
    }

    // Fill gaps — every date in range gets a point (even if 0)
    return allDates.map(date => {
      const data = dayMap.get(date)
      return {
        date,
        label: formatShortDate(date),
        total: data?.total ?? 0,
        pago: data?.pago ?? 0,
        organico: data?.organico ?? 0,
        outbound: data?.outbound ?? 0,
        sinClasificar: data?.sinClasificar ?? 0,
        converted: data?.converted ?? 0,
      }
    })
  }, [crossData, from, to])

  // Calculate tick interval based on date range
  const tickInterval = useMemo(() => {
    const len = timelineData.length
    if (len <= 10) return 0
    if (len <= 20) return 1
    if (len <= 45) return 2
    return Math.floor(len / 15)
  }, [timelineData.length])

  // Handle click on chart point
  const handleClick = useCallback((data: Record<string, unknown>) => {
    const activePayload = data?.activePayload as Array<{ payload: DayPoint }> | undefined
    if (activePayload?.[0]?.payload) {
      const clickedDate = activePayload[0].payload.date
      onSelectDate(selectedDate === clickedDate ? null : clickedDate)
    }
  }, [onSelectDate, selectedDate])

  // Custom legend renderer with clickable items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLegend = useCallback((_p: any) => {
    return (
      <div className="timeline-legend">
        {ALL_SERIES.map(s => {
          const isHidden = hiddenSeries.has(s.key)
          return (
            <button
              key={s.key}
              className={`timeline-legend-item ${isHidden ? 'hidden' : ''}`}
              onClick={() => toggleSeries(s.key)}
              title={isHidden ? `Mostrar ${s.name}` : `Ocultar ${s.name}`}
            >
              <span
                className="timeline-legend-dot"
                style={{ background: isHidden ? 'var(--border)' : s.color }}
              />
              <span className="timeline-legend-label">{s.name}</span>
            </button>
          )
        })}
      </div>
    )
  }, [hiddenSeries, toggleSeries])

  // Don't render for periods ≤ 2 days
  if (timelineData.length <= 2) return null

  // If crossData is still loading, show skeleton
  if (!crossData.length) {
    return (
      <div className="panel timeline-panel">
        <div className="section-title">
          <span className="icon">📈</span> Evolución Diaria
        </div>
        <div className="timeline-skeleton">
          <div className="timeline-skeleton-bar" />
        </div>
      </div>
    )
  }

  return (
    <div className="panel timeline-panel">
      <div className="section-title">
        <span className="icon">📈</span> Evolución Diaria
        {selectedDate && (
          <button className="filter-clear" onClick={() => onSelectDate(null)}>
            ✕ Quitar filtro de día
          </button>
        )}
      </div>

      {selectedDate && (
        <div className="timeline-selected-banner">
          📌 Mostrando datos del <strong>{formatShortDate(selectedDate)}</strong>
          <span className="timeline-hint"> — clickeá otro punto o "Quitar filtro" para volver al periodo completo</span>
        </div>
      )}

      <div className="timeline-chart-container">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={timelineData}
            onClick={handleClick}
            margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              interval={tickInterval}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <Tooltip content={<CustomTooltip visibleSeries={visibleSeries} />} />
            <Legend content={renderLegend} />

            {/* Render visible series dynamically */}
            {ALL_SERIES.filter(s => !hiddenSeries.has(s.key)).map(s => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.dataKey}
                name={s.name}
                stroke={s.color}
                strokeWidth={s.isPrimary ? 2.5 : 1.5}
                strokeDasharray={s.isPrimary ? undefined : '4 2'}
                dot={false}
                activeDot={s.isPrimary
                  ? { r: 6, stroke: s.color, strokeWidth: 2, fill: 'white', cursor: 'pointer' }
                  : { r: 4, cursor: 'pointer' }
                }
              />
            ))}

            {/* Highlight selected date */}
            {selectedDate && (
              <Line
                data={timelineData.map(d => ({
                  ...d,
                  _selected: d.date === selectedDate ? d.total : undefined,
                }))}
                type="monotone"
                dataKey="_selected"
                stroke="transparent"
                dot={(props: { cx?: number; cy?: number; payload?: Record<string, unknown> }) => {
                  if (props.payload?._selected == null || !props.cx || !props.cy) return <></>
                  return (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={8}
                      fill="var(--brand-primary)"
                      fillOpacity={0.2}
                      stroke="var(--brand-primary)"
                      strokeWidth={2}
                    />
                  )
                }}
                activeDot={false}
                legendType="none"
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
