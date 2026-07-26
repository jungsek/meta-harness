import path from 'node:path'
import matter from 'gray-matter'
import { flattenHookDefs, resolveEvents, resolveServers, wants } from '../model.js'

// Cursor hook events are camelCase versions of the canonical PascalCase set.
const EVENT_MAP = {
  SessionStart: 'sessionStart',
  SessionEnd: 'sessionEnd',
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
  PostToolUseFailure: 'postToolUseFailure',
  UserPromptSubmit: 'beforeSubmitPrompt',
  Stop: 'stop',
  SubagentStart: 'subagentStart',
  SubagentStop: 'subagentStop',
  PreCompact: 'preCompact',
}

// ${VAR} → ${env:VAR} in string values (cursor's env-ref syntax).
const envRefs = (x) => JSON.parse(JSON.stringify(x).replace(/\$\{(\w+)\}/g, '${env:$1}'))

// .mdc frontmatter is hand-rolled: cursor requires unquoted comma-joined globs.
function mdc(rule) {
  const c = rule.fm.cursor ?? {}
  const globs = c.globs ?? rule.fm.globs ?? rule.fm.paths ?? []
  const lines = ['---']
  const alwaysApply = c.alwaysApply ?? (globs.length === 0 ? true : undefined)
  if (alwaysApply !== undefined) lines.push(`alwaysApply: ${alwaysApply}`)
  if (rule.fm.description) lines.push(`description: ${rule.fm.description.replace(/\n+/g, ' ').trim()}`)
  if (globs.length) lines.push(`globs: ${globs.join(',')}`)
  lines.push('---', '', rule.body, '')
  return lines.join('\n')
}

export default {
  name: 'cursor',
  emit(model, ctx) {
    const out = []

    for (const r of model.rules.filter((r) => wants(r, 'cursor')))
      out.push({
        category: 'rules',
        path: path.join('.cursor/rules', `${path.basename(r.file, '.md')}.mdc`),
        content: mdc(r),
      })

    for (const c of model.commands.filter((c) => wants(c, 'cursor'))) {
      const fm = { ...(c.fm.description ? { description: c.fm.description } : {}), ...(c.fm.cursor ?? {}) }
      out.push({
        category: 'commands',
        path: path.join('.cursor/commands', `${c.name}.md`),
        content: Object.keys(fm).length ? matter.stringify(`\n${c.body}\n`, fm) : c.body + '\n',
      })
    }

    for (const a of model.agents.filter((a) => wants(a, 'cursor'))) {
      const fm = { name: a.name, description: a.shared.description, ...(a.perTarget.cursor ?? {}) }
      out.push({
        category: 'agents',
        path: path.join('.cursor/agents', `${a.name}.md`),
        content: matter.stringify(`\n${a.body}\n`, fm),
      })
    }

    if (model.mcp)
      out.push({
        category: 'connections',
        sharedFile: '.cursor/mcp.json',
        format: 'json',
        data: { mcpServers: envRefs(resolveServers(model.mcp, 'cursor')) },
      })

    if (model.hooks) {
      const events = resolveEvents(model.hooks, 'cursor', Object.keys(EVENT_MAP), ctx.warnings)
      const hooks = {}
      for (const [ev, entries] of Object.entries(events)) {
        const defs = flattenHookDefs(entries).filter((d) => d.type === 'command' || d.type === 'prompt')
        if (defs.length) hooks[EVENT_MAP[ev]] = defs
      }
      if (Object.keys(hooks).length)
        out.push({
          category: 'hooks',
          path: '.cursor/hooks.json',
          content: JSON.stringify({ version: 1, hooks }, null, 2) + '\n',
        })
    }

    return out
  },
}
