// Human-readable view of the SOURCE (not the outputs — that's `status`).
// Derived at read time, so it cannot go stale the way a checked-in summary would.

const targetNote = (item) => (item.targets.includes('*') ? '' : ` [${item.targets.join(', ')} only]`)

const firstLine = (s) => (s ?? '').split('\n')[0].trim()

function section(title, rows) {
  if (!rows.length) return []
  const w = Math.min(Math.max(...rows.map(([n]) => n.length)), 20)
  return [`${title} (${rows.length})`, ...rows.map(([n, d]) => `  ${n.padEnd(w)}  ${d}`), '']
}

const named = (items) =>
  items.map((i) => [i.name + targetNote(i), firstLine(i.fm?.description ?? i.shared?.description) || '—'])

export function show(model, cfg, bold) {
  const out = [`${bold('source')}   ${cfg.sourceDir}`, `${bold('targets')}  ${cfg.targets.join(', ')}`, '']

  out.push(...section('rules', named(model.rules)))
  out.push(...section('subagents', named(model.agents)))
  out.push(...section('commands', named(model.commands)))

  if (model.mcp) {
    const rows = Object.entries(model.mcp.servers).map(([n, s]) => [n, s.url ?? s.command ?? '—'])
    const overridden = Object.keys(model.mcp.perTarget)
    out.push(...section('connections', rows))
    if (overridden.length) out.push(`  ${bold('overrides')} ${overridden.join(', ')}`, '')
  }

  if (model.hooks) {
    const rows = Object.entries(model.hooks.events).map(([ev, entries]) => {
      const n = (entries ?? []).reduce((a, e) => a + (e.hooks?.length ?? 0), 0)
      return [ev, `${n} command${n === 1 ? '' : 's'}`]
    })
    out.push(...section('hooks', rows))
  }

  if (model.env) out.push(...section('env', Object.entries(model.env.vars).map(([k, v]) => [k, String(v)])))
  if (model.plugins?.enabledPlugins?.length)
    out.push(...section('plugins', model.plugins.enabledPlugins.map((p) => [p, ''])))

  const settings = []
  if (model.settings.claude) settings.push(['claude', Object.keys(model.settings.claude).sort().join(', ')])
  if (model.settings.codex) settings.push(['codex', Object.keys(model.settings.codex).sort().join(', ')])
  out.push(...section('settings', settings))

  if (out.length === 3) out.push('(empty harness — nothing defined yet)')
  return out.join('\n')
}
