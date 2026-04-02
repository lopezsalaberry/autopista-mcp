/**
 * DistributionModal — Per-vigencia distribution override modal.
 * Allows users to customize category/channel goal allocation for a specific vigencia,
 * or inherit from the global default.
 *
 * Accessibility: Escape key, backdrop click, focus trapping, role="dialog", aria-modal.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { GoalDistribution } from '../types'
import { IconX } from './Icons'
import { GoalDistributionPanel } from './GoalDistributionPanel'

interface Props {
  vigenciaLabel: string
  byCategoria?: GoalDistribution
  byCanal?: GoalDistribution
  globalByCategoria?: GoalDistribution
  globalByCanal?: GoalDistribution
  categoryItems: string[]
  canalItems: string[]
  onSave: (result: { byCategoria?: GoalDistribution; byCanal?: GoalDistribution }) => void
  onClose: () => void
}

export function DistributionModal({
  vigenciaLabel,
  byCategoria,
  byCanal,
  globalByCategoria,
  globalByCanal,
  categoryItems,
  canalItems,
  onSave,
  onClose,
}: Props) {
  const [mode, setMode] = useState<'inherit' | 'custom'>(
    byCategoria || byCanal ? 'custom' : 'inherit',
  )
  const [draftCat, setDraftCat] = useState<GoalDistribution | undefined>(
    byCategoria ?? globalByCategoria,
  )
  const [draftCanal, setDraftCanal] = useState<GoalDistribution | undefined>(
    byCanal ?? globalByCanal,
  )
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Focus trap: focus the panel on mount
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const handleSave = useCallback(() => {
    if (mode === 'inherit') {
      onSave({})  // Clear overrides → inherit from global
    } else {
      onSave({
        byCategoria: draftCat,
        byCanal: draftCanal,
      })
    }
  }, [mode, draftCat, draftCanal, onSave])

  return (
    <div
      className="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Distribución — ${vigenciaLabel}`}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2>Distribución — {vigenciaLabel}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <IconX size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-radio-group">
            <label className="modal-radio">
              <input
                type="radio"
                name="distrib-mode"
                checked={mode === 'inherit'}
                onChange={() => setMode('inherit')}
              />
              Heredar distribución global
            </label>
            <label className="modal-radio">
              <input
                type="radio"
                name="distrib-mode"
                checked={mode === 'custom'}
                onChange={() => setMode('custom')}
              />
              Personalizar para esta vigencia
            </label>
          </div>

          {mode === 'custom' && (
            <>
              {categoryItems.length > 0 && (
                <GoalDistributionPanel
                  label="Distribución por Categoría"
                  distribution={draftCat}
                  items={categoryItems}
                  onChange={setDraftCat}
                />
              )}
              {canalItems.length > 0 && (
                <GoalDistributionPanel
                  label="Distribución por Canal"
                  distribution={draftCanal}
                  items={canalItems}
                  onChange={setDraftCanal}
                />
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}
