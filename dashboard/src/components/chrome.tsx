/**
 * Bespoke chrome. None of these are ARIA interaction patterns — they are
 * presentation, where the minimal-code ladder wins over a registry dependency
 * (DESIGN.md §Components). Anything with roving focus, a focus trap, or
 * hover-intent lives in ./ui.tsx instead.
 */
import * as React from 'react'
import type { StatusKind } from '@/types'
import { cn, pretty, resolve, type ResolvedStatus } from '@/lib/util'
import { Tooltip } from '@/components/ui'

/* -------------------------------------------------------------------------- */
/* Status pill — color + glyph + word, always all three.                       */
/* -------------------------------------------------------------------------- */

export function StatusPill({
  status,
  kind,
  label,
  className,
  explain = true,
}: {
  status?: ResolvedStatus
  kind?: StatusKind
  label?: string
  className?: string
  explain?: boolean
}) {
  const s = status ?? resolve(kind ?? 'missing', label)
  const pill = (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-control px-1.5 py-0.5 text-micro font-medium',
        s.soft,
        s.text,
        explain && 'cursor-help',
        className,
      )}
    >
      <span aria-hidden className="font-mono text-[0.8em] leading-none">
        {s.glyph}
      </span>
      <span className="truncate">{label ?? s.word}</span>
    </span>
  )
  if (!explain) return pill
  return <Tooltip label={s.means}>{pill}</Tooltip>
}

/* -------------------------------------------------------------------------- */
/* Buttons — default · hover · focus-visible · active · disabled · loading.    */
/* -------------------------------------------------------------------------- */

const BUTTON_VARIANTS = {
  primary:
    'bg-primary text-primary-ink hover:bg-primary/90 active:bg-primary/80 disabled:bg-primary/40 disabled:text-primary-ink',
  secondary: 'border border-line bg-bg text-ink hover:bg-raised active:bg-line/60',
  quiet: 'text-muted hover:bg-raised hover:text-ink active:bg-line/60',
} as const

export function Button({
  variant = 'secondary',
  loading = false,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> & { variant?: keyof typeof BUTTON_VARIANTS; loading?: boolean }) {
  return (
    <button
      type="button"
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-control px-2.5 py-1.5 text-label font-medium',
        'transition-colors duration-fast ease-out-quart',
        'disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Panels + section headers.                                                   */
/* -------------------------------------------------------------------------- */

export function Panel({
  title,
  description,
  actions,
  bleed = false,
  className,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Table panels sit flush to the border; prose panels get padding. */
  bleed?: boolean
  className?: string
  children: React.ReactNode
}) {
  const headingId = React.useId()
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn('overflow-hidden rounded-panel border border-line bg-bg shadow-panel', className)}
    >
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {/* h2, not h3: the section title is the page h1, and five of six
                sections have no intermediate level — an h3 here read as a
                skipped level to anyone navigating by heading (WCAG 1.3.1).
                The visual step stays `text-h3`; only the semantics change. */}
            <h2 id={headingId} className="text-balance text-h3 font-semibold text-ink">
              {title}
            </h2>
            {description ? <p className="mt-0.5 max-w-[72ch] text-label text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bleed ? '' : 'px-4 py-3.5'}>{children}</div>
    </section>
  )
}

export function SectionHeader({
  title,
  lede,
  actions,
}: {
  title: string
  lede: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {/* The section title is this view's page title, so it is the h1 — panels
            are h3, and anything between them is h2. */}
        <h1 className="text-balance text-display font-semibold text-ink">{title}</h1>
        <p className="mt-1 max-w-[72ch] text-pretty text-body text-muted">{lede}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/* -------------------------------------------------------------------------- */
/* Table shell. Tables stay tables (DESIGN.md preservation rule 6).            */
/* -------------------------------------------------------------------------- */

export function Table({ className, children, ...props }: React.ComponentProps<'table'>) {
  return (
    // `relative` is load-bearing: sr-only text is position:absolute, and without
    // a positioned ancestor it escapes this scroll container and widens the page.
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-data', className)} {...props}>
        {children}
      </table>
    </div>
  )
}

export function Th({ className, children, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line bg-raised px-3 py-2 text-left text-label font-medium text-muted whitespace-nowrap',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ className, children, ...props }: React.ComponentProps<'td'>) {
  return (
    <td className={cn('border-b border-line px-3 py-2 align-top text-ink', className)} {...props}>
      {children}
    </td>
  )
}

export function Tr({ className, children, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr className={cn('transition-colors duration-fast ease-out-quart hover:bg-raised/60', className)} {...props}>
      {children}
    </tr>
  )
}

/** Monospace for every path, target name, command and diff line. */
export function Mono({ className, children }: { className?: string; children: React.ReactNode }) {
  // translate="no": these are paths, target names and identifiers. Browser
  // auto-translation garbles them into config that does not exist.
  return (
    <span translate="no" className={cn('font-mono text-data', className)}>
      {children}
    </span>
  )
}

/** The command that clears the problem — every warning carries its remedy. */
export function Command({ children }: { children: string }) {
  return (
    <code translate="no" className="whitespace-nowrap rounded-[4px] bg-raised px-1.5 py-0.5 font-mono text-micro text-ink">
      {children}
    </code>
  )
}

/* -------------------------------------------------------------------------- */
/* Counts. No hero metric, no gradient number — a ledger, not a KPI card.      */
/* -------------------------------------------------------------------------- */

/** Keyed on the value, so a poll-driven change cross-fades instead of snapping. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  return (
    <span key={value} className={cn('mh-fade tabular-nums', className)}>
      {value}
    </span>
  )
}

export function CountChip({ label, value, status }: { label: string; value: number; status?: ResolvedStatus }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-control border border-line px-2 py-1">
      <AnimatedNumber value={value} className="text-data font-semibold text-ink" />
      {status ? (
        <StatusPill status={status} label={label} className="px-0 py-0 bg-transparent" explain />
      ) : (
        <span className="text-micro text-muted">{label}</span>
      )}
    </span>
  )
}

export function KeyValue({ items }: { items: { key: string; value: React.ReactNode }[] }) {
  if (!items.length) return null
  return (
    <dl className="grid grid-cols-[minmax(6rem,max-content)_1fr] gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <React.Fragment key={item.key}>
          <dt className="text-label text-muted">{item.key}</dt>
          <dd className="min-w-0 text-data text-ink">{item.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

/** Generic renderer for the unknown-shaped config blobs on the wire. */
export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre
      translate="no"
      className={cn(
        'overflow-x-auto rounded-control bg-raised px-3 py-2.5 font-mono text-data leading-relaxed text-ink',
        className,
      )}
    >
      {pretty(value)}
    </pre>
  )
}

/* -------------------------------------------------------------------------- */
/* Loading + empty.                                                            */
/* -------------------------------------------------------------------------- */

/** Skeleton rows match the real row's metrics — never a spinner in content. */
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <tbody aria-hidden>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="border-b border-line px-3 py-2.5">
              <span
                className="mh-breathe block h-3 rounded-[3px] bg-raised"
                style={{ width: `${[70, 45, 60, 35, 50][(r + c) % 5]}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

/** Empty states teach the next command rather than saying "nothing here". */
export function EmptyState({
  title,
  body,
  command,
  hint,
}: {
  title: string
  body: React.ReactNode
  command?: string
  hint?: React.ReactNode
}) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-balance text-h3 font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[60ch] text-body text-muted">{body}</p>
      {command ? (
        <p className="mt-4 text-body text-muted">
          Run <Command>{command}</Command>
        </p>
      ) : null}
      {hint ? <p className="mx-auto mt-2 max-w-[60ch] text-label text-muted">{hint}</p> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Filters — native controls, styled. Rung 4 of the ladder.                    */
/* -------------------------------------------------------------------------- */

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const id = React.useId()
  return (
    <span className="inline-flex items-center gap-1.5">
      <label htmlFor={id} className="text-label text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border border-line bg-bg px-2 py-1 text-label text-ink transition-colors duration-fast ease-out-quart hover:bg-raised"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  const id = React.useId()
  return (
    <span className="inline-flex items-center gap-1.5">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-[min(18rem,55vw)] rounded-control border border-line bg-bg px-2.5 py-1 text-label text-ink placeholder:text-muted transition-colors duration-fast ease-out-quart hover:bg-raised"
      />
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Diff pane — both sides, always. Never collapsed to a winner.                */
/* -------------------------------------------------------------------------- */

function splitLines(value: unknown): string[] {
  const text = pretty(value)
  return text.length ? text.split('\n') : ['(absent)']
}

export function DiffPane({
  source,
  native,
  sourceLabel = 'source',
  nativeLabel = 'native',
}: {
  source: unknown
  native: unknown
  sourceLabel?: string
  nativeLabel?: string
}) {
  const left = splitLines(source)
  const right = splitLines(native)
  // ponytail: line-membership, not an LCS. It marks which lines exist on only
  // one side, which is all the eye needs here; upgrade to a real diff if these
  // blobs ever get long enough for order to matter.
  const leftSet = new Set(left.map((l) => l.trim()))
  const rightSet = new Set(right.map((l) => l.trim()))

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <DiffColumn
        title={sourceLabel}
        caption="what the source directory declares"
        lines={left}
        unique={(line) => !rightSet.has(line.trim())}
        tone="source"
      />
      <DiffColumn
        title={nativeLabel}
        caption="what is on disk in the target"
        lines={right}
        unique={(line) => !leftSet.has(line.trim())}
        tone="native"
      />
    </div>
  )
}

function DiffColumn({
  title,
  caption,
  lines,
  unique,
  tone,
}: {
  title: string
  caption: string
  lines: string[]
  unique: (line: string) => boolean
  tone: 'source' | 'native'
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-control border border-line">
      <div className="flex items-baseline justify-between gap-3 border-b border-line bg-raised px-3 py-1.5">
        <span
          className={cn(
            'font-mono text-micro font-medium',
            tone === 'source' ? 'text-accent-strong' : 'text-status-changed'
          )}
        >
          {title}
        </span>
        <span className="text-micro text-muted">{caption}</span>
      </div>
      <div className="max-h-80 overflow-auto">
        <pre className="min-w-full font-mono text-data leading-relaxed">
          {lines.map((line, i) => {
            const only = unique(line)
            return (
              <div
                key={`${i}-${line}`}
                className={cn(
                  'flex gap-2 px-3 py-px',
                  only && (tone === 'source' ? 'bg-accent-soft' : 'bg-status-changed-soft'),
                )}
              >
                <span aria-hidden className={cn('w-3 shrink-0 select-none text-muted', only && 'text-ink')}>
                  {only ? (tone === 'source' ? '+' : '~') : ' '}
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words text-ink">
                  {only ? <span className="sr-only">only on the {tone} side: </span> : null}
                  {line || ' '}
                </span>
              </div>
            )
          })}
        </pre>
      </div>
    </div>
  )
}
