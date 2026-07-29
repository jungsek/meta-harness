/**
 * The sync map — the whole product on one screen (DESIGN.md v2).
 * Topology: target panel · lane · SOURCE · lane · target panel.
 * Imports flow inward, generates flow outward, conflicts sit in the lane.
 * All interpretation happens in lib/derive.ts; this file only draws.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Mono, StatusPill } from '@/components/chrome'
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Tooltip } from '@/components/ui'
import type { Lane, LaneArrow, SourceCategory, SyncMapModel, TargetPanel } from '@/lib/derive'
import { useMediaQuery } from '@/lib/hooks'
import { cn, plural, resolve } from '@/lib/util'
import { BrandTitle, brandOf } from '@/map/brand'
import type { Selection } from '@/map/selection'

const ARROW_CAP = 9

interface SelectProps {
  onSelect: (sel: Selection) => void
}

/* ------------------------------------------------------------------ frame */

function Frame({
  title,
  variant,
  className,
  children,
}: {
  title: React.ReactNode
  variant?: 'source' | 'ghost'
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'mh-frame',
        variant === 'source' && 'mh-frame-source',
        variant === 'ghost' && 'mh-frame-ghost',
        className,
      )}
    >
      <span className="mh-frame-title">{title}</span>
      {children}
    </section>
  )
}

/* ----------------------------------------------------------- lane arrows */

/**
 * One arrow row. `toward` is where the SOURCE column is relative to this
 * lane — imports always point toward it, generates away from it.
 */
function Arrow({
  arrow,
  toward,
  vertical,
  index,
  onSelect,
}: {
  arrow: LaneArrow
  toward: 'left' | 'right'
  vertical: boolean
  index: number
  onSelect: (sel: Selection) => void
}) {
  const meta = resolve(arrow.status)
  const inward = arrow.direction === 'import'
  const pointsLeft = (toward === 'left') === inward
  const label = `${arrow.direction === 'import' ? 'import' : 'generate'} · ${arrow.name} — ${arrow.meaning}`
  const line = vertical ? { x1: 12, y1: 4, x2: 12, y2: 36 } : { x1: 4, y1: 12, x2: 44, y2: 12 }
  // Stacked layout: toward='left' means the source panel renders BELOW this
  // lane, so an inward (import) arrow points down; toward='right' mirrors.
  const head = vertical
    ? (toward === 'left') === inward
      ? 'M8 30 L12 36 L16 30'
      : 'M8 10 L12 4 L16 10'
    : pointsLeft
      ? 'M12 6 L4 12 L12 18'
      : 'M36 6 L44 12 L36 18'
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={() => onSelect({ type: 'arrow', arrow })}
        className={cn(
          'group flex items-center justify-center rounded-[4px] px-0.5 py-0',
          'hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        )}
      >
        <svg
          width={vertical ? 24 : 48}
          height={vertical ? 40 : 24}
          viewBox={vertical ? '0 0 24 40' : '0 0 48 24'}
          fill="none"
          aria-hidden="true"
        >
          {/* Raw :root vars — the @theme inline --color-* names never reach the DOM. */}
          <g stroke={`var(--status-${arrow.status})`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line
              {...line}
              className="mh-lane-arrow"
              style={{ ['--mh-dash' as string]: 48, ['--mh-delay' as string]: `${Math.min(index, 8) * 40}ms` }}
            />
            <path d={head} fill="none" />
          </g>
        </svg>
        <span className="sr-only">{meta.word}</span>
      </button>
    </Tooltip>
  )
}

function LaneCol({
  lane,
  toward,
  vertical,
  onSelect,
}: {
  lane: Lane
  toward: 'left' | 'right'
  vertical: boolean
  onSelect: (sel: Selection) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? lane.arrows : lane.arrows.slice(0, ARROW_CAP)
  const hidden = lane.arrows.length - rows.length
  const idle = lane.arrows.length === 0 && lane.conflicts.length === 0
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-1',
        vertical ? 'min-h-10 flex-row flex-wrap py-1' : 'flex-col py-6',
      )}
      role="group"
      aria-label={`${lane.target} lane: ${lane.importCount} imports, ${lane.generateCount} generates, ${lane.conflicts.length} conflicts`}
    >
      {(lane.importCount > 0 || lane.generateCount > 0) && (
        <Mono className={cn('text-micro text-muted', vertical ? 'mr-1' : 'mb-1')}>
          {lane.importCount > 0 && `${lane.importCount}⇢src`}
          {lane.importCount > 0 && lane.generateCount > 0 && ' · '}
          {lane.generateCount > 0 && `src⇢${lane.generateCount}`}
        </Mono>
      )}
      {lane.conflicts.map((c) => (
        <Tooltip key={c.key} label={`conflict · ${c.conflict.category}/${c.conflict.name} — both sides changed`}>
          <button
            type="button"
            aria-label={`conflict: ${c.conflict.category} ${c.conflict.name}`}
            onClick={() => onSelect({ type: 'conflict', conflict: c.conflict })}
            className={cn(
              'flex size-6 items-center justify-center rounded-full font-mono text-micro font-semibold',
              'bg-status-conflict-soft text-status-conflict',
              'hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            )}
          >
            !
          </button>
        </Tooltip>
      ))}
      {rows.map((a, i) => (
        <Arrow key={a.key} arrow={a} toward={toward} vertical={vertical} index={i} onSelect={onSelect} />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="font-mono text-micro text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          +{hidden}
        </button>
      )}
      {idle && (
        <span aria-hidden="true" className="font-mono text-micro text-muted opacity-60">
          ·
        </span>
      )}
    </div>
  )
}

/* --------------------------------------------------------- source column */

function SourceCategoryRow({
  cat,
  onSelect,
  onTrace,
}: { cat: SourceCategory; onTrace?: (cat: string | null) => void } & SelectProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onTrace?.(next ? cat.category : null)
      }}
    >
      <CollapsibleTrigger
        aria-controls={id}
        data-conn={cat.category}
        onMouseEnter={() => onTrace?.(cat.category)}
        onMouseLeave={() => !open && onTrace?.(null)}
        onFocus={() => onTrace?.(cat.category)}
        onBlur={() => !open && onTrace?.(null)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-[4px] px-2 py-1.5',
          'hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
        )}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="font-mono text-micro text-muted">
            {open ? '▾' : '▸'}
          </span>
          <Mono className="text-data text-ink">{cat.category}</Mono>
        </span>
        <Mono className="text-micro text-muted">{cat.count}</Mono>
      </CollapsibleTrigger>
      <CollapsibleContent id={id} className="mh-rise">
        <ul className="mb-1 ml-6 border-l border-line pl-3">
          {cat.items.map((item) => (
            <li key={item.name}>
              <button
                type="button"
                onClick={() => onSelect({ type: 'sourceItem', category: cat.category, name: item.name })}
                className={cn(
                  'flex w-full items-baseline justify-between gap-3 rounded-[4px] px-1.5 py-1 text-left',
                  'hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
                )}
              >
                <Mono className="truncate text-data text-ink">{item.name}</Mono>
                <Mono className="shrink-0 text-micro text-muted">{item.reach.join(' ')}</Mono>
              </button>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Shared outputs are one physical write read by EVERY target, so they live on
 * the source panel itself rather than in any single lane — a lane placement
 * would either double-count them or pin them to an arbitrary target.
 */
function SharedStrip({ model, onSelect }: { model: SyncMapModel } & SelectProps) {
  const { shared } = model
  if (shared.files.length === 0 && shared.generates.length === 0 && shared.conflicts.length === 0) return null
  const pendingPaths = new Set(shared.generates.map((g) => g.path))
  return (
    <div className="mt-3 border-t border-line px-2 pt-2">
      <Mono className="text-micro text-muted">shared · one write, read by every target</Mono>
      <ul className="mt-1">
        {shared.conflicts.map((c) => (
          <li key={`${c.category}:${c.name}`}>
            <button
              type="button"
              onClick={() => onSelect({ type: 'conflict', conflict: c })}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-[4px] px-1.5 py-1 text-left',
                'hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
              )}
            >
              <Mono className="truncate text-data text-ink">{c.name}</Mono>
              <StatusPill kind="conflict" />
            </button>
          </li>
        ))}
        {shared.files.map((file) => {
          const pending = pendingPaths.has(file.path)
          return (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => onSelect({ type: 'file', target: 'shared', file })}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-[4px] px-1.5 py-1 text-left',
                  'hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
                )}
              >
                <Mono className="truncate text-data text-ink">{file.path}</Mono>
                {pending ? <StatusPill kind="pending" explain={false} /> : <StatusPill kind={file.state} label={file.word} explain={false} />}
              </button>
            </li>
          )
        })}
        {shared.generates
          .filter((g) => !shared.files.some((f) => f.path === g.path))
          .map((g) => (
            <li key={g.path} className="flex items-center justify-between gap-2 px-1.5 py-1">
              <Mono className="truncate text-data text-ink">{g.path}</Mono>
              <StatusPill kind="pending" explain={false} />
            </li>
          ))}
      </ul>
    </div>
  )
}

function SourceColumn({
  model,
  onSelect,
  onTrace,
}: { model: SyncMapModel; onTrace?: (cat: string | null) => void } & SelectProps) {
  const { source } = model
  return (
    <Frame title={<BrandTitle target="source" suffix={source.dir} />} variant="source" className="p-4 pt-5">
      <p className="mb-2 px-2 text-label text-muted">
        source of truth · {plural(source.total, 'item')}
      </p>
      {source.exists ? (
        <>
          <div className="flex flex-col gap-0.5">
            {source.categories.map((cat) => (
              <SourceCategoryRow key={cat.category} cat={cat} onSelect={onSelect} onTrace={onTrace} />
            ))}
          </div>
          <SharedStrip model={model} onSelect={onSelect} />
        </>
      ) : (
        <div className="px-2 py-6 text-center">
          <p className="text-body text-ink">Nothing here yet.</p>
          <p className="mx-auto mt-2 max-w-[36ch] text-body text-muted">
            One command reads the native config this repo already has and builds the source of truth from it.
          </p>
          <Mono className="mt-3 inline-block rounded-[4px] bg-raised px-2 py-1 text-data text-accent">
            npx @jungsek/meta-harness sync
          </Mono>
        </div>
      )}
    </Frame>
  )
}

/* --------------------------------------------------------- target panels */

function TargetColumn({ panel, onSelect }: { panel: TargetPanel } & SelectProps) {
  return (
    <Frame title={<BrandTitle target={panel.target} />} className="p-3 pt-4">
      <p className="mb-2 px-1 text-label text-muted">
        native config · {plural(panel.fileCount, 'file')}
        {panel.attention > 0 && (
          <span className="text-status-changed"> · {panel.attention} need attention</span>
        )}
      </p>
      {panel.groups.length === 0 ? (
        <p className="px-1 pb-2 text-body text-muted">No generated files yet — they appear after the first sync.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {panel.groups.map((group) => (
            <div key={group.category}>
              {/* plain span: Mono strips unknown props, and the connector overlay needs this data attribute in the DOM */}
              <span data-conn-target={`${panel.target}:${group.category}`} className="block px-1 font-mono text-micro text-muted">
                {group.category}
              </span>
              <ul>
                {group.files.map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() => onSelect({ type: 'file', target: panel.target, file })}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-[4px] px-1.5 py-1 text-left',
                        'hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                      )}
                    >
                      <Mono className={cn('truncate text-data', file.drifted || file.state === 'missing' ? 'text-status-conflict' : 'text-ink')}>
                        {file.path}
                      </Mono>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {file.drifted ? (
                          <span className="rounded-[4px] bg-status-conflict-soft px-1.5 py-0.5 font-mono text-micro font-medium text-status-conflict">
                            diff
                          </span>
                        ) : null}
                        <StatusPill kind={file.state} label={file.word} explain={false} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Frame>
  )
}

function GhostPanel({ panel, onSelect }: { panel: TargetPanel } & SelectProps) {
  return (
    <Frame title={panel.target} variant="ghost" className="p-3 pt-4">
      <p className="px-1 text-label text-muted">
        detected, not enabled
        {panel.detection?.bin && <Mono className="text-micro"> · {panel.detection.bin} on PATH</Mono>}
      </p>
      <button
        type="button"
        onClick={() => onSelect({ type: 'ghost', panel })}
        className={cn(
          'mt-1.5 rounded-[4px] bg-raised px-2 py-1 font-mono text-micro text-muted',
          'hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        )}
      >
        meta-harness sync --targets {panel.target}
      </button>
    </Frame>
  )
}

/* ------------------------------------------------------------ connectors */

interface Wire {
  key: string
  d: string
  color: string
}

/**
 * Category-mapping wires: hover (or expand) a source category and lines are
 * drawn from that row to the same category group in each target panel, in the
 * target's brand color. Pointer-events none; purely explanatory.
 */
function Connectors({ container, activeCat }: { container: React.RefObject<HTMLDivElement | null>; activeCat: string | null }) {
  const [wires, setWires] = useState<Wire[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = container.current
    if (!el || !activeCat) {
      setWires([])
      return
    }
    const compute = () => {
      const base = el.getBoundingClientRect()
      setSize({ w: base.width, h: base.height })
      const from = el.querySelector<HTMLElement>(`[data-conn="${activeCat}"]`)
      if (!from) {
        setWires([])
        return
      }
      const f = from.getBoundingClientRect()
      const next: Wire[] = []
      for (const to of el.querySelectorAll<HTMLElement>('[data-conn-target]')) {
        const [target, cat] = (to.dataset.connTarget ?? '').split(':')
        if (cat !== activeCat || !target) continue
        const t = to.getBoundingClientRect()
        const leftward = t.left < f.left
        const x1 = (leftward ? f.left : f.right) - base.left
        const y1 = f.top + f.height / 2 - base.top
        const x2 = (leftward ? t.right : t.left) - base.left
        const y2 = t.top + t.height / 2 - base.top
        const dx = (x2 - x1) / 2
        next.push({
          key: `${target}:${cat}`,
          d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
          color: brandOf(target).color,
        })
      }
      setWires(next)
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [container, activeCat])

  if (wires.length === 0) return null
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[var(--z-dropdown)]"
      width={size.w}
      height={size.h}
      fill="none"
    >
      {wires.map((w) => (
        <g key={w.key} className="mh-fade">
          <path d={w.d} stroke={w.color} strokeWidth="1.5" opacity="0.8" />
          <circle cx={w.d.split(' ')[1]} cy={w.d.split(' ')[2]} r="2.5" fill={w.color} />
        </g>
      ))}
    </svg>
  )
}

/* ----------------------------------------------------------------- glyphs */

const GLYPH_KEY: { kind: Parameters<typeof resolve>[0]; hint: string }[] = [
  { kind: 'clean', hint: 'matches the source' },
  { kind: 'pending', hint: 'written on next sync' },
  { kind: 'new', hint: 'imported into the source' },
  { kind: 'changed', hint: 'edited natively' },
  { kind: 'conflict', hint: 'both sides changed' },
  { kind: 'missing', hint: 'managed file absent' },
]

export function GlyphKey() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-micro text-muted">
      {GLYPH_KEY.map(({ kind, hint }) => {
        const meta = resolve(kind)
        return (
          <span key={kind} className="inline-flex items-baseline gap-1.5">
            <span aria-hidden="true" className="font-mono" style={{ color: `var(--status-${kind})` }}>
              {meta.glyph}
            </span>
            <span className="font-mono">{meta.word}</span>
            <span>— {hint}</span>
          </span>
        )
      })}
    </p>
  )
}

/* ------------------------------------------------------------------- map */

export function SyncMap({ model, onSelect }: { model: SyncMapModel } & SelectProps) {
  const stacked = useMediaQuery('(max-width: 1080px)')
  const [left, right, ...rest] = model.panels
  const laneFor = (t?: string): Lane =>
    (t && model.lanes.get(t)) || { target: t ?? '', arrows: [], conflicts: [], importCount: 0, generateCount: 0 }

  // Overflow targets (3+ enabled) stack under the map rather than breaking it.
  const overflow = useMemo(() => rest ?? [], [rest])

  // Category-trace wires (desktop only — the stacked layout has no gap to draw in).
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [activeCat, setActiveCat] = useState<string | null>(null)
  useEffect(() => {
    if (stacked) setActiveCat(null)
  }, [stacked])

  if (stacked) {
    return (
      <div className="flex flex-col gap-2">
        {left && <TargetColumn panel={left} onSelect={onSelect} />}
        {left && <LaneCol lane={laneFor(left.target)} toward="left" vertical onSelect={onSelect} />}
        <SourceColumn model={model} onSelect={onSelect} />
        {right && <LaneCol lane={laneFor(right.target)} toward="right" vertical onSelect={onSelect} />}
        {right && <TargetColumn panel={right} onSelect={onSelect} />}
        {overflow.map((p) => (
          <div key={p.target} className="flex flex-col gap-2">
            <LaneCol lane={laneFor(p.target)} toward="right" vertical onSelect={onSelect} />
            <TargetColumn panel={p} onSelect={onSelect} />
          </div>
        ))}
        {model.ghosts.length > 0 && (
          <div className="flex flex-col gap-2">
            {model.ghosts.map((p) => (
              <GhostPanel key={p.target} panel={p} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="relative grid grid-cols-[1fr_56px_1.35fr_56px_1fr] items-start gap-0">
        <Connectors container={containerRef} activeCat={activeCat} />
        {left ? <TargetColumn panel={left} onSelect={onSelect} /> : <div />}
        <LaneCol lane={laneFor(left?.target)} toward="right" vertical={false} onSelect={onSelect} />
        <SourceColumn model={model} onSelect={onSelect} onTrace={setActiveCat} />
        <LaneCol lane={laneFor(right?.target)} toward="left" vertical={false} onSelect={onSelect} />
        {right ? <TargetColumn panel={right} onSelect={onSelect} /> : <div />}
      </div>
      {overflow.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {overflow.map((p) => (
            <div key={p.target} className="flex flex-col gap-1">
              <LaneCol lane={laneFor(p.target)} toward="right" vertical onSelect={onSelect} />
              <TargetColumn panel={p} onSelect={onSelect} />
            </div>
          ))}
        </div>
      )}
      {model.ghosts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {model.ghosts.map((p) => (
            <GhostPanel key={p.target} panel={p} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}
