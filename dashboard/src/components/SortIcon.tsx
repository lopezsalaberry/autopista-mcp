/**
 * SortIcon — Visual indicator for sortable table column direction.
 */

import type { SortDir } from '../types'

export function SortIcon({ active, dir }: { active: boolean; dir?: SortDir }) {
  if (!active) return <span className="sort-icon sort-icon-inactive">⇅</span>
  return <span className="sort-icon sort-icon-active">{dir === 'asc' ? '↑' : '↓'}</span>
}
