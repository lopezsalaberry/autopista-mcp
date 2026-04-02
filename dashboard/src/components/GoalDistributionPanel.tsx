/**
 * GoalDistributionPanel — Reusable slider panel for distributing goal percentages
 * across categories or channels. Validates that allocations sum to 100%.
 *
 * Used in both global settings (GoalDistribution default) and per-vigencia modal overrides.
 */

import { useState, useCallback, useEffect } from 'react'
import type { GoalDistribution } from '../types'
import { IconCheck } from './Icons'

interface Props {
  label: string  // e.g. "Distribución por Categoría"
  distribution: GoalDistribution | undefined
  items: string[]  // list of category/channel names
  onChange: (d: GoalDistribution) => void
  onValidChange?: (valid: boolean) => void  // notify parent of sum validity
}

export function GoalDistributionPanel({ label, distribution, items, onChange, onValidChange }: Props) {
  const enabled = distribution?.enabled ?? false
  const allocations = distribution?.allocations ?? {}

  const [localAllocations, setLocalAllocations] = useState<Record<string, number>>(() => {
    if (Object.keys(allocations).length > 0) return { ...allocations }
    // Auto-populate with equal distribution
    const equal = Math.floor(100 / items.length)
    const result: Record<string, number> = {}
    items.forEach((item, i) => {
      result[item] = i === 0 ? 100 - equal * (items.length - 1) : equal
    })
    return result
  })

  const sum = items.reduce((s, item) => s + (localAllocations[item] ?? 0), 0)
  const isValid = sum === 100

  // Notify parent of validity changes
  useEffect(() => {
    onValidChange?.(enabled ? isValid : true)
  }, [enabled, isValid, onValidChange])

  const handleToggle = useCallback(() => {
    if (enabled) {
      onChange({ enabled: false, allocations: {} })
    } else {
      onChange({ enabled: true, allocations: localAllocations })
    }
  }, [enabled, localAllocations, onChange])

  const handleSliderChange = useCallback((item: string, value: number) => {
    const next = { ...localAllocations, [item]: value }
    setLocalAllocations(next)
    if (enabled) {
      onChange({ enabled: true, allocations: next })
    }
  }, [enabled, localAllocations, onChange])

  return (
    <div className="distribution-panel">
      <div className="distribution-header">
        <label className="distribution-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleToggle}
          />
          {label}
        </label>
        {enabled && (
          <span className={`distribution-sum ${isValid ? 'valid' : 'invalid'}`}>
            {sum}% {isValid ? <IconCheck size={14} /> : `(${sum > 100 ? '+' : ''}${sum - 100})`}
          </span>
        )}
      </div>

      {enabled && (
        <div className="distribution-rows">
          {items.map(item => (
            <div key={item} className="distribution-row">
              <span className="distribution-row-label">{item}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={localAllocations[item] ?? 0}
                onChange={e => handleSliderChange(item, parseInt(e.target.value))}
              />
              <input
                type="number"
                className="distribution-row-input"
                min={0}
                max={100}
                value={localAllocations[item] ?? 0}
                onChange={e => handleSliderChange(item, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              />
              <span className="distribution-row-value">{localAllocations[item] ?? 0}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
