/**
 * The console strip — trust gates, warnings, unsupported files, model issues
 * as dense terminal-style lines (DESIGN.md v2 §Screen anatomy 4). Every line
 * that carries a remedy shows it as the real CLI string in a CopyChip.
 */
import * as React from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui'
import type { ConsoleLine } from '@/lib/derive'
import { cn, plural } from '@/lib/util'
import { CopyChip } from '@/map/Drawer'

function Row({ line }: { line: ConsoleLine }) {
  const action = line.severity === 'action'
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-1">
      <span aria-hidden="true" className={cn('w-3 shrink-0 text-center font-mono text-data font-semibold', action ? 'text-status-conflict' : 'text-muted')}>
        {action ? '!' : '·'}
      </span>
      {action ? <span className="sr-only">needs action:</span> : null}
      <span className="w-[6.5rem] shrink-0 whitespace-nowrap font-mono text-micro text-muted">{line.kind}</span>
      <span className={cn('min-w-0 flex-1 break-words font-mono text-data', action ? 'text-ink' : 'text-muted')}>
        {line.text}
      </span>
      {line.command ? <CopyChip command={line.command} className="shrink-0" /> : null}
    </li>
  )
}

export function Console({ lines }: { lines: ConsoleLine[] }) {
  const actions = lines.filter((l) => l.severity === 'action').length
  // Expanded by default whenever anything needs action; a user toggle wins
  // until the action count changes state (poll can surface a new gate).
  const [userOpen, setUserOpen] = React.useState<boolean | null>(null)
  const open = userOpen ?? actions > 0

  if (lines.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setUserOpen}>
      <section className="mh-frame mt-1 p-2 pt-3" aria-label="console">
        <span className="mh-frame-title">console</span>
        <CollapsibleTrigger
          className={cn(
            'flex w-full items-center gap-2 rounded-[4px] px-2 py-1 text-left',
            'hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          )}
        >
          <span aria-hidden="true" className="font-mono text-micro text-muted">
            {open ? '▾' : '▸'}
          </span>
          <span className="font-mono text-micro text-muted">
            console · {plural(lines.length, 'note')}
            {actions > 0 && <span className="text-status-conflict"> · {actions} need{actions === 1 ? 's' : ''} action</span>}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mh-rise">
          <ul className="mt-1 border-t border-line pt-1">
            {lines.map((line) => (
              <Row key={line.key} line={line} />
            ))}
          </ul>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
