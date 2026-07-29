import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import type { FileState, StatusKind } from '@/types'

/**
 * tailwind-merge only knows Tailwind's own scales. This project's type steps
 * (`text-data`, `text-micro`, … from DESIGN.md §Typography) are custom, so a
 * stock twMerge classifies them as *colors* and treats `text-data text-ink` as
 * a conflict — silently dropping the size and rendering at the inherited step.
 * That shipped as a real defect (the diff-pane label rendered 15px instead of
 * 12px) before this was fixed here rather than at each call site.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'h2', 'h3', 'body', 'data', 'label', 'micro'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * The six-value status vocabulary from DESIGN.md. Every entry carries a color,
 * a glyph AND a word — removing the word breaks WCAG 1.4.1 and the
 * greyscale-screenshot case (DESIGN.md preservation rule 3). Class names are
 * written as literals so Tailwind's scanner can see them.
 */
export interface StatusMeta {
  glyph: string
  word: string
  text: string
  soft: string
  means: string
}

export const STATUS_META: Record<StatusKind, StatusMeta> = {
  clean: {
    glyph: '●',
    word: 'clean',
    text: 'text-status-clean',
    soft: 'bg-status-clean-soft',
    means: 'Matches the manifest — the generated file is byte-identical to what the source produces.',
  },
  pending: {
    glyph: '→',
    word: 'pending',
    text: 'text-status-pending',
    soft: 'bg-status-pending-soft',
    means: 'Will be written on the next generate.',
  },
  new: {
    glyph: '+',
    word: 'new',
    text: 'text-status-new',
    soft: 'bg-status-new-soft',
    means: 'Imported into the source directory from a native config file.',
  },
  changed: {
    glyph: '~',
    word: 'changed',
    text: 'text-status-changed',
    soft: 'bg-status-changed-soft',
    means: 'Edited natively, so it now differs from what the source would generate.',
  },
  conflict: {
    glyph: '!',
    word: 'conflict',
    text: 'text-status-conflict',
    soft: 'bg-status-conflict-soft',
    means: 'Both the source and the native file changed — this needs a decision.',
  },
  missing: {
    glyph: '?',
    word: 'missing',
    text: 'text-status-missing',
    soft: 'bg-status-missing-soft',
    means: 'A managed file is absent from disk.',
  },
}

export interface ResolvedStatus extends StatusMeta {
  kind: StatusKind
}

/**
 * `status --json` states mapped onto the design vocabulary. `link` is a healthy
 * state presented as clean with its own glyph and word (DESIGN.md §Status).
 */
export function resolveFileState(state: FileState): ResolvedStatus {
  switch (state) {
    case 'clean':
      return { kind: 'clean', ...STATUS_META.clean }
    case 'link':
      return {
        kind: 'clean',
        ...STATUS_META.clean,
        glyph: '↳',
        word: 'link',
        means: 'A symlink into the source directory — healthy, and always current by construction.',
      }
    case 'EDITED':
      return { kind: 'changed', ...STATUS_META.changed }
    case 'MISSING':
      return { kind: 'missing', ...STATUS_META.missing }
  }
}

export function resolve(kind: StatusKind, word?: string, means?: string): ResolvedStatus {
  const base = STATUS_META[kind]
  return { kind, ...base, ...(word ? { word } : {}), ...(means ? { means } : {}) }
}

// Locale-aware rather than a hardcoded English format — the browser owns how
// "2 minutes ago" reads in the user's language.
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' })

/** Elapsed time in the voice of a code-review UI: short and factual. */
export function formatElapsed(iso: string, now: number): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 'unknown'
  const secs = Math.max(0, Math.round((now - then) / 1000))
  if (secs < 5) return relative.format(0, 'second')
  if (secs < 60) return relative.format(-secs, 'second')
  const mins = Math.floor(secs / 60)
  if (mins < 60) return relative.format(-mins, 'minute')
  const hours = Math.floor(mins / 60)
  if (hours < 24) return relative.format(-hours, 'hour')
  return relative.format(-Math.floor(hours / 24), 'day')
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString()
}

/** Stable pretty-print for the diff panes and the frontmatter dumps. */
export function pretty(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Last path segment, for a compact root label. */
export function basename(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts.length ? (parts[parts.length - 1] as string) : p
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * `plan.unsupported` reaches the wire in two shapes today: the contract's
 * `{ category, name, detail }` and the CLI's own `{ path, reason }`. Read both
 * rather than rendering `undefined` at the user. Flagged to the lead; when the
 * server settles on one, this collapses to a field read.
 */
interface LoosePlanItem {
  target: string
  category?: string
  name?: string
  detail?: string
  path?: string
  reason?: string
}

export function normalizeUnsupported(item: unknown): {
  target: string
  category: string
  name: string
  detail: string
} {
  const raw = item as LoosePlanItem
  return {
    target: raw.target,
    category: raw.category ?? 'file',
    name: raw.name ?? raw.path ?? '—',
    detail: raw.detail ?? raw.reason ?? 'This target has no surface for that category.',
  }
}
