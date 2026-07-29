/**
 * App shell — v2 "the sync map" (DESIGN.md v2).
 *
 * One screen: prompt bar → verdict → the map → console strip. No section
 * rail; detail lives in the Drawer. The polling contract is unchanged:
 * `/api/status` on an interval and on focus; `/api/snapshot` only on load,
 * on a root change, and on an explicit Re-scan.
 */
import * as React from 'react'
import { Check, FolderTree, RefreshCw } from 'lucide-react'
import type { RootEntry, Snapshot, StatusRow, DriftReport } from '@/types'
import { fetchRoots, fetchSnapshot, fetchStatus, type Origin } from '@/lib/api'
import { deriveSyncMap } from '@/lib/derive'
import { useHashState, useNow, usePoll } from '@/lib/hooks'
import { basename, cn, formatClock, formatElapsed, plural } from '@/lib/util'
import { Button, Mono, Panel, StatusPill } from '@/components/chrome'
import { Popover, PopoverPanel, PopoverTrigger, Tooltip, TooltipProvider } from '@/components/ui'
import { SyncMap } from '@/map/SyncMap'
import { Drawer } from '@/map/Drawer'
import { Console } from '@/map/Console'
import { Help } from '@/map/Help'
import type { Selection } from '@/map/selection'

const POLL_MS = 5000

export default function App() {
  const [hash, setHash] = useHashState()
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null)
  const [roots, setRoots] = React.useState<RootEntry[]>([])
  const [status, setStatus] = React.useState<StatusRow[]>([])
  const [drift, setDrift] = React.useState<DriftReport | null>(null)
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null)
  const [origin, setOrigin] = React.useState<Origin>('live')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [rescanning, setRescanning] = React.useState(false)
  const [announcement, setAnnouncement] = React.useState('')
  const [selection, setSelection] = React.useState<Selection | null>(null)

  const root = hash.root
  const now = useNow(5000)
  const lastSignature = React.useRef<string | null>(null)

  const loadSnapshot = React.useCallback(
    async (mode: 'initial' | 'rescan') => {
      if (mode === 'initial') setLoading(true)
      else setRescanning(true)
      const res = await fetchSnapshot(root)
      setOrigin(res.origin)
      setError(res.error)
      if (res.data) {
        setSnapshot(res.data)
        setStatus(res.data.status)
        setDrift(res.data.drift)
        setUpdatedAt(res.data.generatedAt)
      }
      setLoading(false)
      setRescanning(false)
    },
    [root],
  )

  React.useEffect(() => {
    void loadSnapshot('initial')
  }, [loadSnapshot])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const rts = await fetchRoots()
      if (!cancelled && rts.data) setRoots(rts.data.roots)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // The cheap poll. Never /api/snapshot.
  const poll = React.useCallback(async () => {
    const res = await fetchStatus(root)
    setOrigin(res.origin)
    if (res.error) {
      setError(res.error)
      return
    }
    if (!res.data) return
    setError(null)
    setStatus(res.data.status)
    setDrift(res.data.drift)
    setUpdatedAt(res.data.generatedAt)
  }, [root])

  usePoll(() => void poll(), POLL_MS, !loading)

  // Announce only when the state actually moved — a poll must not re-announce
  // on every tick (PRODUCT.md, accessibility).
  React.useEffect(() => {
    if (!drift) return
    const edited = status.filter((s) => s.state === 'EDITED').length
    const missing = status.filter((s) => s.state === 'MISSING').length
    const signature = `${status.length}:${edited}:${missing}:${drift.drifted.length}`
    if (lastSignature.current === signature) return
    const first = lastSignature.current === null
    lastSignature.current = signature
    if (first) return
    setAnnouncement(
      `Harness state changed: ${plural(status.length, 'managed file')}, ${edited} changed, ${missing} missing, ${drift.drifted.length} drifted.`,
    )
  }, [status, drift])

  // The map re-derives from the freshest polled status/drift, not only from
  // the last full snapshot — a native edit shows up within one poll tick.
  const model = React.useMemo(() => {
    if (!snapshot) return null
    return deriveSyncMap({ ...snapshot, status, drift: drift ?? snapshot.drift })
  }, [snapshot, status, drift])

  const currentRoot = snapshot?.root ?? root ?? '—'

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={400}>
      <div className="min-h-dvh bg-bg">
        <a
          href="#map-view"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[var(--z-toast)] focus:rounded-control focus:bg-accent focus:px-3 focus:py-2 focus:text-label focus:text-bg"
        >
          Skip to map
        </a>

        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        <PromptBar
          root={currentRoot}
          roots={roots}
          selectedRoot={root}
          onSelectRoot={(next) => setHash({ root: next })}
          mode={model?.mode ?? null}
          configured={snapshot?.configured ?? false}
          origin={origin}
          updatedAt={updatedAt}
          now={now}
          rescanning={rescanning}
          onRescan={() => void loadSnapshot('rescan')}
        />

        <main id="map-view" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 py-5 min-[640px]:px-6">
          {error ? <ErrorPanel error={error} root={currentRoot} /> : null}
          {loading ? <LoadingView /> : null}
          {!loading && model && snapshot ? (
            <div className="flex flex-col gap-5">
              <VerdictLine model={model} rescanning={rescanning} />
              <SyncMap model={model} onSelect={setSelection} />
              <Console lines={model.console} />
              <Drawer selection={selection} snapshot={snapshot} model={model} onClose={() => setSelection(null)} />
            </div>
          ) : null}
          {!loading && !model && !error ? (
            <Panel title="No snapshot" bleed>
              <p className="px-4 py-4 text-body text-muted">
                The API answered, but returned nothing to render for this root. Try{' '}
                <Mono className="text-ink">meta-harness status</Mono>.
              </p>
            </Panel>
          ) : null}
        </main>
      </div>
    </TooltipProvider>
  )
}

/**
 * The one sentence the product exists to say, rendered like the CLI would
 * say it: prompt caret, verdict, then the remedy as a real command.
 */
function VerdictLine({ model, rescanning }: { model: ReturnType<typeof deriveSyncMap>; rescanning: boolean }) {
  const { verdict } = model
  const tone =
    verdict.tone === 'ok'
      ? 'text-status-clean'
      : verdict.tone === 'conflict'
        ? 'text-status-conflict'
        : verdict.tone === 'error'
          ? 'text-status-conflict'
          : 'text-ink'
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span aria-hidden="true" className={cn('mh-caret font-mono text-verdict font-semibold', rescanning && 'mh-breathe')}>
        ❯
      </span>
      <h1 className={cn('font-mono text-verdict font-semibold [text-wrap:balance]', tone)}>{verdict.text}</h1>
      {verdict.command ? (
        <Mono className="rounded-[4px] bg-raised px-2 py-1 text-data text-accent">{verdict.command}</Mono>
      ) : null}
    </div>
  )
}

function PromptBar({
  root,
  roots,
  selectedRoot,
  onSelectRoot,
  mode,
  configured,
  origin,
  updatedAt,
  now,
  rescanning,
  onRescan,
}: {
  root: string
  roots: RootEntry[]
  selectedRoot: string | null
  onSelectRoot: (root: string | null) => void
  mode: string | null
  configured: boolean
  origin: Origin
  updatedAt: string | null
  now: number
  rescanning: boolean
  onRescan: () => void
}) {
  const live = origin === 'live'
  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex min-h-13 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel px-4 py-2 min-[640px]:px-6">
      <span className="font-mono text-label font-semibold text-ink">
        <span aria-hidden="true" className="mh-caret">
          ❯{' '}
        </span>
        meta-harness
      </span>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-1.5 rounded-control border border-line bg-bg px-2 py-1 text-label text-ink transition-colors duration-fast ease-out-quart hover:bg-raised"
          >
            <FolderTree size={14} aria-hidden className="shrink-0 text-muted" />
            <span className="truncate font-mono">{basename(root)}</span>
            <span className="sr-only">— change root, currently {root}</span>
          </button>
        </PopoverTrigger>
        <PopoverPanel>
          <p className="px-2 py-1.5 text-micro text-muted">Roots the server can read</p>
          <ul>
            {roots.length === 0 ? (
              <li className="px-2 py-1.5 text-label text-muted">Only the server’s own root is available.</li>
            ) : (
              roots.map((entry) => {
                const active = entry.path === root || entry.path === selectedRoot
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => onSelectRoot(entry.path)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-control px-2 py-1.5 text-left transition-colors duration-fast ease-out-quart',
                        active ? 'bg-raised text-accent' : 'text-ink hover:bg-raised',
                      )}
                    >
                      <Check size={14} aria-hidden className={cn('mt-0.5 shrink-0', active ? 'opacity-100' : 'opacity-0')} />
                      <span className="min-w-0">
                        <span className="block text-label font-medium">{entry.label}</span>
                        <span className="block break-all font-mono text-micro text-muted">{entry.path}</span>
                      </span>
                      {!entry.configured ? (
                        <span className="ml-auto shrink-0">
                          <StatusPill kind="missing" label="no config" explain={false} />
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </PopoverPanel>
      </Popover>

      {mode ? (
        <Tooltip
          label={
            mode === 'bootstrap'
              ? 'Bootstrap: the source directory is being populated from native config found in the repo.'
              : 'Reconcile: the source directory is the authority and native files are compared against it.'
          }
        >
          <span className="cursor-help rounded-control bg-raised px-1.5 py-0.5 font-mono text-micro text-ink">{mode}</span>
        </Tooltip>
      ) : configured ? null : (
        <StatusPill kind="missing" label="not configured" />
      )}

      <div className="ml-auto flex items-center gap-3">
        <Tooltip
          label={
            live
              ? 'Connected to the local API. Status is re-read every 5 seconds and on window focus.'
              : 'The API server is not answering, so this page is showing bundled sample data. Start it with npm run dev:api.'
          }
        >
          <span className="inline-flex cursor-help items-center gap-1.5 text-micro">
            <span
              aria-hidden
              className={cn('size-1.5 shrink-0 rounded-full', live ? 'mh-breathe bg-status-clean' : 'bg-status-missing')}
            />
            <span className={live ? 'text-status-clean' : 'text-status-missing'}>{live ? 'live' : 'sample data'}</span>
            {updatedAt ? (
              <span className="hidden text-muted min-[640px]:inline" title={formatClock(updatedAt)}>
                · {formatElapsed(updatedAt, now)}
              </span>
            ) : null}
          </span>
        </Tooltip>

        <Help />

        <Button variant="secondary" onClick={onRescan} disabled={rescanning} loading={rescanning} className="text-micro">
          <RefreshCw size={13} aria-hidden />
          {rescanning ? 'Re-scanning…' : 'Re-scan'}
        </Button>
      </div>
    </header>
  )
}

function ErrorPanel({ error, root }: { error: string; root: string }) {
  return (
    <div className="mb-6">
      <Panel title="The server refused this root" bleed>
        <div className="space-y-2 px-4 py-4">
          <StatusPill kind="conflict" label="error" />
          <p className="max-w-[72ch] text-body text-ink">{error}</p>
          <p className="max-w-[72ch] text-label text-muted">
            Root: <Mono className="break-all">{root}</Mono>. A root must be an absolute path to an existing directory.
            Check the server with <Mono className="text-ink">npm run dev:api</Mono>.
          </p>
        </div>
      </Panel>
    </div>
  )
}

/** Skeletons in the map's own shape — never a spinner parked in content. */
function LoadingView() {
  return (
    <div className="flex flex-col gap-5" aria-label="Reading the harness…">
      <span className="mh-breathe block h-8 w-[32rem] max-w-full rounded-control bg-raised" />
      <div className="grid grid-cols-[1fr_56px_1.35fr_56px_1fr] items-start gap-0 max-[1080px]:grid-cols-1 max-[1080px]:gap-2">
        <span className="mh-breathe block h-56 rounded-[4px] bg-raised" />
        <span className="hidden min-[1081px]:block" />
        <span className="mh-breathe block h-72 rounded-[4px] bg-raised" />
        <span className="hidden min-[1081px]:block" />
        <span className="mh-breathe block h-56 rounded-[4px] bg-raised" />
      </div>
    </div>
  )
}
