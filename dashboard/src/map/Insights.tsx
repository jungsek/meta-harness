/**
 * The insights panel — ONE surface for "what is the state and what do I do":
 * the computed verdict sentence as its header, then the detail lines behind
 * two tabs (needs action / notes). Replaces the separate verdict line +
 * console strip, which read as two disconnected components.
 */
import * as React from 'react'
import type { ConsoleLine, SyncMapModel } from '@/lib/derive'
import { cn } from '@/lib/util'
import { SegmentedList, SegmentedTrigger, Tabs, TabsContent } from '@/components/ui'
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

function Lines({ lines, empty }: { lines: ConsoleLine[]; empty: string }) {
  if (lines.length === 0) return <p className="px-2 py-2 text-label text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-line/50">
      {lines.map((line) => (
        <Row key={line.key} line={line} />
      ))}
    </ul>
  )
}

export function Insights({ model, rescanning }: { model: SyncMapModel; rescanning: boolean }) {
  const { verdict } = model
  const actions = model.console.filter((l) => l.severity === 'action')
  const notes = model.console.filter((l) => l.severity !== 'action')
  const [tab, setTab] = React.useState(actions.length > 0 ? 'actions' : 'notes')
  // A poll can surface the first action after mount — pull the tab over once.
  const sawActions = React.useRef(actions.length > 0)
  React.useEffect(() => {
    if (actions.length > 0 && !sawActions.current) {
      sawActions.current = true
      setTab('actions')
    }
  }, [actions.length])

  const tone =
    verdict.tone === 'ok' ? 'text-status-clean' : verdict.tone === 'action' ? 'text-ink' : 'text-status-conflict'

  return (
    <section className="mh-frame p-3 pt-4" aria-label="status and next steps">
      <span className="mh-frame-title">status</span>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-2 pb-1">
        <span aria-hidden="true" className={cn('mh-caret font-mono text-verdict font-semibold', rescanning && 'mh-breathe')}>
          ❯
        </span>
        <h1 className={cn('min-w-0 font-mono text-verdict font-semibold [text-wrap:balance]', tone)}>{verdict.text}</h1>
        {verdict.command ? <CopyChip command={verdict.command} className="text-data" /> : null}
      </div>

      {model.console.length > 0 ? (
        <Tabs value={tab} onValueChange={setTab} className="mt-2 border-t border-line/70 pt-2">
          <SegmentedList aria-label="detail" className="mx-2">
            <SegmentedTrigger value="actions" className="font-mono text-micro">
              needs action
              {actions.length > 0 ? <span className="ml-1.5 text-status-conflict">{actions.length}</span> : null}
            </SegmentedTrigger>
            <SegmentedTrigger value="notes" className="font-mono text-micro">
              notes
              {notes.length > 0 ? <span className="ml-1.5 text-muted">{notes.length}</span> : null}
            </SegmentedTrigger>
          </SegmentedList>
          <TabsContent value="actions" className="mt-1">
            <Lines lines={actions} empty="Nothing needs your hand." />
          </TabsContent>
          <TabsContent value="notes" className="mt-1">
            <Lines lines={notes} empty="No notes right now." />
          </TabsContent>
        </Tabs>
      ) : null}
    </section>
  )
}
