/**
 * SortIcon — SVG chevron icons for sortable table headers.
 * Replaces Unicode ⇅, ↑, ↓ with consistent SVGs.
 */

import type { SortDir } from '../types'
import { IconSortDefault, IconSortAsc, IconSortDesc } from './Icons'

export function SortIcon({ active, dir }: { active: boolean; dir?: SortDir }) {
  if (!active) return <span className="sort-icon sort-icon-inactive"><IconSortDefault /></span>
  return (
    <span className="sort-icon sort-icon-active">
      {dir === 'asc' ? <IconSortAsc /> : <IconSortDesc />}
    </span>
  )
}
