/**
 * What the user clicked on the map. The Drawer renders exactly one of these;
 * the map components only ever *produce* them.
 */
import type { ConflictItem } from '@/types'
import type { LaneArrow, TargetFile, TargetPanel } from '@/lib/derive'

export type Selection =
  | { type: 'sourceItem'; category: string; name: string }
  | { type: 'file'; target: string; file: TargetFile }
  | { type: 'arrow'; arrow: LaneArrow }
  | { type: 'conflict'; conflict: ConflictItem }
  | { type: 'ghost'; panel: TargetPanel }

export function selectionTitle(sel: Selection): string {
  switch (sel.type) {
    case 'sourceItem':
      return `${sel.category} / ${sel.name}`
    case 'file':
      return sel.file.path
    case 'arrow':
      return sel.arrow.name
    case 'conflict':
      return `${sel.conflict.category} / ${sel.conflict.name}`
    case 'ghost':
      return sel.panel.target
  }
}
