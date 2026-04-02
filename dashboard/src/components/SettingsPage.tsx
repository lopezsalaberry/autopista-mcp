/**
 * SettingsPage — Dashboard configuration with tabbed navigation.
 *
 * Tabs:
 * 1. Objetivos — Global lead goal + distribution panels (by category + channel)
 * 2. Vigencias — Year pills + per-month overrides table with distribution modal
 * 3. Exclusiones — Supervisor tree view for owner exclusion management
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Settings, Vigencia, GoalDistribution, VigenciaOverride } from '../types'
import { fetchApi, fetchApiMutate } from '../api'
import { vigenciaKey, addYear, getCategoryList, getCanalList } from '../helpers'
import { GoalDistributionPanel } from './GoalDistributionPanel'
import { DistributionModal } from './DistributionModal'
import {
  IconSettings, IconTarget, IconCalendarRange, IconShield,
  IconArrowLeft, IconReset, IconCheck, IconPlus,
} from './Icons'
import { MedicusLogo } from './MedicusLogo'

type SettingsTab = 'objetivos' | 'vigencias' | 'exclusiones'

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

export function SettingsPage({ settings, onSave, onBack, vigenciasForSettings, selectedYear, onChangeYear }: {
  settings: Settings
  onSave: (s: Settings) => void
  onBack: () => void
  vigenciasForSettings: Vigencia[]
  selectedYear: number
  onChangeYear: (year: number) => void
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('objetivos')
  const [draft, setDraft] = useState<Settings>(() => ({
    ...settings,
    vigenciaOverrides: { ...settings.vigenciaOverrides },
    goalDistribution: { ...settings.goalDistribution },
  }))
  const [saved, setSaved] = useState(false)

  // Distribution validity tracking — gate save when sum ≠ 100
  const [catDistValid, setCatDistValid] = useState(true)
  const [canalDistValid, setCanalDistValid] = useState(true)
  const canSave = catDistValid && canalDistValid

  // Per-vigencia distribution modal state
  const [distribModalVKey, setDistribModalVKey] = useState<string | null>(null)
  const distribModalVigencia = useMemo(() => {
    if (!distribModalVKey) return null
    return vigenciasForSettings.find(
      v => vigenciaKey({ year: selectedYear, month: v.month }) === distribModalVKey,
    ) ?? null
  }, [distribModalVKey, vigenciasForSettings, selectedYear])

  // Category & canal item lists for distribution panels
  const categoryItems = useMemo(() => getCategoryList(null, draft.goalDistribution.byCategoria), [draft.goalDistribution.byCategoria])
  const canalItems = useMemo(() => getCanalList(null, draft.goalDistribution.byCanal), [draft.goalDistribution.byCanal])

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

  // Year management
  const [addingYear, setAddingYear] = useState(false)
  const [newYearInput, setNewYearInput] = useState('')

  const handleSave = useCallback(() => {
    if (!canSave) return
    onSave(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [canSave, draft, onSave])

  const update = (key: keyof Settings, value: number) => {
    setDraft(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const updateGlobalDistribution = useCallback((
    dimension: 'byCategoria' | 'byCanal',
    d: GoalDistribution,
  ) => {
    setDraft(prev => ({
      ...prev,
      goalDistribution: { ...prev.goalDistribution, [dimension]: d },
    }))
    setSaved(false)
  }, [])

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

  // ── Vigencia table helpers ───────────────────────────────────

  const updateVigenciaOverride = useCallback((vKey: string, patch: Partial<VigenciaOverride>, defaultV: Vigencia) => {
    setDraft(prev => {
      const existing = prev.vigenciaOverrides[vKey]
      const newOverrides = { ...prev.vigenciaOverrides }
      newOverrides[vKey] = {
        ...(existing || { from: defaultV.from, to: defaultV.to }),
        ...patch,
      }
      return { ...prev, vigenciaOverrides: newOverrides }
    })
    setSaved(false)
  }, [])

  const resetVigenciaOverride = useCallback((vKey: string) => {
    setDraft(prev => {
      const newOverrides = { ...prev.vigenciaOverrides }
      delete newOverrides[vKey]
      return { ...prev, vigenciaOverrides: newOverrides }
    })
    setSaved(false)
  }, [])

  const handleDistribModalSave = useCallback((result: { byCategoria?: GoalDistribution; byCanal?: GoalDistribution }) => {
    if (!distribModalVKey || !distribModalVigencia) return
    const existing = draft.vigenciaOverrides[distribModalVKey]
    const newOverrides = { ...draft.vigenciaOverrides }
    const hasDistribution = result.byCategoria || result.byCanal

    if (hasDistribution) {
      newOverrides[distribModalVKey] = {
        ...(existing || { from: distribModalVigencia.from, to: distribModalVigencia.to }),
        distribution: result,
      }
    } else if (existing) {
      // Clear distribution but keep date/goal overrides
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { distribution: _omit, ...rest } = existing
      if (rest.goalLeads !== undefined || rest.from !== distribModalVigencia.from || rest.to !== distribModalVigencia.to) {
        newOverrides[distribModalVKey] = rest as VigenciaOverride
      } else {
        delete newOverrides[distribModalVKey]
      }
    }

    setDraft(prev => ({ ...prev, vigenciaOverrides: newOverrides }))
    setSaved(false)
    setDistribModalVKey(null)
  }, [distribModalVKey, distribModalVigencia, draft.vigenciaOverrides])

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-brand">
          <MedicusLogo height={22} />
          <span className="header-brand-sub">Growth</span>
        </div>
        <button className="header-btn" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <IconArrowLeft size={14} /> Dashboard
        </button>
      </header>

      <div className="dashboard-body" style={{ maxWidth: '780px' }}>
        <h2 className="page-title"><IconSettings size={20} /> Configuración</h2>
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'objetivos' ? 'active' : ''}`}
            onClick={() => setActiveTab('objetivos')}
          >
            <IconTarget size={14} /> Objetivos
          </button>
          <button
            className={`settings-tab ${activeTab === 'vigencias' ? 'active' : ''}`}
            onClick={() => setActiveTab('vigencias')}
          >
            <IconCalendarRange size={14} /> Vigencias
          </button>
          <button
            className={`settings-tab ${activeTab === 'exclusiones' ? 'active' : ''}`}
            onClick={() => setActiveTab('exclusiones')}
          >
            <IconShield size={14} /> Exclusiones
            {excludedIds.length > 0 && (
              <span className="tab-badge">{excludedIds.length}</span>
            )}
          </button>
        </div>

        {/* ─── Tab: Objetivos ─────────────────────────────────── */}
        {activeTab === 'objetivos' && (
          <div className="settings-tab-content" key="objetivos">
            <div className="panel">
              <div className="section-title">
                <span className="section-icon"><IconTarget /></span> Objetivo Global
              </div>
              <p className="settings-desc">
                Define el objetivo base de leads mensuales y cómo se distribuyen por categoría y canal.
                Si una vigencia no tiene distribución propia, usa estos valores como fallback.
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
                  <span className="settings-hint">Aplica a vigencias sin objetivo propio. Se prorrata al periodo.</span>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="section-title">
                <span className="section-icon"><IconTarget /></span> Distribución por Categoría
              </div>
              <p className="settings-desc">
                Porcentaje del objetivo que corresponde a cada categoría. Las vigencias sin
                distribución propia heredan estos valores.
              </p>
              <GoalDistributionPanel
                label="Distribución por Categoría"
                distribution={draft.goalDistribution.byCategoria}
                items={categoryItems}
                onChange={d => updateGlobalDistribution('byCategoria', d)}
                onValidChange={setCatDistValid}
              />
            </div>

            <div className="panel">
              <div className="section-title">
                <span className="section-icon"><IconTarget /></span> Distribución por Canal
              </div>
              <p className="settings-desc">
                Porcentaje del objetivo que corresponde a cada canal de adquisición.
                Las vigencias sin distribución propia heredan estos valores.
              </p>
              <GoalDistributionPanel
                label="Distribución por Canal"
                distribution={draft.goalDistribution.byCanal}
                items={canalItems}
                onChange={d => updateGlobalDistribution('byCanal', d)}
                onValidChange={setCanalDistValid}
              />
            </div>
          </div>
        )}

        {/* ─── Tab: Vigencias ─────────────────────────────────── */}
        {activeTab === 'vigencias' && (
          <div className="settings-tab-content" key="vigencias">
            <div className="panel">
              <div className="section-title" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span className="section-icon"><IconCalendarRange /></span> Vigencias {selectedYear}
                <div className="year-pills" style={{ marginLeft: '12px' }}>
                  {(draft.years || [selectedYear]).map(y => (
                    <button
                      key={y}
                      className={`year-pill ${y === selectedYear ? 'active' : ''}`}
                      onClick={() => onChangeYear(y)}
                    >
                      {y}
                    </button>
                  ))}
                  {addingYear ? (
                    <input
                      type="number"
                      className="year-add-input"
                      value={newYearInput}
                      autoFocus
                      onBlur={() => { setAddingYear(false); setNewYearInput('') }}
                      onChange={e => setNewYearInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const n = parseInt(newYearInput)
                          const result = addYear(n, draft.years || [selectedYear])
                          if (result) {
                            setDraft(prev => ({ ...prev, years: result }))
                            onChangeYear(n)
                            setSaved(false)
                          }
                          setAddingYear(false)
                          setNewYearInput('')
                        } else if (e.key === 'Escape') {
                          setAddingYear(false)
                          setNewYearInput('')
                        }
                      }}
                    />
                  ) : (
                    <button
                      className="year-add-btn"
                      onClick={() => setAddingYear(true)}
                      title="Agregar año"
                    >
                      <IconPlus size={12} />
                    </button>
                  )}
                </div>
              </div>
              <p className="settings-desc">
                Las fechas se ajustan a día hábil por vigencia. Los meses sin cambios usan las fechas del backend.
              </p>

              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '110px' }}>Vigencia</th>
                    <th style={{ textAlign: 'left' }}>Desde</th>
                    <th style={{ textAlign: 'left' }}>Hasta</th>
                    <th style={{ textAlign: 'left', width: '90px' }}>Objetivo</th>
                    <th style={{ textAlign: 'center', width: '44px' }} title="Distribución">Dist.</th>
                    <th style={{ textAlign: 'center', width: '44px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {vigenciasForSettings.map(v => {
                    const vKey = vigenciaKey({ year: selectedYear, month: v.month })
                    const override = draft.vigenciaOverrides[vKey]
                    const hasOverride = !!override
                    const hasDistribution = !!override?.distribution?.byCategoria?.enabled || !!override?.distribution?.byCanal?.enabled

                    return (
                      <tr key={vKey} className={hasOverride ? 'vigencia-row-overridden' : ''}>
                        <td style={{ fontWeight: 600 }}>{v.name}</td>
                        <td style={{ textAlign: 'left' }}>
                          <input
                            type="date"
                            className="filter-input"
                            value={override?.from || v.from}
                            onChange={e => updateVigenciaOverride(vKey, { from: e.target.value }, v)}
                          />
                        </td>
                        <td style={{ textAlign: 'left' }}>
                          <input
                            type="date"
                            className="filter-input"
                            value={override?.to || v.to}
                            onChange={e => updateVigenciaOverride(vKey, { to: e.target.value }, v)}
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
                              const val = parseInt(e.target.value)
                              updateVigenciaOverride(
                                vKey,
                                { goalLeads: isNaN(val) ? undefined : val },
                                v,
                              )
                            }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className={`distrib-btn ${hasDistribution ? 'has-override' : ''}`}
                            onClick={() => setDistribModalVKey(vKey)}
                            title={hasDistribution ? 'Distribución personalizada' : 'Configurar distribución'}
                            style={{ padding: '4px 8px', minWidth: 0 }}
                          >
                            {hasDistribution ? <span className="distrib-dot" /> : <IconTarget size={12} />}
                          </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {hasOverride && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center' }}
                              onClick={() => resetVigenciaOverride(vKey)}
                            >
                              <IconReset size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Tab: Exclusiones ────────────────────────────────── */}
        {activeTab === 'exclusiones' && (
          <div className="settings-tab-content" key="exclusiones">
            <div className="panel">
              <div className="section-title">
                <span className="section-icon"><IconShield /></span> Exclusiones
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
                      {excludedSaving ? 'Guardando...' : excludedSaved
                        ? <span className="saved-confirmation"><IconCheck size={14} /> Guardado</span>
                        : 'Guardar Exclusiones'}
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

                      const sortOwners = (arr: Array<[string, string]>) =>
                        arr.sort(([aId, aName], [bId, bName]) => {
                          const aE = excludedIds.includes(aId) ? 0 : 1
                          const bE = excludedIds.includes(bId) ? 0 : 1
                          if (aE !== bE) return aE - bE
                          return aName.localeCompare(bName)
                        })

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
          </div>
        )}

        {/* ─── Sticky Save Bar (Objetivos + Vigencias tabs) ───── */}
        {activeTab !== 'exclusiones' && (
          <div className="settings-save-bar">
            {!canSave && (
              <span style={{ color: 'var(--accent-red)', fontSize: '0.82rem', alignSelf: 'center', marginRight: 'auto' }}>
                La distribución debe sumar 100% para poder guardar
              </span>
            )}
            <button className="btn-secondary" onClick={onBack}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={!canSave}>
              {saved
                ? <span className="saved-confirmation"><IconCheck size={14} /> Guardado</span>
                : 'Guardar Configuración'}
            </button>
          </div>
        )}
      </div>

      {/* ─── Distribution Modal ──────────────────────────────── */}
      {distribModalVKey && distribModalVigencia && (
        <DistributionModal
          vigenciaLabel={distribModalVigencia.name}
          byCategoria={draft.vigenciaOverrides[distribModalVKey]?.distribution?.byCategoria}
          byCanal={draft.vigenciaOverrides[distribModalVKey]?.distribution?.byCanal}
          globalByCategoria={draft.goalDistribution.byCategoria}
          globalByCanal={draft.goalDistribution.byCanal}
          categoryItems={categoryItems}
          canalItems={canalItems}
          onSave={handleDistribModalSave}
          onClose={() => setDistribModalVKey(null)}
        />
      )}
    </div>
  )
}
