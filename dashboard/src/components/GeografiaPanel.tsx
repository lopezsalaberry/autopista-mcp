/**
 * GeografiaPanel — Geographic ranking + filter panel.
 * Follows VendedoresPanel pattern:
 * - Collapsed: icon + title + filter label + chevron
 * - Expanded: controls in header + ranking table
 * - Click row = toggle selection + auto-collapse
 *
 * "Ciudades" view groups GBA by partido (municipio) instead of
 * individual localities. Toggle "Agrupar GBA" switches to 3 zones.
 */

import { useState, useMemo } from 'react'
import type { CrossDataRow, SelectedGeo, SortState } from '../types'
import { fmt, fmtPct, convClass, toggleSort, applySortFn, enrichZip } from '../helpers'
import { SortIcon } from './SortIcon'

const MAX_ROWS = 20

interface GeoItem {
  key: string
  name: string
  leads: number
  converted: number
  rate: number
  pct: number
  zips: string[]
  province?: string
}

export function GeografiaPanel({ crossData, selectedGeo, onSelectGeo, expanded, onToggleExpanded }: {
  crossData: CrossDataRow[]
  selectedGeo: SelectedGeo
  onSelectGeo: (g: SelectedGeo) => void
  expanded: boolean
  onToggleExpanded: () => void
}) {
  const [viewMode, setViewMode] = useState<'provincias' | 'ciudades'>('provincias')
  const [groupGBA, setGroupGBA] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [sort, setSort] = useState<SortState | null>(null)

  const crossDataReady = crossData.length > 0

  const { provinces, cities, uniqueProvinces, uniqueCities, sinUbicacion } = useMemo(() => {
    if (!crossDataReady) return { provinces: [], cities: [], uniqueProvinces: [], uniqueCities: [], sinUbicacion: { leads: 0, converted: 0 } }

    const provMap = new Map<string, { leads: number; converted: number; zips: Set<string> }>()
    // City map: for Buenos Aires province, key by partido (or zona if groupGBA).
    // For all other provinces, key by city name.
    const cityMap = new Map<string, { leads: number; converted: number; province: string; zips: Set<string> }>()
    let totalLeads = 0
    let sinUbicLeads = 0
    let sinUbicConverted = 0

    for (const r of crossData) {
      const geo = enrichZip(r.zip)
      totalLeads += r.leads

      if (!geo) {
        sinUbicLeads += r.leads
        sinUbicConverted += r.converted
        continue
      }

      const province = geo.province

      // Province aggregation
      const prov = provMap.get(province)
      if (prov) {
        prov.leads += r.leads
        prov.converted += r.converted
        if (r.zip) prov.zips.add(r.zip)
      } else {
        provMap.set(province, { leads: r.leads, converted: r.converted, zips: new Set(r.zip ? [r.zip] : []) })
      }

      // City/Partido/Zone aggregation
      let cityLabel: string
      if (province === 'Buenos Aires' && geo.partido) {
        // Buenos Aires: group by zona or partido
        cityLabel = groupGBA ? (geo.zona || geo.partido) : geo.partido
      } else if (province === 'Ciudad Autónoma de Buenos Aires') {
        cityLabel = 'Ciudad Autónoma de Buenos Aires'
      } else {
        cityLabel = geo.city
      }

      const cityKey = `${province}\x00${cityLabel}`
      const ct = cityMap.get(cityKey)
      if (ct) {
        ct.leads += r.leads
        ct.converted += r.converted
        if (r.zip) ct.zips.add(r.zip)
      } else {
        cityMap.set(cityKey, { leads: r.leads, converted: r.converted, province, zips: new Set(r.zip ? [r.zip] : []) })
      }
    }

    const makeItems = (map: Map<string, { leads: number; converted: number; zips: Set<string> }>, nameFromKey: (k: string) => string, provFromKey?: (k: string) => string): GeoItem[] => {
      return Array.from(map.entries())
        .map(([k, v]) => ({
          key: k, name: nameFromKey(k), leads: v.leads, converted: v.converted,
          rate: v.leads > 0 ? Number(((v.converted / v.leads) * 100).toFixed(2)) : 0,
          pct: totalLeads > 0 ? Number(((v.leads / totalLeads) * 100).toFixed(1)) : 0,
          zips: Array.from(v.zips), province: provFromKey ? provFromKey(k) : undefined,
        }))
        .filter(v => v.leads > 0)
        .sort((a, b) => b.leads - a.leads)
    }

    const provItems = makeItems(provMap, k => k)
    const cityItems = makeItems(cityMap, k => k.split('\x00')[1], k => k.split('\x00')[0])

    return {
      provinces: provItems,
      cities: cityItems,
      uniqueProvinces: provItems.map(p => p.name).sort(),
      uniqueCities: cityItems.slice(0, 50),
      sinUbicacion: { leads: sinUbicLeads, converted: sinUbicConverted },
    }
  }, [crossData, crossDataReady, groupGBA])

  if (!crossDataReady) return null

  const allItems = viewMode === 'provincias' ? provinces : cities
  const visibleItems = showAll ? allItems : allItems.slice(0, MAX_ROWS)
  const hiddenCount = allItems.length - Math.min(MAX_ROWS, allItems.length)
  const maxLeads = Math.max(...visibleItems.map(v => v.leads), 1)

  const selectedProvinces = selectedGeo?.provinces || []
  const selectedCities = selectedGeo && 'cities' in selectedGeo ? selectedGeo.cities : []

  const toggleProvince = (province: string) => {
    if (selectedProvinces.includes(province)) {
      const next = selectedProvinces.filter(p => p !== province)
      onSelectGeo(next.length ? { provinces: next } : null)
    } else {
      onSelectGeo({ provinces: [...selectedProvinces, province] })
    }
  }

  const toggleCity = (cityItem: GeoItem) => {
    const province = cityItem.province || cityItem.key.split('\x00')[0]
    const currentCities = selectedCities
    const currentZips = selectedGeo && 'zips' in selectedGeo ? selectedGeo.zips : []

    if (currentCities.includes(cityItem.name)) {
      const nextCities = currentCities.filter(c => c !== cityItem.name)
      const nextZips = currentZips.filter(z => !cityItem.zips.includes(z))
      if (nextCities.length) {
        onSelectGeo({ provinces: selectedProvinces, cities: nextCities, zips: nextZips })
      } else {
        onSelectGeo(selectedProvinces.length ? { provinces: selectedProvinces } : null)
      }
    } else {
      const provs = selectedProvinces.includes(province) ? selectedProvinces : [...selectedProvinces, province]
      onSelectGeo({
        provinces: provs,
        cities: [...currentCities, cityItem.name],
        zips: [...currentZips, ...cityItem.zips],
      })
    }
  }

  const IconMapPin = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )

  const headerLabel = selectedProvinces.length
    ? (selectedCities.length ? selectedCities.join(', ') : selectedProvinces.join(', '))
    : 'Todo el país'

  const cityColumnLabel = groupGBA ? 'Zona / Ciudad' : (viewMode === 'ciudades' ? 'Partido / Ciudad' : 'Provincia')

  return (
    <div className="panel geografia-panel">
      <div className="section-title" onClick={onToggleExpanded} style={{ cursor: 'pointer' }}>
        <span className="section-icon"><IconMapPin /></span> Geografía
        <span className="vendedor-active-label">— {headerLabel}</span>
        <span className="vendedores-count">
          {allItems.length} {viewMode === 'provincias' ? 'provincias' : (groupGBA ? 'zonas/ciudades' : 'partidos/ciudades')}
        </span>
        <div className="vendedor-controls">
          {expanded && (
            <>
              {viewMode === 'provincias' ? (
                <select
                  className="geo-select"
                  value=""
                  onClick={e => e.stopPropagation()}
                  onChange={e => { if (e.target.value) toggleProvince(e.target.value) }}
                >
                  <option value="">{selectedProvinces.length ? `${selectedProvinces.length} prov.` : 'Provincia'}</option>
                  {uniqueProvinces.map(p => (
                    <option key={p} value={p}>{selectedProvinces.includes(p) ? '✓ ' : ''}{p}</option>
                  ))}
                </select>
              ) : (
                <select
                  className="geo-select"
                  value=""
                  onClick={e => e.stopPropagation()}
                  onChange={e => {
                    const val = e.target.value
                    if (val) { const ci = uniqueCities.find(c => c.name === val); if (ci) toggleCity(ci) }
                  }}
                >
                  <option value="">{selectedCities.length ? `${selectedCities.length} selec.` : (groupGBA ? 'Zona/Ciudad' : 'Partido/Ciudad')}</option>
                  {uniqueCities.slice(0, MAX_ROWS).map(c => (
                    <option key={c.key} value={c.name}>{selectedCities.includes(c.name) ? '✓ ' : ''}{c.name} ({fmt(c.leads)})</option>
                  ))}
                </select>
              )}
              <button
                className={`rank-toggle ${viewMode === 'provincias' ? 'active' : ''}`}
                onClick={e => { e.stopPropagation(); setViewMode('provincias'); setShowAll(false) }}
              >
                Provincias
              </button>
              <button
                className={`rank-toggle ${viewMode === 'ciudades' ? 'active' : ''}`}
                onClick={e => { e.stopPropagation(); setViewMode('ciudades'); setShowAll(false) }}
              >
                Ciudades
              </button>
              {viewMode === 'ciudades' && (
                <button
                  className={`rank-toggle ${groupGBA ? 'active' : ''}`}
                  onClick={e => { e.stopPropagation(); setGroupGBA(g => !g); setShowAll(false) }}
                >
                  {groupGBA ? 'Zonas GBA' : 'Partidos'}
                </button>
              )}
            </>
          )}
        </div>
        {selectedGeo && (
          <button className="filter-clear" onClick={e => { e.stopPropagation(); onSelectGeo(null) }}>
            ✕ Quitar filtro
          </button>
        )}
        <span className={`collapse-chevron ${expanded ? 'expanded' : ''}`}>▾</span>
      </div>
      {expanded && (
        <>
          {visibleItems.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Sin datos geográficos disponibles
            </div>
          ) : (
            <>
              <table className="data-table sortable-table vendedores-table">
                <thead>
                  <tr>
                    <th style={{ width: '32px', textAlign: 'center' }}>#</th>
                    <th className="sortable-th" style={{ textAlign: 'left', width: viewMode === 'ciudades' ? '22%' : '30%' }} onClick={() => setSort(s => toggleSort(s, 'displayName'))}>
                      {cityColumnLabel} <SortIcon active={sort?.key === 'displayName'} dir={sort?.dir} />
                    </th>
                    {viewMode === 'ciudades' && (
                      <th className="sortable-th" style={{ textAlign: 'left', width: '18%' }} onClick={() => setSort(s => toggleSort(s, 'provinceName'))}>
                        Provincia <SortIcon active={sort?.key === 'provinceName'} dir={sort?.dir} />
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
                    visibleItems.map((v, i) => ({
                      ...v, displayName: v.name, provinceName: v.province || '', count: v.leads, _rank: i + 1,
                    })),
                    sort,
                  ).map(v => {
                    const rank = (v as Record<string, unknown>)._rank as number
                    const isProvince = viewMode === 'provincias'
                    const isActive = isProvince ? selectedProvinces.includes(v.name) : selectedCities.includes(v.name)
                    const isDimmed = selectedGeo && !isActive

                    return (
                      <tr
                        key={v.key}
                        className={`drill-row vendedor-row ${isActive ? 'vendedor-active' : ''} ${isDimmed ? 'vendedor-dimmed' : ''}`}
                        onClick={() => {
                          if (isProvince) toggleProvince(v.name)
                          else toggleCity(v as GeoItem)
                          if (!isActive && expanded) onToggleExpanded()
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ textAlign: 'center' }}><span className="rank-num">{rank}</span></td>
                        <td style={{ textAlign: 'left' }}><span className="vendedor-name">{v.name}</span></td>
                        {viewMode === 'ciudades' && (
                          <td style={{ textAlign: 'left' }}><span className="vendedor-team">{(v as Record<string, unknown>).provinceName as string}</span></td>
                        )}
                        <td style={{ textAlign: 'left' }}>
                          <div className="inline-bar-track">
                            <div className="inline-bar-fill vendedor-bar" style={{ width: `${(v.leads / maxLeads) * 100}%` }} />
                          </div>
                        </td>
                        <td>{fmt(v.leads)}</td>
                        <td>{fmt(v.converted)}</td>
                        <td><span className={convClass(v.rate)}>{fmtPct(v.rate)}</span></td>
                        <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{v.pct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="geo-footer">
                {!showAll && hiddenCount > 0 && (
                  <button className="geo-show-all" onClick={() => setShowAll(true)}>
                    Ver todos ({hiddenCount} más)
                  </button>
                )}
                {showAll && hiddenCount > 0 && (
                  <button className="geo-show-all" onClick={() => setShowAll(false)}>
                    Ver top {MAX_ROWS}
                  </button>
                )}
                {sinUbicacion.leads > 0 && (
                  <span className="geo-sin-ubicacion">
                    {fmt(sinUbicacion.leads)} leads sin ubicación ({fmtPct(sinUbicacion.converted / sinUbicacion.leads * 100)} conv.)
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
