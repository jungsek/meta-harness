/**
 * The verdict header — "what is the state and what do I do", as the page
 * headline rather than a boxed sibling of the map. The map is the main
 * surface; this is one sentence above it, with the detail lines (needs
 * action / notes) folded behind a single disclosure.
 */
import * as React from 'react'
import type { ConsoleLine, SyncMapModel } from '@/lib/derive'
import { cn } from '@/lib/util'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui'
import { CopyChip } from '@/map/Drawer'

function Row({ line }: { line: ConsoleLine }) {
  const action = line.severity === 'action'
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-1.5">
      <span
        aria-hidden="true"
        className={cn('w-3 shrink-0 text-center font-mono text-data font-semibold', action ? 'text-status-conflict' : 'text-muted')}
      >
        {action ? '!' : '·'}
      </span>
      {action ? <span className="sr-only">needs action:</span> : null}
      <span className="w-[6.5rem] shrink-0 whitespace-nowrap font-mono text-micro text-muted">{line.kind}</span>
      <span className={cn('min-w-0 flex-1 break-words font-mono text-data', action ? 'text-ink' : 'text-muted')}>{line.text}</span>
      {line.command ? <CopyChip command={line.command} className="shrink-0" /> : null}
    </li>
  )
}

export function Insights({ model, rescanning }: { model: SyncMapModel; rescanning: boolean }) {
  const { verdict } = model
  const actions = model.console.filter((l) => l.severity === 'action')
  const notes = model.console.filter((l) => l.severity !== 'action')
  const [open, setOpen] = React.useState(actions.length > 0)
  // A poll can surface the first action after mount — pull the details open once.
  const sawActions = React.useRef(actions.length > 0)
  React.useEffect(() => {
    if (actions.length > 0 && !sawActions.current) {
      sawActions.current = true
      setOpen(true)
    }
  }, [actions.length])

  const tone =
    verdict.tone === 'ok' ? 'text-status-clean' : verdict.tone === 'action' ? 'text-ink' : 'text-status-conflict'

  return (
    <section aria-label="status and next steps">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-1">
        <span aria-hidden="true" className={cn('mh-caret font-mono text-verdict font-semibold', rescanning && 'mh-breathe')}>
          ❯
        </span>
        <h1 className={cn('min-w-0 font-mono text-verdict font-semibold [text-wrap:balance]', tone)}>{verdict.text}</h1>
        {verdict.command ? <CopyChip command={verdict.command} className="text-data" /> : null}
      </div>

      {model.console.length > 0 ? (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-1 pl-1">
          <CollapsibleTrigger
            className={cn(
              'flex items-center gap-2 rounded-[4px] px-2 py-1 font-mono text-micro text-muted',
              'hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            )}
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
            {actions.length > 0 ? (
              <span>
                <span className="text-status-conflict">{actions.length} need action</span>
                {notes.length > 0 && ` · ${notes.length} notes`}
              </span>
            ) : (
              <span>{notes.length} notes</span>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="mh-rise">
            <ul className="ml-2 divide-y divide-line/50 border-l border-line pl-1">
              {[...actions, ...notes].map((line) => (
                <Row key={line.key} line={line} />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  )
}
