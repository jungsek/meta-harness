/**
 * App shell — top bar, section rail, section view.
 *
 * The rail is a Radix Tabs list, not a hand-rolled `role="tablist"`: roving
 * tabindex and arrow-key movement are exactly the defects automated checks
 * cannot see. Section and root live in the URL hash so a teammate can be sent
 * straight to the conflict.
 *
 * Polling contract: `/api/status` on an interval and on focus; `/api/snapshot`
 * only on load, on a root change, and on an explicit Re-scan.
 */
import * as React from 'react'
import { BookOpen, Check, FolderTree, Gauge, GitCompare, LayoutGrid, RefreshCw, FileText } from 'lucide-react'
import type { DriftReport, Reference as ReferenceDoc, RootEntry, Snapshot, StatusRow } from '@/types'
import { fetchReference, fetchRoots, fetchSnapshot, fetchStatus, type Origin } from '@/lib/api'
import { useHashState, useMediaQuery, useNow, usePoll } from '@/lib/hooks'
import { basename, cn, formatClock, formatElapsed, plural } from '@/lib/util'
import { AnimatedNumber, Button, Command, EmptyState, Mono, Panel, SkeletonRows, StatusPill, Table, Th } from '@/components/chrome'
import { Popover, PopoverPanel, PopoverTrigger, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipProvider } from '@/components/ui'
import { Overview } from '@/sections/Overview'
import { buildRows, Source } from '@/sections/Source'
import { Targets } from '@/sections/Targets'
import { Sync } from '@/sections/Sync'
import { Drift } from '@/sections/Drift'
import { Reference } from '@/sections/Reference'

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'source', label: 'Source', icon: FileText },
  { id: 'targets', label: 'Targets', icon: LayoutGrid },
  { id: 'sync', label: 'Sync', icon: RefreshCw },
  { id: 'drift', label: 'Drift & conflicts', icon: GitCompare },
  { id: 'reference', label: 'Reference', icon: BookOpen },
] as const

const POLL_MS = 5000

export default function App() {
  const [hash, setHash] = useHashState()
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null)
  const [reference, setReference] = React.useState<ReferenceDoc | null>(null)
  const [roots, setRoots] = React.useState<RootEntry[]>([])
  const [status, setStatus] = React.useState<StatusRow[]>([])
  const [drift, setDrift] = React.useState<DriftReport | null>(null)
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null)
  const [origin, setOrigin] = React.useState<Origin>('live')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [rescanning, setRescanning] = React.useState(false)
  const [announcement, setAnnouncement] = React.useState('')

  const root = hash.root
  const now = useNow(5000)
  const wide = useMediaQuery('(min-width: 900px)')
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
      const [ref, rts] = await Promise.all([fetchReference(), fetchRoots()])
      if (cancelled) return
      if (ref.data) setReference(ref.data)
      if (rts.data) setRoots(rts.data.roots)
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

  const section = SECTIONS.some((s) => s.id === hash.section) ? hash.section : 'overview'
  const setSection = React.useCallback((next: string) => setHash({ section: next }), [setHash])

  const counts: Record<string, number | null> = {
    overview: null,
    // The row count the Source table actually shows, so the rail badge and the
    // section header never disagree.
    source: snapshot?.model ? buildRows(snapshot.model, snapshot.sourceDir).length : null,
    targets: snapshot ? snapshot.detection.filter((d) => d.enabled).length : null,
    sync: status.length || null,
    drift: (snapshot?.plan?.conflicts.length ?? 0) + (drift?.drifted.length ?? 0) || null,
    reference: null,
  }

  const currentRoot = snapshot?.root ?? root ?? '—'

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={400}>
      <div className="min-h-dvh bg-bg">
        <a
          href="#section-view"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[var(--z-toast)] focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-label focus:text-primary-ink"
        >
          Skip to section
        </a>

        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        <Tabs
          value={section}
          onValueChange={setSection}
          orientation={wide ? 'vertical' : 'horizontal'}
          className="flex min-h-dvh flex-col"
        >
          <TopBar
            root={currentRoot}
            roots={roots}
            selectedRoot={root}
            onSelectRoot={(next) => setHash({ root: next })}
            mode={snapshot?.plan?.mode ?? null}
            configured={snapshot?.configured ?? false}
            origin={origin}
            updatedAt={updatedAt}
            now={now}
            rescanning={rescanning}
            onRescan={() => void loadSnapshot('rescan')}
          />

          <div className="flex flex-1 flex-col min-[900px]:flex-row">
            <TabsList
              aria-label="Dashboard sections"
              className={cn(
                'flex shrink-0 gap-1 border-line bg-surface',
                'overflow-x-auto border-b px-2 py-2',
                'min-[900px]:sticky min-[900px]:top-[3.25rem] min-[900px]:h-[calc(100dvh-3.25rem)] min-[900px]:w-58 min-[900px]:flex-col min-[900px]:overflow-y-auto min-[900px]:border-b-0 min-[900px]:border-r min-[900px]:px-3 min-[900px]:py-4',
              )}
            >
              {SECTIONS.map((s) => {
                const Icon = s.icon
                const count = counts[s.id]
                return (
                  <TabsTrigger
                    key={s.id}
                    value={s.id}
                    className={cn(
                      'group flex shrink-0 items-center gap-2 rounded-control px-2.5 py-1.5 text-label font-medium text-muted',
                      'transition-colors duration-fast ease-out-quart hover:bg-raised hover:text-ink',
                      'data-[state=active]:bg-primary-soft data-[state=active]:text-primary',
                      'min-[900px]:w-full min-[900px]:justify-start',
                    )}
                  >
                    <Icon size={15} aria-hidden className="shrink-0" />
                    <span className="whitespace-nowrap">{s.label}</span>
                    {typeof count === 'number' ? (
                      <span className="ml-auto hidden rounded-[4px] bg-raised px-1.5 py-0.5 text-micro tabular-nums text-muted group-data-[state=active]:bg-bg min-[900px]:inline">
                        <AnimatedNumber value={count} />
                      </span>
                    ) : null}
                  </TabsTrigger>
                )
              })}
            </TabsList>

            {/* tabIndex -1 so the skip link moves focus, not just scroll. */}
            <main id="section-view" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 min-[640px]:px-6 min-[900px]:py-8">
              <div className="mx-auto w-full max-w-[1280px]">
                {error ? <ErrorPanel error={error} root={currentRoot} /> : null}
                {loading ? <LoadingView /> : null}
                {!loading && snapshot ? (
                  <>
                    <TabsContent value="overview">
                      <Overview snapshot={snapshot} onNavigate={setSection} />
                    </TabsContent>
                    <TabsContent value="source">
                      <Source snapshot={snapshot} />
                    </TabsContent>
                    <TabsContent value="targets">
                      <Targets snapshot={snapshot} />
                    </TabsContent>
                    <TabsContent value="sync">
                      <Sync snapshot={snapshot} status={status} />
                    </TabsContent>
                    <TabsContent value="drift">
                      <Drift snapshot={snapshot} status={status} drift={drift ?? snapshot.drift} />
                    </TabsContent>
                    <TabsContent value="reference">
                      <Reference reference={reference} />
                    </TabsContent>
                  </>
                ) : null}
                {!loading && !snapshot && !error ? (
                  <Panel bleed>
                    <EmptyState
                      title="No snapshot"
                      body="The API answered, but returned nothing to render for this root."
                      command="meta-harness status"
                    />
                  </Panel>
                ) : null}
              </div>
            </main>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

function TopBar({
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
    <header className="sticky top-0 z-[var(--z-sticky)] flex min-h-13 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2 min-[640px]:px-6">
      <span className="text-label font-semibold tracking-[-0.006em] text-ink">meta-harness</span>

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
                        active ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-raised',
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
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                live ? 'mh-breathe bg-status-clean' : 'bg-status-missing',
              )}
            />
            <span className={live ? 'text-status-clean' : 'text-status-missing'}>{live ? 'live' : 'sample data'}</span>
            {updatedAt ? (
              <span className="hidden text-muted min-[640px]:inline" title={formatClock(updatedAt)}>
                · {formatElapsed(updatedAt, now)}
              </span>
            ) : null}
          </span>
        </Tooltip>

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
            Check the server with <Command>npm run dev:api</Command>.
          </p>
        </div>
      </Panel>
    </div>
  )
}

/** Skeleton rows matching the real row metrics — never a spinner in content. */
function LoadingView() {
  return (
    <div className="space-y-6">
      <div>
        <span className="mh-breathe block h-8 w-56 rounded-control bg-raised" />
        <span className="mh-breathe mt-2 block h-4 w-[28rem] max-w-full rounded-control bg-raised" />
      </div>
      <Panel title="Reading the harness…" bleed>
        <Table>
          <thead>
            <tr>
              <Th className="w-[7.5rem]">State</Th>
              <Th>What</Th>
              <Th className="w-[16rem]">Where</Th>
              <Th className="w-[15rem]">Remedy</Th>
            </tr>
          </thead>
          <SkeletonRows rows={5} cols={4} />
        </Table>
      </Panel>
    </div>
  )
}
