/**
 * Brand identity for the three columns — recognizable marks and accent hues
 * so "which tool is this" is answered by color + icon before any label is
 * read. Hues are the tools' official brand colors; marks are simplified
 * single-path renditions sized for 16px chrome.
 */
import { cn } from '@/lib/util'

export interface Brand {
  /** Display label for the panel frame. */
  label: string
  /** Brand hue, used for the frame title + icon only — body stays neutral. */
  color: string
  icon: (size?: number) => React.ReactNode
}

/** Anthropic "starburst" in Claude clay. */
function ClaudeMark(size = 14) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <g stroke="#d97757" strokeWidth="1.7" strokeLinecap="round">
        <line x1="8" y1="1.5" x2="8" y2="5" />
        <line x1="8" y1="11" x2="8" y2="14.5" />
        <line x1="1.5" y1="8" x2="5" y2="8" />
        <line x1="11" y1="8" x2="14.5" y2="8" />
        <line x1="3.4" y1="3.4" x2="5.9" y2="5.9" />
        <line x1="10.1" y1="10.1" x2="12.6" y2="12.6" />
        <line x1="12.6" y1="3.4" x2="10.1" y2="5.9" />
        <line x1="5.9" y1="10.1" x2="3.4" y2="12.6" />
      </g>
    </svg>
  )
}

/** OpenAI-family knot, simplified to a hex ring in the official green. */
function CodexMark(size = 14) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.8 13.4 4.9v6.2L8 14.2 2.6 11.1V4.9L8 1.8Z"
        stroke="#10a37f"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" fill="#10a37f" />
    </svg>
  )
}

/** meta-harness "M" mark in the product accent (matches the favicon). */
function SourceMark(size = 14) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" rx="3.5" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M4.5 11V5h1.4l2.1 3.4L10.1 5h1.4v6" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

const BRANDS: Record<string, Brand> = {
  claude: { label: 'Claude Code', color: '#d97757', icon: ClaudeMark },
  codex: { label: 'Codex', color: '#10a37f', icon: CodexMark },
  source: { label: 'meta-harness', color: 'var(--accent)', icon: SourceMark },
}

export function brandOf(target: string): Brand {
  return (
    BRANDS[target] ?? {
      label: target,
      color: 'var(--muted)',
      icon: (size = 14) => (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ),
    }
  )
}

/** Frame-title content: icon + brand-tinted label. */
export function BrandTitle({ target, suffix, className }: { target: string; suffix?: string; className?: string }) {
  const b = brandOf(target)
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {b.icon()}
      <span style={{ color: b.color }}>{b.label}</span>
      {suffix ? <span className="text-muted">· {suffix}</span> : null}
    </span>
  )
}
