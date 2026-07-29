# Dashboard API contract (frozen)

Both lanes code against this. **Do not change a field name without telling the
lead** — the other lane is compiling against it right now.

The canonical TypeScript declaration of every shape below lives in
`src/types.ts`. The server lane owns that file; the UI lane imports from it and
never redeclares a shape locally.

## Processes

- **API server** — `dashboard/server/index.mjs`, plain `node:http`, **zero new
  dependencies**. It imports the CLI's own ESM modules directly
  (`../../src/sync.js` etc.), never shells out. Default port `4711`,
  `--port` to override. Serves `dist/` when it exists, so
  `npm run build && npm start` is a single-process production mode.
- **UI** — Vite dev server on `5173`, proxying `/api` to `4711`
  (`server.proxy` in `vite.config.ts`).

## Root selection

Every endpoint takes an optional `?root=<absolute path>`. Omitted → the
server's `--root` (default: the repo containing `dashboard/`). The server
**must** reject a root that is not an absolute existing directory with
`400 {error}`, and must never traverse outside it.

## `GET /api/snapshot?root=`

The expensive call. Everything the page needs for a full render.

```ts
type Snapshot = {
  root: string
  sourceDir: string          // cfg.sourceDir, e.g. ".meta-harness"
  configured: boolean        // meta-harness.jsonc exists
  sourceExists: boolean      // <root>/<sourceDir> exists
  generatedAt: string        // ISO
  durationMs: number
  plan: Plan | null          // null when syncPlan threw; see `error`
  model: Model | null        // null when the source dir does not exist
  detection: DetectionRow[]
  status: StatusRow[]
  drift: DriftReport
  trustGates: TrustGate[]
  error: string | null       // fatal, page shows an error state
}
```

### `Plan` — straight from `syncPlan(root)` in `src/sync.js`

Pass it through **unmodified** except where noted. Shape today:

```ts
type PlanItem = { target: string; category: string; name: string; kind?: string; detail?: string }
// NOT a PlanItem — every producer in src/sync.js emits path+reason. Corrected
// 2026-07-29 when the UI lane caught this contract diverging from the code.
type UnsupportedItem = { target: string; path: string; reason: string; skipped?: boolean; fatal?: boolean }
type Plan = {
  mode: 'bootstrap' | 'reconcile'
  targets: string[]                 // enabled
  proposed: string[]                // detected but NOT enabled — bootstrap mode only
  imports: PlanItem[]
  conflicts: (PlanItem & { source?: unknown; native?: unknown; prefer?: string | null; fatal?: boolean })[]
  unsupported: UnsupportedItem[]
  generates: { target: string; path: string }[]
  clean: { target: string; category: string; name: string }[]
  warnings: string[]
  scanned: string[]
  // `sourceWrites` is DROPPED by the server — it carries full file bodies and
  // is only useful to `syncApply`. Do not ship it to the browser.
}
```

`syncPlan` is pure and never writes. If it throws, set `plan: null` and put the
message in `error`.

### `Model` — from `loadModel(<root>/<sourceDir>)`

Reshaped for the wire. Absolute `file` paths are made **root-relative**; bodies
are sent in full (this is a localhost tool).

```ts
type ModelItem = {
  name: string
  file: string               // root-relative
  targets: string[]          // ["*"] means every enabled target
  description: string | null // fm.description ?? shared.description
  fm: Record<string, unknown>
  body: string
  perTarget?: Record<string, unknown>   // agents only
}
type Model = {
  rules: ModelItem[]
  agents: ModelItem[]
  commands: ModelItem[]
  mcp: { servers: Record<string, unknown>; perTarget: Record<string, unknown>; file: string } | null
  hooks: { event: string; entries: unknown[] }[] | null
  env: Record<string, unknown> | null
  plugins: { enabledPlugins: string[]; file: string } | null
  permissions: unknown | null
  settings: { claude: unknown | null; codex: unknown | null }
  issues: { level: 'error' | 'warn'; file: string; message: string }[]  // file made relative
  counts: Record<string, number>   // per category, for the overview
}
```

### `DetectionRow` — from `detectTargets(root)` + `splitDetected`

```ts
type DetectionRow = {
  target: string
  repo: string[]             // config artefacts found in the repo
  bin: string | null         // binary name found on PATH
  enabled: boolean           // in plan.targets
  proposed: boolean          // detected but pair-restricted out (V1-FOCUS §1)
  supports: string[]         // categories this target can receive
  outputs: string[]          // root-relative files it currently owns (from status/manifest)
}
```

`supports` comes from the target module in `src/targets/` (its declared
capability), cross-checked against `CATEGORIES` in `src/explain.js`.

### `StatusRow` — from `status(root)`

```ts
type StatusRow = {
  path: string                                    // root-relative
  state: 'clean' | 'link' | 'EDITED' | 'MISSING'
  target: string | null                           // owner, inferred from the path prefix
  category: string | null
}
```

`status()` throws when there is no manifest. That is **not** an error — it means
"nothing generated yet". Catch it and return `[]`.

### `DriftReport` — from `generate(root, { check: true })`

```ts
type DriftReport = { stale: boolean; drifted: string[]; error: string | null }
```

`check: true` never writes. If it throws (no source dir), return
`{ stale: false, drifted: [], error: message }`.

### `TrustGate` — computed, not read from the CLI

Generated hooks and permissions are **inert until the runtime accepts them**.
The dashboard surfaces this because nothing else does.

```ts
type TrustGate = {
  target: 'claude' | 'codex'
  gate: string               // "folder trust" | "directory trust" | "/hooks accept"
  relevant: boolean          // do we actually generate something this gate blocks?
  blocks: string[]           // root-relative files that are inert without it
  hint: string               // one sentence: what the user does to clear it
}
```

`relevant` is false when we generate nothing that the gate governs — the UI
hides irrelevant gates rather than showing a wall of green.

## `GET /api/status?root=`

The cheap poll. `{ status: StatusRow[], drift: DriftReport, generatedAt: string }`.
Must be fast enough to run every 5s. **No `syncPlan` call in this path.**

## `GET /api/reference`

Static, cacheable, root-independent. `CATEGORIES` and `TARGETS` from
`src/explain.js` verbatim, plus `KNOWN_TARGETS` and `CANONICAL_EVENTS` from
`src/model.js`. Feeds the help/reference surfaces so no doc text is duplicated
in the UI.

## `GET /api/roots`

`{ roots: { path: string; label: string; configured: boolean }[] }` — the
server's `--root` plus any demo fixtures under `dashboard/fixtures/`, so the
root switcher has something to switch between.

## Errors

Never 500 with an HTML body. Always
`{ error: string, detail?: string }` and a 4xx/5xx JSON response. A per-section
failure degrades that section only: `plan: null` with `error` set still renders
a page with status and detection intact.
