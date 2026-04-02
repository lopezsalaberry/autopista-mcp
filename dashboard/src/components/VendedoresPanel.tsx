/**
 * VendedoresPanel — Sales representative ranking table.
 * Supports team filtering, lead/conversion sorting, and vendedor selection.
 */

import { useState, useMemo } from 'react'
import type { CrossDataRow, SortState } from '../types'
import { fmt, fmtPct, convClass, toggleSort, applySortFn, MIN_LEADS_FOR_RATE_RANK } from '../helpers'
import { SortIcon } from './SortIcon'

export function VendedoresPanel({ crossData, ownerNames, ownerTeams, selectedVendedor, onSelectVendedor, expanded, onToggleExpanded }: {
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
  const activeTeams = useMemo(() => {
    if (!crossDataReady) return new Set<string>()

    const activeOwners = new Set<string>()
    for (const r of crossData) {
      if (r.leads > 0) activeOwners.add(r.ownerId)
    }

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
                  <th style={{ width: '32px', textAlign: 'center' }}>#</th>
                  <th className="sortable-th" style={{ textAlign: 'left', width: '22%' }} onClick={() => setSort(s => toggleSort(s, 'displayName'))}>
                    Vendedor <SortIcon active={sort?.key === 'displayName'} dir={sort?.dir} />
                  </th>
                  {hasTeams && (
                    <th className="sortable-th" style={{ textAlign: 'left', width: '24%' }} onClick={() => setSort(s => toggleSort(s, 'team'))}>
                      Supervisor <SortIcon active={sort?.key === 'team'} dir={sort?.dir} />
                    </th>
                  )}
                  <th style={{ textAlign: 'left', width: '14%' }}>Distribución</th>
                  <th className="sortable-th" style={{ width: '55px' }} onClick={() => setSort(s => toggleSort(s, 'count'))}>
                    Leads <SortIcon active={sort?.key === 'count'} dir={sort?.dir} />
                  </th>
                  <th className="sortable-th" style={{ width: '50px' }} onClick={() => setSort(s => toggleSort(s, 'converted'))}>
                    Conv. <SortIcon active={sort?.key === 'converted'} dir={sort?.dir} />
                  </th>
                  <th className="sortable-th" style={{ width: '70px' }} onClick={() => setSort(s => toggleSort(s, 'rate'))}>
                    % Conv. <SortIcon active={sort?.key === 'rate'} dir={sort?.dir} />
                  </th>
                  <th style={{ width: '38px', textAlign: 'center' }}>%</th>
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
