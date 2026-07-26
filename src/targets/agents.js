import path from 'node:path'
import matter from 'gray-matter'
import { wants } from '../model.js'

// The .agents/ directory (AGENTS.md ecosystem / Agent Skills standard layout).
// Rules reach these runtimes via AGENTS.md itself (agentsmd.js). Skills are
// owned by `npx skills add`, never touched here.

export default {
  name: 'agents',
  emit(model) {
    const out = []

    for (const c of model.commands.filter((c) => wants(c, 'agents')))
      out.push({
        category: 'commands',
        path: path.join('.agents/commands', `${c.name}.md`),
        content: c.fm.description ? matter.stringify(`\n${c.body}\n`, { description: c.fm.description }) : c.body + '\n',
      })

    for (const a of model.agents.filter((a) => wants(a, 'agents'))) {
      const fm = { name: a.name, ...(a.shared.description ? { description: a.shared.description } : {}) }
      out.push({
        category: 'agents',
        path: path.join('.agents/subagents', `${a.name}.md`),
        content: matter.stringify(`\n${a.body}\n`, fm),
      })
    }

    return out
  },
}
