// Mapping layer between the CLI's ESM modules and the wire shapes in
// ../CONTRACT.md / ../src/types.ts. Kept free of node:http so it is testable
// without a socket (dashboard/test/*.test.mjs imports it directly).

import fs from 'node:fs'
import path from 'node:path'
import { generate, loadConfig, loadManifest, status } from '../../src/engine.js'
import { detectTargets, splitDetected } from '../../src/detect.js'
import { CATEGORIES, TARGETS } from '../../src/explain.js'
import { loadModel, CANONICAL_EVENTS, KNOWN_TARGETS } from '../../src/model.js'
import { syncPlan } from '../../src/sync.js'

/* ── root validation ────────────────────────────────────────────────────── */

// Marks a rejection as the caller's fault (bad input), distinct from an
// unmarked throw — which index.mjs treats as an unexpected server failure
// (500). Without this split, every /api/* error looked like a 400, including
// genuine internal bugs, which misleads whoever is reading the response.
function badRoot(message) {
  const e = new Error(message)
  e.status = 400
  return e
}

// Absolute, normalized (no ".." segments), existing directory. Rejects a
// traversal-y `?root=` and anything relative — CONTRACT.md's one boundary
// check, shared by every endpoint that takes `root`.
export function validateRoot(root) {
  if (typeof root !== 'string' || root.length === 0) throw badRoot('root is required')
  if (!path.isAbsolute(root)) throw badRoot(`root must be an absolute path (got "${root}")`)
  if (root !== path.resolve(root)) throw badRoot(`root must be a normalized path with no ".." segments (got "${root}")`)
  let st
  try {
    st = fs.statSync(root)
  } catch {
    throw badRoot(`root does not exist: ${root}`)
  }
  if (!st.isDirectory()) throw badRoot(`root is not a directory: ${root}`)
  return root
}

/* ── target capability table ────────────────────────────────────────────── */

// Categories each target module ever emits (grepped from src/targets/*.js —
// `rules` is shared for all five via the generated AGENTS.md/CLAUDE.md,
// src/agentsmd.js). Validated at load time against CATEGORIES so this table
// can never silently drift from the modules it describes.
const SUPPORTS = {
  claude: ['rules', 'agents', 'commands', 'connections', 'hooks', 'env', 'plugins', 'permissions', 'settings'],
  codex: ['rules', 'agents', 'connections', 'hooks', 'env', 'permissions', 'settings'],
  cursor: ['rules', 'agents', 'commands', 'connections', 'hooks'],
  opencode: ['rules', 'agents', 'commands', 'connections', 'hooks'],
  hermes: ['rules', 'agents'],
}
{
  const known = new Set(Object.keys(CATEGORIES))
  for (const [target, cats] of Object.entries(SUPPORTS))
    for (const c of cats) if (!known.has(c)) throw new Error(`collect.mjs SUPPORTS["${target}"]: unknown category "${c}"`)
}

/* ── path → owner attribution (mirrors src/sync.js ownerOf) ─────────────── */

const TARGET_DIRS = {
  '.claude/': 'claude',
  '.codex/': 'codex',
  '.cursor/': 'cursor',
  '.opencode/': 'opencode',
  '.hermes/': 'hermes',
}

function ownerOf(rel) {
  if (rel === 'opencode.json') return 'opencode'
  for (const [prefix, target] of Object.entries(TARGET_DIRS)) if (rel.startsWith(prefix)) return target
  return 'shared'
}

const CATEGORY_BY_PATH = [
  [/^\.claude\/agents\//, 'agents'],
  [/^\.claude\/commands\//, 'commands'],
  [/^\.codex\/agents\//, 'agents'],
  [/^\.codex\/hooks\.json$/, 'hooks'],
  [/^\.codex\/rules\//, 'permissions'],
  [/^\.cursor\/agents\//, 'agents'],
  [/^\.cursor\/commands\//, 'commands'],
  [/^\.cursor\/mcp\.json$/, 'connections'],
  [/^\.cursor\/hooks\.json$/, 'hooks'],
  [/^\.opencode\/agents\//, 'agents'],
  [/^\.opencode\/commands\//, 'commands'],
  [/^\.opencode\/plugins\//, 'hooks'],
  [/^\.hermes\//, 'agents'],
  [/^\.mcp\.json$/, 'connections'],
  [/^(AGENTS|CLAUDE)\.md$/, 'rules'],
]

// Shared files hold more than one category under one top-level-key roof
// (.claude/settings.json, .codex/config.toml). When every owned key on this
// file maps to the same category, name it; a genuinely mixed file reports
// null rather than pick one arbitrarily.
const claudeSettingsKeyCategory = (k) =>
  k === 'hooks' ? 'hooks' : k === 'env' ? 'env' : k === 'enabledPlugins' ? 'plugins' : k === 'permissions' ? 'permissions' : 'settings'
const codexConfigKeyCategory = (k) =>
  k === 'mcp_servers' ? 'connections' : k === 'shell_environment_policy' ? 'env' : ['approval_policy', 'sandbox_mode'].includes(k) ? 'permissions' : 'settings'
const opencodeKeyCategory = () => 'connections'

function sharedFileCategory(rel, ownedKeys) {
  const mapper = rel.endsWith('.codex/config.toml') ? codexConfigKeyCategory : rel.endsWith('opencode.json') ? opencodeKeyCategory : claudeSettingsKeyCategory
  const cats = new Set(ownedKeys.map(mapper))
  return cats.size === 1 ? [...cats][0] : null
}

function categoryOf(rel, ownedKeys) {
  if (ownedKeys) return sharedFileCategory(rel, ownedKeys)
  for (const [re, cat] of CATEGORY_BY_PATH) if (re.test(rel)) return cat
  return null
}

// status(root) rows carry only {path, state} — attribute owner/category by
// path prefix (and, for shared files, by which manifest keys are owned).
// Not wrapped in try/catch: by the time this runs, the caller already called
// status(root) successfully, which itself loads this same manifest — so this
// second load can only fail the same way the first would have, and the first
// wasn't swallowed either (see getManifestStatus below).
function attributeStatusRows(root, rows) {
  const cfg = loadConfig(root)
  const manifest = rows.length ? loadManifest(root, cfg) : { files: {} }
  return rows.map((r) => {
    const entry = manifest.files[r.path]
    return {
      path: r.path,
      state: r.state,
      target: ownerOf(r.path),
      category: categoryOf(r.path, entry?.ownedKeys),
    }
  })
}

/* ── drift (the cheap check — no syncPlan) ──────────────────────────────── */

// generate(root, {check:true}) never writes (verified: every write branch in
// src/engine.js is gated on `!check`) but it DOES throw when it finds drift —
// that throw carries `err.drifted`, and is the expected "stale" case, not a
// failure. Only a throw with no `.drifted` (no source dir, unreadable output)
// is a real error.
function getDriftReport(root) {
  try {
    generate(root, { check: true })
    return { stale: false, drifted: [], error: null }
  } catch (e) {
    if (e.drifted) return { stale: e.drifted.length > 0, drifted: e.drifted, error: null }
    return { stale: false, drifted: [], error: e.message }
  }
}

// "No manifest yet" (nothing generated) is a real, expected empty state —
// CONTRACT.md says so explicitly — and is checked directly rather than
// caught, so it is never confused with a manifest that exists but fails to
// parse. The latter is a genuine failure and is left to propagate: better a
// loud 500 than a dashboard confidently showing "nothing to see here" over a
// corrupt .manifest.json.
function getManifestStatus(root) {
  const cfg = loadConfig(root)
  if (!fs.existsSync(path.join(root, cfg.sourceDir, '.manifest.json'))) return []
  return status(root)
}

export function getStatusPoll(root) {
  const rows = getManifestStatus(root)
  return {
    status: attributeStatusRows(root, rows),
    drift: getDriftReport(root),
    generatedAt: new Date().toISOString(),
  }
}

/* ── model reshape ──────────────────────────────────────────────────────── */

const toModelItem = (item, root) => ({
  name: item.name,
  file: path.relative(root, item.file),
  targets: item.targets,
  description: item.fm?.description ?? item.shared?.description ?? null,
  fm: item.fm,
  body: item.body,
  ...(item.perTarget ? { perTarget: item.perTarget } : {}),
})

function permissionsCount(permissions) {
  if (!permissions) return 0
  let n = 0
  for (const kindMap of Object.values(permissions.rules ?? {})) n += Object.keys(kindMap).length
  return n
}

function reshapeModel(model, root) {
  const mcp = model.mcp ? { servers: model.mcp.servers, perTarget: model.mcp.perTarget, file: path.relative(root, model.mcp.file) } : null
  const hooks = model.hooks ? Object.entries(model.hooks.events).map(([event, entries]) => ({ event, entries })) : null
  const env = model.env ? model.env.vars : null
  const plugins = model.plugins ? { enabledPlugins: model.plugins.enabledPlugins, file: path.relative(root, model.plugins.file) } : null
  const permissions = model.permissions ? { ...model.permissions, file: path.relative(root, model.permissions.file) } : null

  return {
    rules: model.rules.map((r) => toModelItem(r, root)),
    agents: model.agents.map((a) => toModelItem(a, root)),
    commands: model.commands.map((c) => toModelItem(c, root)),
    mcp,
    hooks,
    env,
    plugins,
    permissions,
    settings: model.settings,
    issues: model.issues.map((i) => ({ level: i.level, file: path.relative(root, i.file), message: i.message })),
    counts: {
      rules: model.rules.length,
      agents: model.agents.length,
      commands: model.commands.length,
      connections: mcp ? Object.keys(mcp.servers).length : 0,
      hooks: model.hooks ? Object.keys(model.hooks.events).length : 0,
      env: env ? Object.keys(env).length : 0,
      plugins: plugins ? plugins.enabledPlugins.length : 0,
      permissions: permissionsCount(model.permissions),
      settings: (model.settings.claude ? Object.keys(model.settings.claude).length : 0) + (model.settings.codex ? Object.keys(model.settings.codex).length : 0),
    },
  }
}

/* ── detection ───────────────────────────────────────────────────────────── */

function buildDetectionRows(rows, plan, statusRows) {
  const fallback = splitDetected(rows)
  const enabledSet = new Set(plan?.targets ?? fallback.enabled)
  const proposedSet = new Set(plan?.proposed ?? fallback.proposed)
  return rows.map((r) => ({
    target: r.target,
    repo: r.repo,
    bin: r.bin,
    enabled: enabledSet.has(r.target),
    proposed: proposedSet.has(r.target),
    supports: SUPPORTS[r.target] ?? [],
    outputs: statusRows.filter((s) => s.target === r.target).map((s) => s.path),
  }))
}

/* ── trust gates ─────────────────────────────────────────────────────────── */

// Grounded in src/targets/codex.js's own warnings and src/explain.js's
// TARGETS[*].nuances — codex has two DISTINCT gates (directory trust covers
// the exec-policy rules file; hooks additionally need an explicit /hooks
// accept), claude has one (folder trust, gating the whole shared settings
// file). Gate names are not invented — they are the runtimes' own prompts.
function computeTrustGates(plan, statusRows) {
  const generatesPath = (p) => plan?.generates?.some((g) => g.path === p) ?? false
  const statusHasPath = (p) => statusRows.some((s) => s.path === p)
  const cleanHas = (target, category) => plan?.clean?.some((c) => c.target === target && c.category === category) ?? false

  const claudeSettings = '.claude/settings.json'
  const codexRules = '.codex/rules/meta-harness.rules'
  const codexHooks = '.codex/hooks.json'

  return [
    {
      target: 'claude',
      gate: 'folder trust',
      relevant:
        generatesPath(claudeSettings) ||
        statusHasPath(claudeSettings) ||
        ['hooks', 'env', 'plugins', 'permissions', 'settings'].some((cat) => cleanHas('claude', cat)),
      blocks: [claudeSettings],
      hint: 'Open this folder in Claude Code once and accept the folder-trust prompt — until then hooks, env, permissions, and plugins in .claude/settings.json are inert.',
    },
    {
      target: 'codex',
      gate: 'directory trust',
      relevant: generatesPath(codexRules) || statusHasPath(codexRules) || cleanHas('codex', 'permissions'),
      blocks: [codexRules],
      hint: 'Run `codex` in this directory once and accept the trust prompt — until then .codex/rules/meta-harness.rules (your permission rules) is not enforced.',
    },
    {
      target: 'codex',
      gate: '/hooks accept',
      relevant: generatesPath(codexHooks) || statusHasPath(codexHooks) || cleanHas('codex', 'hooks'),
      blocks: [codexHooks],
      hint: 'Run `codex` here, open /hooks, and accept the entries — until then .codex/hooks.json does not fire.',
    },
  ]
}

/* ── snapshot (the expensive call) ───────────────────────────────────────── */

export function getSnapshot(root) {
  const t0 = Date.now()
  const cfg = loadConfig(root)
  const configured = fs.existsSync(path.join(root, 'meta-harness.jsonc'))
  const sourceExists = fs.existsSync(path.join(root, cfg.sourceDir))

  // Both sections can fail independently (and for unrelated reasons — a
  // malformed rule file vs. an unreadable connections.jsonc) so their
  // messages are joined rather than letting the second silently overwrite
  // or lose the first.
  const errors = []
  let plan = null
  try {
    plan = syncPlan(root)
    delete plan.sourceWrites
  } catch (e) {
    errors.push(e.message)
  }

  let model = null
  if (sourceExists) {
    try {
      model = reshapeModel(loadModel(path.join(root, cfg.sourceDir)), root)
    } catch (e) {
      errors.push(e.message)
    }
  }
  const error = errors.length ? errors.join('; ') : null

  // detectTargets is pure fs.existsSync + PATH lookups (src/detect.js) —
  // nothing here is expected to throw, so a throw is left to propagate
  // rather than being hidden behind an empty (and misleadingly "nothing
  // detected") array.
  const detectionRows = detectTargets(root)

  const statusAttributed = attributeStatusRows(root, getManifestStatus(root))
  const detection = buildDetectionRows(detectionRows, plan, statusAttributed)
  const drift = getDriftReport(root)
  const trustGates = computeTrustGates(plan, statusAttributed)

  return {
    root,
    sourceDir: cfg.sourceDir,
    configured,
    sourceExists,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    plan,
    model,
    detection,
    status: statusAttributed,
    drift,
    trustGates,
    error,
  }
}

/* ── static reference ───────────────────────────────────────────────────── */

export function getReference() {
  return {
    categories: CATEGORIES,
    targets: TARGETS,
    knownTargets: KNOWN_TARGETS,
    canonicalEvents: CANONICAL_EVENTS,
  }
}

/* ── roots ───────────────────────────────────────────────────────────────── */

export function getRoots(serverRoot, dashboardDir) {
  const roots = [
    {
      path: serverRoot,
      label: path.basename(serverRoot) || serverRoot,
      configured: fs.existsSync(path.join(serverRoot, 'meta-harness.jsonc')),
    },
  ]
  const fixturesDir = path.join(dashboardDir, 'fixtures')
  if (fs.existsSync(fixturesDir)) {
    for (const name of fs.readdirSync(fixturesDir).sort()) {
      const abs = path.join(fixturesDir, name)
      if (!fs.statSync(abs).isDirectory() || abs === serverRoot) continue
      roots.push({ path: abs, label: name, configured: fs.existsSync(path.join(abs, 'meta-harness.jsonc')) })
    }
  }
  return { roots }
}
