import path from 'node:path'
import matter from 'gray-matter'
import { resolveEvents, resolveServers, wants } from '../model.js'
import { toClaudePermissions } from '../permissions.js'

// https://code.claude.com/docs/en/hooks#hook-events
const EVENTS = [
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
]

export default {
  name: 'claude',
  emit(model, ctx) {
    const out = []
    const link = (category, dir) => (item) =>
      out.push({ category, path: path.join(dir, path.basename(item.file)), symlinkTo: item.file })

    model.rules.filter((r) => wants(r, 'claude')).forEach(link('rules', '.claude/rules'))
    model.commands.filter((c) => wants(c, 'claude')).forEach(link('commands', '.claude/commands'))

    for (const a of model.agents.filter((a) => wants(a, 'claude'))) {
      const fm = { name: a.name, ...a.shared, ...(a.perTarget.claude ?? {}) }
      out.push({
        category: 'agents',
        path: path.join('.claude/agents', `${a.name}.md`),
        content: matter.stringify(`\n${a.body}\n`, fm),
      })
    }

    if (model.mcp)
      out.push({
        category: 'connections',
        path: '.mcp.json',
        content: JSON.stringify({ mcpServers: resolveServers(model.mcp, 'claude') }, null, 2) + '\n',
      })

    const frag = (category, data) =>
      out.push({ category, sharedFile: '.claude/settings.json', format: 'json', data })

    if (model.env) frag('env', { env: { ...model.env.vars, ...(model.env.perTarget.claude?.env ?? {}) } })
    if (model.hooks) {
      const events = resolveEvents(model.hooks, 'claude', EVENTS, ctx.warnings)
      if (Object.keys(events).length) frag('hooks', { hooks: events })
    }
    if (model.plugins) frag('plugins', { enabledPlugins: model.plugins.enabledPlugins })
    if (model.permissions) {
      const p = toClaudePermissions(model.permissions)
      if (Object.keys(p).length) frag('permissions', { permissions: p })
      if (model.permissions.native.claude) frag('permissions', model.permissions.native.claude)
    }
    if (model.settings.claude) frag('settings', model.settings.claude)

    return out
  },
}
