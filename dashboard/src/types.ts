/**
 * Wire shapes for the dashboard API. This file is the frozen contract between
 * `server/index.mjs` and the React app — see ../CONTRACT.md for the prose.
 * Owned by the lead; neither lane edits it without saying so.
 */

export type TargetName = 'claude' | 'codex' | 'cursor' | 'opencode' | 'hermes'

export type CategoryName =
  | 'rules'
  | 'agents'
  | 'commands'
  | 'connections'
  | 'hooks'
  | 'env'
  | 'plugins'
  | 'permissions'
  | 'settings'

/** `status --json` states, straight from src/engine.js. */
export type FileState = 'clean' | 'link' | 'EDITED' | 'MISSING'

/** The six-value design vocabulary. `link` is presented as a healthy state. */
export type StatusKind = 'clean' | 'pending' | 'new' | 'changed' | 'conflict' | 'missing'

export interface PlanItem {
  target: string
  category: string
  name: string
  kind?: string
  detail?: string
}

export interface ConflictItem extends PlanItem {
  /** Both sides are always present on the wire; the UI never hides one. */
  source?: unknown
  native?: unknown
  prefer?: string | null
  /** Set when the disagreement cannot be resolved by importing either side. */
  fatal?: boolean
}

/**
 * `plan.unsupported` is NOT a PlanItem. Every producer in src/sync.js
 * (`inventory`, `lostInTranslation`, and the inline `ctx.unsupported.push`
 * sites) emits a path+reason record, so it is typed as what it actually is.
 * Corrected 2026-07-29 after the UI lane caught the contract diverging from
 * the code — the code was right.
 */
export interface UnsupportedItem {
  target: string
  /** Root-relative, sometimes with a key path suffix, e.g. `.codex/config.toml [mcp_servers."x"]`. */
  path: string
  reason: string
  /** Present when the file was recognised but deliberately left in place. */
  skipped?: boolean
  /** Present when importing it would lose data — sync writes nothing for it. */
  fatal?: boolean
}

export interface GenerateItem {
  target: string
  path: string
}

export interface CleanItem {
  target: string
  category: string
  name: string
}

export interface Plan {
  mode: 'bootstrap' | 'reconcile'
  /** Enabled targets for this run. */
  targets: string[]
  /** Detected but deliberately not auto-enabled (V1-FOCUS: pair-only). */
  proposed: string[]
  imports: PlanItem[]
  conflicts: ConflictItem[]
  unsupported: UnsupportedItem[]
  generates: GenerateItem[]
  clean: CleanItem[]
  warnings: string[]
  scanned: string[]
}

export interface ModelIssue {
  level: 'error' | 'warn'
  /** Root-relative. */
  file: string
  message: string
}

export interface ModelItem {
  name: string
  /** Root-relative. */
  file: string
  /** `["*"]` means every enabled target. */
  targets: string[]
  description: string | null
  fm: Record<string, unknown>
  body: string
  /** Agents only: per-target frontmatter overrides. */
  perTarget?: Record<string, unknown>
}

export interface ModelMcp {
  servers: Record<string, unknown>
  perTarget: Record<string, unknown>
  file: string
}

export interface ModelHookEvent {
  event: string
  entries: unknown[]
}

export interface Model {
  rules: ModelItem[]
  agents: ModelItem[]
  commands: ModelItem[]
  mcp: ModelMcp | null
  hooks: ModelHookEvent[] | null
  env: Record<string, unknown> | null
  plugins: { enabledPlugins: string[]; file: string } | null
  permissions: unknown | null
  settings: { claude: unknown | null; codex: unknown | null }
  issues: ModelIssue[]
  /** Per-category item counts, for the overview. */
  counts: Record<string, number>
}

export interface DetectionRow {
  target: string
  /** Config artefacts found in the repo (e.g. `.claude`). */
  repo: string[]
  /** Binary name found on PATH, if any. */
  bin: string | null
  enabled: boolean
  proposed: boolean
  /** Categories this target can receive. */
  supports: string[]
  /** Root-relative files it currently owns. */
  outputs: string[]
}

export interface StatusRow {
  /** Root-relative. */
  path: string
  state: FileState
  target: string | null
  category: string | null
}

export interface DriftReport {
  stale: boolean
  drifted: string[]
  error: string | null
}

export interface TrustGate {
  target: 'claude' | 'codex'
  gate: string
  /** False when we generate nothing this gate governs; the UI hides those. */
  relevant: boolean
  /** Root-relative files that stay inert until the gate is accepted. */
  blocks: string[]
  hint: string
}

export interface Snapshot {
  root: string
  sourceDir: string
  configured: boolean
  sourceExists: boolean
  generatedAt: string
  durationMs: number
  plan: Plan | null
  model: Model | null
  detection: DetectionRow[]
  status: StatusRow[]
  drift: DriftReport
  trustGates: TrustGate[]
  error: string | null
}

/** `GET /api/status` — the cheap poll. No syncPlan in this path. */
export interface StatusPoll {
  status: StatusRow[]
  drift: DriftReport
  generatedAt: string
}

/** `GET /api/reference` — doc tables lifted verbatim from src/explain.js. */
export interface CategoryDoc {
  where: string
  what: string
  frontmatter?: string
  example?: string
  goes: string
}

export interface TargetDoc {
  [key: string]: unknown
}

export interface Reference {
  categories: Record<string, CategoryDoc>
  targets: Record<string, TargetDoc>
  knownTargets: string[]
  canonicalEvents: string[]
}

export interface RootEntry {
  path: string
  label: string
  configured: boolean
}

export interface RootsResponse {
  roots: RootEntry[]
}

export interface ApiError {
  error: string
  detail?: string
}
