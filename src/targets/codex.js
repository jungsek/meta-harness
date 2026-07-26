import fs from 'node:fs'
import path from 'node:path'
import { stringify as stringifyToml } from 'smol-toml'
import { resolveEvents, resolveServers, wants } from '../model.js'

const EVENTS = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'PermissionRequest',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
]

const NAME_OK = /^[a-zA-Z0-9_-]+$/
const FIELD_MAP = { enabledTools: 'enabled_tools', disabledTools: 'disabled_tools', envVars: 'env_vars' }

// Canonical (Claude-style) server map → Codex [mcp_servers] dialect.
function toCodexServers(servers, warnings) {
  const out = {}
  for (const [name, cfg] of Object.entries(servers)) {
    if (!NAME_OK.test(name)) {
      warnings.push(`mcp: server "${name}" skipped for codex — name must match [a-zA-Z0-9_-]+`)
      continue
    }
    const s = {}
    for (const [k, v] of Object.entries(cfg)) {
      if (k === 'type') continue // codex infers transport from command/url
      else if (k === 'disabled') {
        if (v === true) s.enabled = false
      } else if (k === 'oauth' && v && typeof v === 'object') {
        s.oauth = typeof v.clientId === 'string' && !v.client_id ? { ...v, client_id: v.clientId } : v
      } else if (FIELD_MAP[k]) s[FIELD_MAP[k]] = v
      else if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
        // empty tables (e.g. env = {}) are rejected by codex for remote transports
      } else s[k] = v
    }
    if (Object.keys(s).length === 0) {
      warnings.push(`mcp: server "${name}" empty after codex conversion — dropped`)
      continue
    }
    out[name] = s
  }
  return out
}

export default {
  name: 'codex',
  emit(model, ctx) {
    const out = []

    // rules → AGENTS.md is hand-authored (ratified); codex project rules skipped.
    // commands → codex custom prompts are global-only; skipped at project scope.
    // Codex reads rules only via AGENTS.md. Without one, every rule silently
    // misses this target — worth saying out loud, since nothing else reveals it.
    if (model.rules.some((r) => wants(r, 'codex')) && !fs.existsSync(path.join(ctx.root, 'AGENTS.md')))
      ctx.warnings.push(
        'codex: no AGENTS.md at the project root — Codex reads rules from it, so your rules do not reach Codex. Write one by hand (it is deliberately not generated).'
      )

    for (const a of model.agents.filter((a) => wants(a, 'codex'))) {
      const toml = { name: a.name, ...a.shared, ...(a.perTarget.codex ?? {}) }
      out.push({
        category: 'agents',
        path: path.join('.codex/agents', `${a.name}.toml`),
        content: stringifyToml(toml) + `\ndeveloper_instructions = '''\n${a.body}\n'''\n`,
      })
    }

    if (model.mcp)
      out.push({
        category: 'connections',
        sharedFile: '.codex/config.toml',
        format: 'toml',
        data: { mcp_servers: toCodexServers(resolveServers(model.mcp, 'codex'), ctx.warnings) },
      })

    if (model.hooks) {
      const events = resolveEvents(model.hooks, 'codex', EVENTS, ctx.warnings)
      if (Object.keys(events).length)
        out.push({
          category: 'hooks',
          path: '.codex/hooks.json',
          content: JSON.stringify({ hooks: events }, null, 2) + '\n',
        })
    }

    if (model.env)
      out.push({
        category: 'env',
        sharedFile: '.codex/config.toml',
        format: 'toml',
        data: {
          shell_environment_policy: {
            set: model.env.vars,
            ...(model.env.perTarget.codex?.shell_environment_policy ?? {}),
          },
        },
      })

    if (model.settings.codex)
      out.push({ category: 'settings', sharedFile: '.codex/config.toml', format: 'toml', data: model.settings.codex })

    return out
  },
}
