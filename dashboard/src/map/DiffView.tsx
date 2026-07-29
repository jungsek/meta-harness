/**
 * Real content diff for a drifted/EDITED/MISSING file — expected-from-source
 * vs on-disk, GitHub-style, fed by `GET /api/diff`. No sample fallback on
 * purpose: a fabricated diff would be worse than none.
 */
import * as React from 'react'
import { CopyChip } from '@/map/Drawer'
import { cn } from '@/lib/util'

// TODO(sync): dedupe with types.ts once the API lane lands its append.
type DiffRow = { type: 'ctx' | 'add' | 'del' | 'skip'; a?: number | null; b?: number | null; text?: string; count?: number }
type FileDiff = {
  path: string
  kind: 'text' | 'symlink' | 'missing' | 'binary'
  identical: boolean
  rows: DiffRow[]
  expectedLabel: string
  actualLabel: string
}

type State =
  | { phase: 'loading' }
  | { phase: 'sample' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; diff: FileDiff }

/* Opaque grounds, same technique as the status pill softs (never alpha —
   an alpha ground composites differently on every row it lands on). */
const DEL_BG = 'color-mix(in oklab, var(--status-conflict) 12%, var(--panel))'
const ADD_BG = 'color-mix(in oklab, var(--status-clean) 12%, var(--panel))'

const KIND_NOTE: Partial<Record<FileDiff['kind'], string>> = {
  symlink: 'symlink — the link target differs from what the manifest expects; no line diff to show.',
  missing: 'file absent on disk — every line below would be created',
  binary: 'binary content differs',
}

export function DiffView({ path, root }: { path: string; root: string | null }) {
  const [state, setState] = React.useState<State>({ phase: 'loading' })

  React.useEffect(() => {
    const ctrl = new AbortController()
    // Abort cancels the fetch, but res.json() can still resolve after cleanup
    // on a path/root switch — every set goes through this guard.
    const set = (next: State) => {
      if (!ctrl.signal.aborted) setState(next)
    }
    setState({ phase: 'loading' })
    const url = `/api/diff?path=${encodeURIComponent(path)}${root ? `&root=${encodeURIComponent(root)}` : ''}`
    void (async () => {
      let res: Response
      try {
        res = await fetch(url, { headers: { accept: 'application/json' }, signal: ctrl.signal })
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) set({ phase: 'sample' })
        return
      }
      // Same heuristic as lib/api.ts: 404 or HTML = the bridge is not up.
      const contentType = res.headers.get('content-type') ?? ''
      if (res.status === 404 || !contentType.includes('json')) {
        set({ phase: 'sample' })
        return
      }
      let body: unknown
      try {
        body = await res.json()
      } catch {
        set({ phase: 'sample' })
        return
      }
      if (!res.ok) {
        const message =
          typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `HTTP ${res.status}`
        set({ phase: 'error', message })
        return
      }
      set({ phase: 'ready', diff: body as FileDiff })
    })()
    return () => ctrl.abort()
  }, [path, root])

  if (state.phase === 'loading') {
    return (
      <div aria-hidden className="space-y-1.5 rounded-control border border-line px-3 py-2.5">
        <span className="mh-breathe block h-3 w-3/5 rounded-[3px] bg-raised" />
        <span className="mh-breathe block h-3 w-2/5 rounded-[3px] bg-raised" />
      </div>
    )
  }
  if (state.phase === 'sample') {
    return (
      <p className="text-label text-muted">
        live API required for content diff — <code className="font-mono text-micro">npm run dev:api</code>
      </p>
    )
  }
  if (state.phase === 'error') {
    return <p className="text-label text-status-conflict">{state.message}</p>
  }

  const { diff } = state
  const note = KIND_NOTE[diff.kind]
  const showTable = (diff.kind === 'text' || diff.kind === 'missing') && diff.rows.length > 0

  return (
    <div className="overflow-hidden rounded-control border border-line">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line bg-raised px-3 py-1.5">
        <span translate="no" className="font-mono text-micro">
          <span className="text-status-conflict">{diff.expectedLabel}</span>
          <span className="text-muted"> vs </span>
          <span className="text-status-clean">{diff.actualLabel}</span>
        </span>
        <CopyChip command="meta-harness sync" />
      </div>
      {note ? <p className="px-3 py-2 text-label text-muted">{note}</p> : null}
      {diff.identical && !note ? <p className="px-3 py-2 text-label text-muted">contents identical — nothing to show.</p> : null}
      {showTable ? (
        <div className="max-h-96 overflow-auto">
          <table aria-label={`content diff for ${diff.path}`} className="w-full border-collapse font-mono text-data leading-relaxed">
            <tbody>
              {diff.rows.map((row, i) =>
                row.type === 'skip' ? (
                  <tr key={i}>
                    <td colSpan={4} className="select-none px-3 py-1 text-center text-micro text-muted">
                      ⋯ {row.count ?? 0} unchanged lines
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={i}
                    style={row.type === 'del' ? { background: DEL_BG } : row.type === 'add' ? { background: ADD_BG } : undefined}
                  >
                    <td className="w-8 select-none pl-2 pr-1 text-right text-micro tabular-nums text-muted">{row.a ?? ''}</td>
                    <td className="w-8 select-none pl-1 pr-2 text-right text-micro tabular-nums text-muted">{row.b ?? ''}</td>
                    <td
                      aria-hidden
                      className={cn(
                        'w-4 select-none pr-1 text-center',
                        row.type === 'del' ? 'text-status-conflict' : row.type === 'add' ? 'text-status-clean' : 'text-muted',
                      )}
                    >
                      {row.type === 'del' ? '-' : row.type === 'add' ? '+' : ' '}
                    </td>
                    <td translate="no" className="whitespace-pre pr-3 text-ink">
                      {row.type === 'del' ? <span className="sr-only">removed: </span> : null}
                      {row.type === 'add' ? <span className="sr-only">added: </span> : null}
                      {row.text ?? ''}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
