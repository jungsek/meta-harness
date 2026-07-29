/**
 * View-model derivation: Snapshot (wire) → the sync map (what the screen
 * draws). All interpretation lives here, typed and unit-testable — the
 * components below this stay dumb.
 *
 * Vocabulary (DESIGN.md v2): the map is source-centric. An IMPORT flows
 * native → source (inward), a GENERATE flows source → native (outward), a
 * CONFLICT sits in the lane. Clean items are the dim background hum.
 */
import type {
  CategoryName,
  ConflictItem,
  DetectionRow,
  GenerateItem,
  PlanItem,
  Snapshot,
  StatusKind,
  StatusRow,
  TrustGate,
  UnsupportedItem,
} from '@/types'

export const CATEGORY_ORDER: CategoryName[] = [
  'rules',
  'agents',
  'commands',
  'connections',
  'hooks',
  'env',
  'plugins',
  'permissions',
  'settings',
]

export type FlowDirection = 'import' | 'generate'

export interface LaneArrow {
  key: string
  direction: FlowDirection
  target: string
  category: string
  name: string
  /** pending | new | changed — colors the arrow. */
  status: StatusKind
  /** Human meaning, one line, used by the tooltip and the drawer. */
  meaning: string
}

export interface LaneConflict {
  key: string
  target: string
  conflict: ConflictItem
}

export interface Lane {
  target: string
  arrows: LaneArrow[]
  conflicts: LaneConflict[]
  importCount: number
  generateCount: number
}

export interface TargetFile {
  path: string
  state: StatusKind
  /** Raw file state word shown in the pill (`link` keeps its own word). */
  word: string
  category: string | null
  /** True when generate --check reports this output stale/hand-edited — the file has a real content diff to show. */
  drifted: boolean
}

export interface TargetPanel {
  target: string
  enabled: boolean
  proposed: boolean
  detection: DetectionRow | null
  /** Grouped by category, category order. `null` key = uncategorised. */
  groups: { category: string; files: TargetFile[] }[]
  fileCount: number
  attention: number
}

export interface SourceCategory {
  category: CategoryName
  count: number
  /** Item names with the targets they reach. */
  items: { name: string; reach: string[]; description: string | null }[]
}

export type VerdictTone = 'ok' | 'action' | 'conflict' | 'error'

export interface Verdict {
  tone: VerdictTone
  /** The one sentence. */
  text: string
  /** The remedy, a real CLI string, or null when there is nothing to run. */
  command: string | null
}

export interface ConsoleLine {
  key: string
  kind: 'gate' | 'warning' | 'unsupported' | 'issue'
  text: string
  command: string | null
  severity: 'action' | 'info'
}

export interface SyncMapModel {
  mode: 'bootstrap' | 'reconcile' | null
  verdict: Verdict
  source: { exists: boolean; dir: string; categories: SourceCategory[]; total: number }
  /** Enabled targets, plan order (claude, codex, …). */
  panels: TargetPanel[]
  ghosts: TargetPanel[]
  lanes: Map<string, Lane>
  /**
   * Shared outputs (AGENTS.md, CLAUDE.md, .mcp.json) are ONE physical write
   * that every target reads. They live on the source panel, not in a lane —
   * putting them in lanes double-counted the CLI's plan and pinned shared
   * conflicts onto one arbitrary target (Codex review, 2026-07-29).
   */
  shared: { files: TargetFile[]; generates: GenerateItem[]; conflicts: ConflictItem[] }
  console: ConsoleLine[]
}

const FILE_STATE_TO_KIND: Record<string, StatusKind> = {
  clean: 'clean',
  link: 'clean',
  EDITED: 'changed',
  MISSING: 'missing',
}

function importMeaning(item: PlanItem): string {
  switch (item.kind) {
    case 'new':
      return 'found natively — folds into the source'
    case 'removed':
      return 'deleted natively — removal folds into the source'
    default:
      return 'edited natively — folds back into the source'
  }
}

function importStatus(item: PlanItem): StatusKind {
  if (item.kind === 'new') return 'new'
  return 'changed'
}

export function deriveVerdict(snap: Snapshot): Verdict {
  if (snap.error) return { tone: 'error', text: snap.error, command: null }
  const plan = snap.plan
  if (!snap.configured || !plan) {
    return {
      tone: 'action',
      text: 'No harness here yet — one command imports what this repo already has.',
      command: 'npx @jungsek/meta-harness sync',
    }
  }
  const conflicts = plan.conflicts.length
  const imports = plan.imports.length
  const generates = plan.generates.length
  if (conflicts > 0) {
    const noun = conflicts === 1 ? 'conflict' : 'conflicts'
    return {
      tone: 'conflict',
      text: `${conflicts} ${noun} — both sides changed. sync stops until you pick.`,
      command: 'meta-harness sync --prefer source',
    }
  }
  if (imports > 0 || generates > 0) {
    const parts: string[] = []
    if (imports > 0) parts.push(`${imports} native ${imports === 1 ? 'change' : 'changes'} to fold in`)
    if (generates > 0) parts.push(`${generates} ${generates === 1 ? 'file' : 'files'} to write`)
    return { tone: 'action', text: `${parts.join(', ')}.`, command: 'meta-harness sync' }
  }
  if (snap.drift.stale) {
    return { tone: 'action', text: 'Outputs are stale — the source moved ahead.', command: 'meta-harness sync' }
  }
  const gates = snap.trustGates.filter((g) => g.relevant)
  if (gates.length > 0) {
    const noun = gates.length === 1 ? 'trust gate' : 'trust gates'
    return {
      tone: 'action',
      // No command chip: a gate's remedy is a prose sentence (open the tool,
      // accept a prompt), and those live in the needs-action tab below.
      text: `In sync, but ${gates.length} ${noun} still ${gates.length === 1 ? 'keeps' : 'keep'} generated config inert.`,
      command: null,
    }
  }
  return { tone: 'ok', text: 'In sync — every target matches the source.', command: null }
}

function buildLanes(
  snap: Snapshot,
  enabled: string[],
): { lanes: Map<string, Lane>; sharedGenerates: GenerateItem[]; sharedConflicts: ConflictItem[] } {
  const lanes = new Map<string, Lane>()
  for (const t of enabled) lanes.set(t, { target: t, arrows: [], conflicts: [], importCount: 0, generateCount: 0 })
  const sharedGenerates: GenerateItem[] = []
  const sharedConflicts: ConflictItem[] = []
  const plan = snap.plan
  if (!plan) return { lanes, sharedGenerates, sharedConflicts }

  for (const item of plan.imports) {
    const lane = lanes.get(item.target)
    if (!lane) continue
    lane.importCount += 1
    lane.arrows.push({
      key: `imp:${item.target}:${item.category}:${item.name}`,
      direction: 'import',
      target: item.target,
      category: item.category,
      name: item.name,
      status: importStatus(item),
      meaning: item.detail ?? importMeaning(item),
    })
  }
  for (const gen of plan.generates) {
    // Shared outputs are ONE write read by every target — they belong to the
    // source panel, not a lane. Duplicating them per lane inflated the counts
    // above the CLI's own plan total.
    if (gen.target === 'shared' || !lanes.has(gen.target)) {
      sharedGenerates.push(gen)
      continue
    }
    const lane = lanes.get(gen.target)!
    lane.generateCount += 1
    lane.arrows.push({
      key: `gen:${gen.target}:${gen.path}`,
      direction: 'generate',
      target: gen.target,
      category: 'output',
      name: gen.path,
      status: 'pending',
      meaning: 'will be written on the next sync',
    })
  }
  for (const c of plan.conflicts) {
    const lane = lanes.get(c.target)
    // A conflict on a shared output (or an unknown target) is not one
    // target's problem — never pin it to an arbitrary lane.
    if (!lane) {
      sharedConflicts.push(c)
      continue
    }
    lane.conflicts.push({ key: `con:${c.target}:${c.category}:${c.name}`, target: c.target, conflict: c })
  }
  return { lanes, sharedGenerates, sharedConflicts }
}

function toTargetFile(row: StatusRow, drifted: Set<string>): TargetFile {
  return {
    path: row.path,
    state: FILE_STATE_TO_KIND[row.state] ?? 'missing',
    word: row.state === 'link' ? 'link' : (FILE_STATE_TO_KIND[row.state] ?? 'missing'),
    category: row.category,
    drifted: drifted.has(row.path),
  }
}

function buildPanels(snap: Snapshot): { panels: TargetPanel[]; ghosts: TargetPanel[]; sharedFiles: TargetFile[] } {
  const drifted = new Set(snap.drift.drifted)
  const byTarget = new Map<string, StatusRow[]>()
  for (const row of snap.status) {
    const t = row.target ?? 'shared'
    const list = byTarget.get(t) ?? []
    list.push(row)
    byTarget.set(t, list)
  }

  const toPanel = (det: DetectionRow): TargetPanel => {
    const rows = byTarget.get(det.target) ?? []
    const groups = new Map<string, TargetFile[]>()
    for (const row of rows) {
      const file = toTargetFile(row, drifted)
      const key = row.category ?? 'other'
      const list = groups.get(key) ?? []
      list.push(file)
      groups.set(key, list)
    }
    const ordered = [...CATEGORY_ORDER.map(String), 'other']
      .filter((c) => groups.has(c))
      .map((c) => ({ category: c, files: groups.get(c)! }))
    const files = [...groups.values()].flat()
    return {
      target: det.target,
      enabled: det.enabled,
      proposed: det.proposed,
      detection: det,
      groups: ordered,
      fileCount: files.length,
      attention: files.filter((f) => f.state === 'changed' || f.state === 'missing').length,
    }
  }

  const panels = snap.detection.filter((d) => d.enabled).map(toPanel)
  const ghosts = snap.detection.filter((d) => !d.enabled && (d.proposed || d.repo.length > 0 || d.bin)).map(toPanel)
  const sharedFiles = (byTarget.get('shared') ?? []).map((row) => toTargetFile(row, drifted))
  return { panels, ghosts, sharedFiles }
}

function buildSource(snap: Snapshot): SyncMapModel['source'] {
  const model = snap.model
  const categories: SourceCategory[] = []
  if (model) {
    const push = (category: CategoryName, items: SourceCategory['items']) => {
      if (items.length > 0) categories.push({ category, count: items.length, items })
    }
    push(
      'rules',
      model.rules.map((r) => ({ name: r.name, reach: r.targets, description: r.description })),
    )
    push(
      'agents',
      model.agents.map((a) => ({ name: a.name, reach: a.targets, description: a.description })),
    )
    push(
      'commands',
      model.commands.map((c) => ({ name: c.name, reach: c.targets, description: c.description })),
    )
    if (model.mcp)
      push(
        'connections',
        Object.keys(model.mcp.servers).map((name) => ({ name, reach: ['*'], description: null })),
      )
    if (model.hooks)
      push(
        'hooks',
        model.hooks.map((h) => ({ name: h.event, reach: ['*'], description: `${h.entries.length} ${h.entries.length === 1 ? 'entry' : 'entries'}` })),
      )
    if (model.env) {
      // The wire flattens env to the plain var map (server reshapeModel).
      push(
        'env',
        Object.keys(model.env).map((name) => ({ name, reach: ['*'], description: null })),
      )
    }
    if (model.plugins)
      push(
        'plugins',
        model.plugins.enabledPlugins.map((name) => ({ name, reach: ['claude'], description: null })),
      )
    if (model.permissions) push('permissions', [{ name: 'permissions', reach: ['*'], description: 'allow / deny / ask' }])
    if (model.settings.claude || model.settings.codex) {
      const items: SourceCategory['items'] = []
      if (model.settings.claude) items.push({ name: 'claude.settings', reach: ['claude'], description: null })
      if (model.settings.codex) items.push({ name: 'codex.config', reach: ['codex'], description: null })
      push('settings', items)
    }
  }
  return {
    exists: snap.sourceExists,
    dir: snap.sourceDir,
    categories,
    total: categories.reduce((n, c) => n + c.count, 0),
  }
}

function gateLine(gate: TrustGate): ConsoleLine {
  return {
    key: `gate:${gate.target}:${gate.gate}`,
    kind: 'gate',
    // hint is a prose sentence, not a CLI string — it belongs in the text.
    // The only typeable remedy a gate has is launching the tool itself.
    text: `${gate.target}: ${gate.gate} not accepted — ${gate.hint}`,
    command: gate.target === 'codex' ? 'codex' : null,
    severity: 'action',
  }
}

function unsupportedLine(u: UnsupportedItem): ConsoleLine {
  return {
    key: `uns:${u.target}:${u.path}`,
    kind: 'unsupported',
    text: `${u.target}: ${u.path} — ${u.reason}`,
    command: null,
    severity: u.fatal ? 'action' : 'info',
  }
}

export function deriveSyncMap(snap: Snapshot): SyncMapModel {
  const enabled = snap.plan?.targets ?? snap.detection.filter((d) => d.enabled).map((d) => d.target)
  const { panels, ghosts, sharedFiles } = buildPanels(snap)
  const { lanes, sharedGenerates, sharedConflicts } = buildLanes(snap, enabled)
  const consoleLines: ConsoleLine[] = [
    ...snap.trustGates.filter((g) => g.relevant).map(gateLine),
    ...(snap.plan?.warnings ?? []).map((w, i) => ({
      key: `warn:${i}`,
      kind: 'warning' as const,
      text: w,
      command: null,
      severity: 'info' as const,
    })),
    ...(snap.plan?.unsupported ?? []).map(unsupportedLine),
    ...(snap.model?.issues ?? []).map((iss) => ({
      key: `issue:${iss.file}:${iss.message}`,
      kind: 'issue' as const,
      text: `${iss.file}: ${iss.message}`,
      command: null,
      severity: iss.level === 'error' ? ('action' as const) : ('info' as const),
    })),
  ]
  return {
    mode: snap.plan?.mode ?? null,
    verdict: deriveVerdict(snap),
    source: buildSource(snap),
    panels,
    ghosts,
    lanes,
    shared: { files: sharedFiles, generates: sharedGenerates, conflicts: sharedConflicts },
    console: consoleLines,
  }
}
