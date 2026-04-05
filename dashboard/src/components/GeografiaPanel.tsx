/**
 * GeografiaPanel — Geographic ranking + filter panel.
 * Unified component: filter dropdowns on top (always visible),
 * province/city ranking table below (collapsed by default).
 * Follows VendedoresPanel pattern: collapsible, sortable, clickable.
 */

import { useState, useMemo } from 'react'
import type { CrossDataRow, SelectedGeo, SortState } from '../types'
import { fmt, fmtPct, convClass, toggleSort, applySortFn, enrichZip, MIN_LEADS_FOR_RATE_RANK } from '../helpers'
import { SortIcon } from './SortIcon'

interface GeoItem {
  key: string
  name: string
  leads: number
  converted: number
  rate: number
  pct: number
  zips: string[]
}

export function GeografiaPanel({ crossData, selectedGeo, onSelectGeo, expanded, onToggleExpanded }: {
  crossData: CrossDataRow[]
  selectedGeo: SelectedGeo
  onSelectGeo: (g: SelectedGeo) => void
  expanded: boolean
  onToggleExpanded: () => void
}) {
  const [viewMode, setViewMode] = useState<'provincias' | 'ciudades'>('provincias')
  const [rankBy, setRankBy] = useState<'leads' | 'rate'>('leads')
  const [sort, setSort] = useState<SortState | null>(null)

  const crossDataReady = crossData.length > 0

  // Enrich all rows with geo data and aggregate
  const { provinces, cities, uniqueProvinces } = useMemo(() => {
    if (!crossDataReady) return { provinces: [], cities: [], uniqueProvinces: [] }

    const provMap = new Map<string, { leads: number; converted: number; zips: Set<string> }>()
    const cityMap = new Map<string, { leads: number; converted: number; province: string; zips: Set<string> }>()
    let totalLeads = 0

    for (const r of crossData) {
      const geo = enrichZip(r.zip)
      const province = geo?.province || 'Sin ubicación'
      const city = geo?.city || 'Sin ubicación'
      const cityKey = `${province}\x00${city}`

      // Province aggregation
      const prov = provMap.get(province)
      if (prov) {
        prov.leads += r.leads
        prov.converted += r.converted
        if (r.zip) prov.zips.add(r.zip)
      } else {
        provMap.set(province, { leads: r.leads, converted: r.converted, zips: new Set(r.zip ? [r.zip] : []) })
      }

      // City aggregation
      const ct = cityMap.get(cityKey)
      if (ct) {
        ct.leads += r.leads
        ct.converted += r.converted
        if (r.zip) ct.zips.add(r.zip)
      } else {
        cityMap.set(cityKey, { leads: r.leads, converted: r.converted, province, zips: new Set(r.zip ? [r.zip] : []) })
      }

      totalLeads += r.leads
    }

    const toItems = (map: Map<string, { leads: number; converted: number; zips: Set<string> }>, keyFn: (k: string) => string): GeoItem[] => {
      return Array.from(map.entries())
        .map(([k, v]) => ({
          key: k,
          name: keyFn(k),
          leads: v.leads,
          converted: v.converted,
          rate: v.leads > 0 ? Number(((v.converted / v.leads) * 100).toFixed(2)) : 0,
          pct: totalLeads > 0 ? Number(((v.leads / totalLeads) * 100).toFixed(1)) : 0,
          zips: Array.from(v.zips),
        }))
        .filter(v => v.leads > 0)
    }

    let provItems = toItems(provMap, k => k)
    let cityItems = toItems(cityMap, k => {
      const [, city] = k.split('\x00')
      return city
    }).map(item => {
      const [province] = item.key.split('\x00')
      return { ...item, province }
    })

    // Sort
    const sortItems = (items: GeoItem[]) => {
      if (rankBy === 'rate') {
        return items.sort((a, b) => {
          const aQ = a.leads >= MIN_LEADS_FOR_RATE_RANK ? 1 : 0
          const bQ = b.leads >= MIN_LEADS_FOR_RATE_RANK ? 1 : 0
          if (aQ !== bQ) return bQ - aQ
          return b.rate - a.rate
        })
      }
      return items.sort((a, b) => b.leads - a.leads)
    }

    provItems = sortItems(provItems)
    cityItems = sortItems(cityItems as (GeoItem & { province: string })[])

    const uniqueProvs = provItems.map(p => p.name).filter(p => p !== 'Sin ubicación').sort()

    return { provinces: provItems, cities: cityItems, uniqueProvinces: uniqueProvs }
  }, [crossData, crossDataReady, rankBy])

  // Cities filtered by selected province (for dropdown)
  const filteredCities = useMemo(() => {
    if (!selectedGeo || !('province' in selectedGeo)) return []
    return cities
      .filter(c => (c as GeoItem & { province: string }).province === selectedGeo.province)
      .sort((a, b) => b.leads - a.leads)
  }, [cities, selectedGeo])

  if (!crossDataReady) return null

  const items = viewMode === 'provincias' ? provinces : cities
  const maxLeads = Math.max(...items.map(v => v.leads), 1)

  const selectedProvinceName = selectedGeo?.province || null
  const selectedCityName = selectedGeo && 'city' in selectedGeo ? selectedGeo.city : null

  const handleProvinceSelect = (province: string) => {
    if (selectedGeo?.province === province && !('city' in (selectedGeo || {}))) {
      onSelectGeo(null)
    } else {
      onSelectGeo({ province })
    }
  }

  const handleCitySelect = (cityItem: GeoItem & { province?: string }) => {
    const province = (cityItem as GeoItem & { province: string }).province || cityItem.key.split('\x00')[0]
    if (selectedGeo && 'city' in selectedGeo && selectedGeo.city === cityItem.name) {
      onSelectGeo(null)
    } else {
      onSelectGeo({ province, city: cityItem.name, zips: cityItem.zips })
    }
  }

  // Icon: simple map pin
  const IconMapPin = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )

  return (
    <div className="panel geografia-panel">
      {/* Filter dropdowns — always visible */}
      <div className="geo-filter-bar">
        <span className="geo-filter-label">Zona</span>
        <select
          className="geo-select"
          value={selectedProvinceName || ''}
          onChange={e => {
            const val = e.target.value
            if (val) {
              onSelectGeo({ province: val })
            } else {
              onSelectGeo(null)
            }
          }}
        >
          <option value="">Todas las provincias</option>
          {uniqueProvinces.length === 0 ? (
            <option disabled>Sin datos geográficos disponibles</option>
          ) : (
            uniqueProvinces.map(p => (
              <option key={p} value={p}>{p}</option>
            ))
          )}
        </select>

        {selectedProvinceName && (
          <select
            className="geo-select"
            value={selectedCityName || ''}
            onChange={e => {
              const val = e.target.value
              if (val) {
                const cityItem = filteredCities.find(c => c.name === val)
                if (cityItem) {
                  const province = (cityItem as GeoItem & { province: string }).province || selectedProvinceName
                  onSelectGeo({ province, city: val, zips: cityItem.zips })
                }
              } else {
                onSelectGeo({ province: selectedProvinceName })
              }
            }}
          >
            <option value="">Todas las ciudades</option>
            {filteredCities.length === 0 ? (
              <option disabled>Sin datos geográficos disponibles</option>
            ) : (
              filteredCities.map(c => (
                <option key={c.key} value={c.name}>{c.name} ({fmt(c.leads)})</option>
              ))
            )}
          </select>
        )}

        {selectedGeo && (
          <button className="filter-clear geo-clear" onClick={() => onSelectGeo(null)}>
            ✕ Limpiar geo
          </button>
        )}
      </div>

      {/* Collapsible ranking table */}
      <div className="section-title" onClick={onToggleExpanded} style={{ cursor: 'pointer' }}>
        <span className="section-icon"><IconMapPin /></span> Geografía
        {selectedProvinceName && (
          <span className="vendedor-active-label">— {selectedCityName ? `${selectedCityName}, ${selectedProvinceName}` : selectedProvinceName}</span>
        )}
        <span className="vendedores-count">{items.length} {viewMode === 'provincias' ? 'provincias' : 'ciudades'}</span>
        <div className="vendedor-controls">
          {expanded && (
            <>
              <button
                className={`rank-toggle ${viewMode === 'provincias' ? 'active' : ''}`}
                onClick={e => { e.stopPropagation(); setViewMode('provincias') }}
              >
                Provincias
              </button>
              <button
                className={`rank-toggle ${viewMode === 'ciudades' ? 'active' : ''}`}
                onClick={e => { e.stopPropagation(); setViewMode('ciudades') }}
              >
                Ciudades
              </button>
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
        <span className={`collapse-chevron ${expanded ? 'expanded' : ''}`}>▾</span>
      </div>
      {expanded && (
        <>
          {items.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Sin datos geográficos disponibles
            </div>
          ) : (
            <table className="data-table sortable-table vendedores-table">
              <thead>
                <tr>
                  <th style={{ width: '32px', textAlign: 'center' }}>#</th>
                  <th className="sortable-th" style={{ textAlign: 'left', width: '30%' }} onClick={() => setSort(s => toggleSort(s, 'displayName'))}>
                    {viewMode === 'provincias' ? 'Provincia' : 'Ciudad'} <SortIcon active={sort?.key === 'displayName'} dir={sort?.dir} />
                  </th>
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
                  items.map((v, i) => ({
                    ...v,
                    displayName: v.name,
                    count: v.leads,
                    _rank: i + 1,
                  })),
                  sort,
                ).map(v => {
                  const rank = (v as Record<string, unknown>)._rank as number
                  const isProvince = viewMode === 'provincias'
                  const isActive = isProvince
                    ? selectedProvinceName === v.name && !selectedCityName
                    : selectedCityName === v.name
                  const isDimmed = selectedGeo && !isActive
                  const belowThreshold = rankBy === 'rate' && v.leads < MIN_LEADS_FOR_RATE_RANK

                  return (
                    <tr
                      key={v.key}
                      className={`drill-row vendedor-row ${isActive ? 'vendedor-active' : ''} ${isDimmed ? 'vendedor-dimmed' : ''} ${belowThreshold ? 'vendedor-below-threshold' : ''}`}
                      onClick={() => {
                        if (isProvince) {
                          handleProvinceSelect(v.name)
                        } else {
                          handleCitySelect(v as GeoItem & { province: string })
                        }
                        if (!isActive && expanded) onToggleExpanded()
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <span className="rank-num">{rank}</span>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <span className="vendedor-name">{v.name}</span>
                      </td>
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
