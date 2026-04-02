/**
 * SettingsPage — Dashboard configuration: vigencia goals, date overrides,
 * and owner exclusion management with supervisor tree view.
 */

import { useState, useEffect } from 'react'
import type { Settings, Vigencia } from '../types'
import { fetchApi, fetchApiMutate } from '../api'

// ── Supervisor Accordion Group ──────────────────────────────

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

// ── Main Settings Page ──────────────────────────────────────

export function SettingsPage({ settings, onSave, onBack, vigenciasForSettings }: {
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
      .catch(err => setExcludedError(err instanceof Error ? err.message : 'Error desconocido'))
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

  // FIXED: Previously used raw fetch() without auth header — now uses fetchApiMutate
  const saveExcluded = async () => {
    if (excludedIds.length === 0) {
      setExcludedError('Debe haber al menos 1 propietario excluido')
      return
    }
    setExcludedSaving(true)
    setExcludedError(null)
    try {
      await fetchApiMutate('/config/excluded-owners', {
        method: 'PUT',
        body: { excludedOwnerIds: excludedIds },
      })
      setExcludedSaved(true)
      setTimeout(() => setExcludedSaved(false), 3000)
    } catch (err: unknown) {
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
