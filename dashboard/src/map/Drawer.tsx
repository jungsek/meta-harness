/**
 * The detail drawer — a right-side slide-over on the shared Dialog. Renders
 * exactly one Selection (src/map/selection.ts); every remedy it shows is the
 * real CLI string in a click-to-copy chip (DESIGN.md preservation rule 5).
 */
import * as React from 'react'
import type { ModelItem, Snapshot } from '@/types'
import type { LaneArrow, SyncMapModel, TargetFile, TargetPanel } from '@/lib/derive'
import { selectionTitle, type Selection } from '@/map/selection'
import { Dialog, DialogPanel, ScrollPane } from '@/components/ui'
import { DiffPane, JsonBlock, KeyValue, Mono, StatusPill } from '@/components/chrome'
import { cn } from '@/lib/util'

/* -------------------------------------------------------------------------- */
/* CopyChip — every command on the map goes through this one component.        */
/* -------------------------------------------------------------------------- */

export function CopyChip({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<number>(undefined)
  React.useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(command).then(() => {
          setCopied(true)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => setCopied(false), 1500)
        })
      }}
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-control bg-raised px-2 py-1 text-left',
        'transition-colors duration-fast ease-out-quart hover:bg-line/60',
        className,
      )}
    >
      <code translate="no" className="truncate font-mono text-micro text-ink">
        {command}
      </code>
      <span aria-live="polite" className={cn('shrink-0 font-mono text-micro', copied ? 'text-status-clean' : 'text-muted')}>
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Per-selection bodies.                                                       */
/* -------------------------------------------------------------------------- */

function findModelItem(snap: Snapshot, category: string, name: string): ModelItem | null {
  const m = snap.model
  if (!m) return null
  const list = category === 'rules' ? m.rules : category === 'agents' ? m.agents : category === 'commands' ? m.commands : null
  return list?.find((i) => i.name === name) ?? null
}

/** Non-markdown categories: the config blob the item names, if we hold it. */
function findSourceBlob(snap: Snapshot, category: string, name: string): unknown {
  const m = snap.model
  if (!m) return undefined
  switch (category) {
    case 'connections':
      return m.mcp?.servers[name]
    case 'hooks':
      return m.hooks?.find((h) => h.event === name)?.entries
    case 'env':
      // The wire flattens env to the plain var map (server reshapeModel).
      return (m.env ?? {})[name]
    case 'permissions':
      return m.permissions
    case 'settings':
      return name === 'claude.settings' ? m.settings.claude : m.settings.codex
    default:
      return undefined
  }
}

function reachLabel(reach: string[]): string {
  return reach.includes('*') ? '* (every enabled target)' : reach.join(', ')
}

function SourceItemBody({ snap, model, category, name }: { snap: Snapshot; model: SyncMapModel; category: string; name: string }) {
  const item = findModelItem(snap, category, name)
  const summary = model.source.categories.find((c) => c.category === category)?.items.find((i) => i.name === name)
  const blob = item ? undefined : findSourceBlob(snap, category, name)
  const description = item?.description ?? summary?.description
  const reach = item?.targets ?? summary?.reach ?? ['*']
  return (
    <div className="space-y-4">
      {description ? <p className="text-body text-muted">{description}</p> : null}
      <KeyValue
        items={[
          { key: 'reach', value: <Mono>{reachLabel(reach)}</Mono> },
          ...(item ? [{ key: 'file', value: <Mono>{item.file}</Mono> }] : []),
        ]}
      />
      {item && Object.keys(item.fm).length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-label text-muted">frontmatter</p>
          <JsonBlock value={item.fm} />
        </div>
      ) : null}
      {item ? (
        <div className="space-y-1.5">
          <p className="text-label text-muted">body</p>
          <ScrollPane className="max-h-80 rounded-control border border-line">
            <pre translate="no" className="whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-data leading-relaxed text-ink">
              {item.body || '(empty)'}
            </pre>
          </ScrollPane>
        </div>
      ) : blob !== undefined ? (
        <JsonBlock value={blob} />
      ) : null}
    </div>
  )
}

function FileBody({ target, file }: { target: string; file: TargetFile }) {
  return (
    <div className="space-y-4">
      <KeyValue
        items={[
          { key: 'path', value: <Mono>{file.path}</Mono> },
          { key: 'state', value: <StatusPill kind={file.state} label={file.word} /> },
          { key: 'target', value: <Mono>{target}</Mono> },
          { key: 'category', value: <Mono>{file.category ?? '—'}</Mono> },
        ]}
      />
      {file.state === 'changed' ? (
        <div className="space-y-1.5">
          <p className="text-body text-muted">Edited natively — the next sync folds your edit back into the source.</p>
          <CopyChip command="meta-harness sync" />
        </div>
      ) : file.state === 'missing' ? (
        <div className="space-y-1.5">
          <p className="text-body text-muted">A managed file is absent from disk — regenerate it.</p>
          <CopyChip command="meta-harness generate" />
        </div>
      ) : (
        <p className="text-body text-muted">Matches the manifest — nothing to do.</p>
      )}
    </div>
  )
}

function ArrowBody({ arrow }: { arrow: LaneArrow }) {
  return (
    <div className="space-y-4">
      <p className="text-body text-muted">
        {arrow.direction === 'import'
          ? 'Import — a native change folding back into the source.'
          : 'Generate — will be written on the next sync.'}{' '}
        {arrow.meaning}
      </p>
      <KeyValue
        items={[
          { key: 'item', value: <Mono>{arrow.name}</Mono> },
          { key: 'category', value: <Mono>{arrow.category}</Mono> },
          { key: 'target', value: <Mono>{arrow.target}</Mono> },
          { key: 'status', value: <StatusPill kind={arrow.status} /> },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <CopyChip command="meta-harness sync" />
        <CopyChip command="meta-harness sync --dry-run" />
      </div>
      <p className="text-label text-muted">
        <Mono className="text-micro">--dry-run</Mono> previews the plan without writing anything.
      </p>
    </div>
  )
}

function ConflictBody({ selection }: { selection: Extract<Selection, { type: 'conflict' }> }) {
  const c = selection.conflict
  return (
    <div className="space-y-4">
      <KeyValue
        items={[
          { key: 'target', value: <Mono>{c.target}</Mono> },
          { key: 'status', value: <StatusPill kind="conflict" /> },
          ...(c.detail ? [{ key: 'detail', value: <span className="text-body text-muted">{c.detail}</span> }] : []),
        ]}
      />
      {c.fatal ? (
        <p className="text-body text-status-conflict">
          Fatal — importing either side would lose data, so sync writes nothing for this item until it is resolved by hand.
          <span className="text-muted"> --prefer cannot settle a fatal conflict; edit the file itself.</span>
        </p>
      ) : null}
      <DiffPane source={c.source} native={c.native} />
      {!c.fatal ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <CopyChip command="meta-harness sync --prefer source" />
          <CopyChip command="meta-harness sync --prefer native" />
        </div>
      ) : null}
    </div>
  )
}

function GhostBody({ panel }: { panel: TargetPanel }) {
  const det = panel.detection
  return (
    <div className="space-y-4">
      <p className="text-body text-muted">Detected but not enabled — sync writes nothing here until you turn it on.</p>
      {det ? (
        <KeyValue
          items={[
            {
              key: 'repo signals',
              value: det.repo.length ? <Mono>{det.repo.join(', ')}</Mono> : <span className="text-muted">none</span>,
            },
            { key: 'bin on PATH', value: det.bin ? <Mono>{det.bin}</Mono> : <span className="text-muted">not found</span> },
            {
              key: 'supports',
              value: det.supports.length ? <Mono>{det.supports.join(', ')}</Mono> : <span className="text-muted">—</span>,
            },
          ]}
        />
      ) : null}
      <div className="space-y-1.5">
        <p className="text-label text-muted">enable for one run</p>
        <CopyChip command={`meta-harness sync --targets ${panel.target}`} />
      </div>
      <div className="space-y-1.5">
        <p className="text-label text-muted">
          or permanently, in <Mono className="text-micro">meta-harness.jsonc</Mono>
        </p>
        <CopyChip command={`"targets": ["claude", "codex", "${panel.target}"]`} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* The drawer.                                                                 */
/* -------------------------------------------------------------------------- */

const SUBTITLE: Record<Selection['type'], string> = {
  sourceItem: 'source item',
  file: 'generated file',
  arrow: 'sync flow',
  conflict: 'conflict — both sides changed',
  ghost: 'disabled target',
}

export function Drawer({
  selection,
  snapshot,
  model,
  onClose,
}: {
  selection: Selection | null
  snapshot: Snapshot
  model: SyncMapModel
  onClose: () => void
}) {
  return (
    <Dialog
      open={selection !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {selection ? (
        <DialogPanel
          title={<Mono className="text-h3 font-semibold">{selectionTitle(selection)}</Mono>}
          description={SUBTITLE[selection.type]}
          className={cn(
            // Re-seat the shared centered panel as a right-side slide-over.
            'left-auto right-0 top-0 h-full max-h-none translate-x-0 translate-y-0',
            selection.type === 'conflict' ? 'w-[min(64rem,100vw)]' : 'w-[min(34rem,100vw)]',
            'rounded-none border-y-0 border-r-0',
          )}
        >
          {selection.type === 'sourceItem' ? (
            <SourceItemBody snap={snapshot} model={model} category={selection.category} name={selection.name} />
          ) : selection.type === 'file' ? (
            <FileBody target={selection.target} file={selection.file} />
          ) : selection.type === 'arrow' ? (
            <ArrowBody arrow={selection.arrow} />
          ) : selection.type === 'conflict' ? (
            <ConflictBody selection={selection} />
          ) : (
            <GhostBody panel={selection.panel} />
          )}
        </DialogPanel>
      ) : null}
    </Dialog>
  )
}
