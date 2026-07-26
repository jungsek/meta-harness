import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { parse as parseToml } from 'smol-toml'
import { listMd, readIf, readJsonc } from './util.js'

export const KNOWN_TARGETS = ['claude', 'codex', 'agents', 'cursor', 'opencode', 'hermes']

// Canonical hook events: PascalCase (both major runtimes use it natively).
// Each target module declares which subset it supports.
export const CANONICAL_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'UserPromptSubmit',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'PermissionRequest',
  'PermissionDenied',
  'Setup',
  'SessionCompact',
]

const err = (issues, file, message) => issues.push({ level: 'error', file, message })
const warn = (issues, file, message) => issues.push({ level: 'warn', file, message })

function validTargets(targets, file, issues) {
  if (!Array.isArray(targets) || targets.length === 0) {
    err(issues, file, `targets must be a non-empty array`)
    return ['*']
  }
  for (const t of targets)
    if (t !== '*' && !KNOWN_TARGETS.includes(t))
      err(issues, file, `unknown target "${t}" (known: * ${KNOWN_TARGETS.join(' ')})`)
  return targets
}

function parseMdDir(srcDir, sub, issues) {
  const seen = new Map()
  const out = []
  for (const file of listMd(path.join(srcDir, sub))) {
    let parsed
    try {
      parsed = matter(fs.readFileSync(file, 'utf8'))
    } catch (e) {
      err(issues, file, `frontmatter parse failed: ${e.message}`)
      continue
    }
    const { targets = ['*'], ...fm } = parsed.data
    const name = fm.name ?? path.basename(file, '.md')
    if (seen.has(name)) err(issues, file, `duplicate ${sub} name "${name}" (also ${seen.get(name)})`)
    seen.set(name, file)
    out.push({ name, file, targets: validTargets(targets, file, issues), fm, body: parsed.content.trim() })
  }
  return out
}

// Subagents: shared frontmatter + optional per-target override blocks.
function parseAgents(srcDir, issues) {
  return parseMdDir(srcDir, 'agents', issues).map((a) => {
    const perTarget = {}
    const shared = {}
    for (const [k, v] of Object.entries(a.fm)) {
      if (KNOWN_TARGETS.includes(k)) perTarget[k] = v ?? {}
      else shared[k] = v
    }
    if (!shared.description) warn(issues, a.file, `agent "${a.name}" has no description`)
    return { ...a, shared, perTarget }
  })
}

function parseMcp(srcDir, issues) {
  const file = path.join(srcDir, 'connections/mcp.jsonc')
  let raw
  try {
    raw = readJsonc(file)
  } catch (e) {
    err(issues, file, e.message)
    return null
  }
  if (!raw) return null
  const servers = raw.mcpServers ?? {}
  for (const [name, s] of Object.entries(servers)) {
    if (s === null || typeof s !== 'object') {
      err(issues, file, `server "${name}": must be an object`)
      delete servers[name]
    } else if (!s.command && !s.url) warn(issues, file, `server "${name}": neither command nor url set`)
  }
  const perTarget = {}
  for (const t of KNOWN_TARGETS) {
    if (raw[t]?.mcpServers) perTarget[t] = raw[t].mcpServers
    // legacy shape from spec v0.2: codex.mcp_servers
    else if (t === 'codex' && raw.codex?.mcp_servers) perTarget.codex = raw.codex.mcp_servers
  }
  return { servers, perTarget, file }
}

// Resolve the server map for one target: per-target entries replace wholesale;
// null deletes the shared server for that target.
export function resolveServers(mcp, target) {
  const out = { ...mcp.servers }
  for (const [name, v] of Object.entries(mcp.perTarget[target] ?? {})) {
    if (v === null) delete out[name]
    else out[name] = v
  }
  return out
}

function parseHooks(srcDir, issues) {
  const file = path.join(srcDir, 'hooks/hooks.jsonc')
  let raw
  try {
    raw = readJsonc(file)
  } catch (e) {
    err(issues, file, e.message)
    return null
  }
  if (!raw) return null
  const shared = raw.hooks ?? {}
  const perTarget = {}
  for (const t of KNOWN_TARGETS) if (raw[t]?.hooks) perTarget[t] = raw[t].hooks
  for (const events of [shared, ...Object.values(perTarget)])
    for (const ev of Object.keys(events))
      if (!CANONICAL_EVENTS.includes(ev))
        warn(issues, file, `unknown hook event "${ev}" (canonical events are PascalCase, e.g. PreToolUse)`)
  return { events: shared, perTarget, file }
}

// Events for one target, filtered to its supported set; unsupported → warning.
export function resolveEvents(hooks, target, supported, warnings) {
  const source = hooks.perTarget[target] ?? hooks.events
  const out = {}
  for (const [ev, defs] of Object.entries(source)) {
    if (supported.includes(ev)) out[ev] = defs
    else warnings.push(`hooks: event "${ev}" not supported by ${target} — skipped`)
  }
  return out
}

// Canonical hook entries are Claude-shaped: [{matcher?, hooks: [{type, command, timeout?}]}].
// Flatten to per-def objects for targets with flat hook arrays.
export function flattenHookDefs(entries) {
  const out = []
  for (const e of entries ?? [])
    for (const h of e.hooks ?? [])
      out.push({ ...h, ...(e.matcher ? { matcher: e.matcher } : {}) })
  return out
}

function parseEnv(srcDir, issues) {
  const file = path.join(srcDir, 'env/env.jsonc')
  try {
    const raw = readJsonc(file)
    if (!raw) return null
    return { vars: raw.vars ?? {}, perTarget: raw, file }
  } catch (e) {
    err(issues, file, e.message)
    return null
  }
}

export function loadModel(srcDir) {
  const issues = []
  const model = {
    rules: parseMdDir(srcDir, 'rules', issues),
    agents: parseAgents(srcDir, issues),
    commands: parseMdDir(srcDir, 'commands', issues),
    workflows: parseMdDir(srcDir, 'workflows', issues),
    mcp: parseMcp(srcDir, issues),
    hooks: parseHooks(srcDir, issues),
    env: parseEnv(srcDir, issues),
    plugins: null,
    settings: { claude: null, codex: null },
    issues,
  }
  const pluginsFile = path.join(srcDir, 'plugins/plugins.jsonc')
  try {
    const p = readJsonc(pluginsFile)
    if (p) model.plugins = { enabledPlugins: p.enabledPlugins ?? [], file: pluginsFile }
  } catch (e) {
    err(issues, pluginsFile, e.message)
  }
  const clFile = path.join(srcDir, 'settings/claude.settings.jsonc')
  try {
    model.settings.claude = readJsonc(clFile)
  } catch (e) {
    err(issues, clFile, e.message)
  }
  const cxFile = path.join(srcDir, 'settings/codex.config.toml')
  const cxRaw = readIf(cxFile)
  if (cxRaw !== null) {
    try {
      model.settings.codex = parseToml(cxRaw)
    } catch (e) {
      err(issues, cxFile, `invalid TOML: ${e.message}`)
    }
  }
  return model
}

export const wants = (item, target) => item.targets.includes('*') || item.targets.includes(target)
