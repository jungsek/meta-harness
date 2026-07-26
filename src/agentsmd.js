// AGENTS.md is the only channel through which prose rules reach Codex and
// Hermes (Codex parses .codex/rules/*.rules as Starlark exec policy, not
// instructions). Rather than generate the whole file — it is an identity file
// people write themselves — meta-harness owns one marker-delimited block and
// leaves everything around it untouched. Same ownership model as the shared
// JSON/TOML files: own a region, preserve the rest, hash only what we own.

import { wants } from './model.js'

export const START = '<!-- meta-harness:start -->'
export const END = '<!-- meta-harness:end -->'

// Targets with no rules channel of their own; they read AGENTS.md natively.
export const AGENTS_MD_TARGETS = ['codex', 'hermes']

export const blockBody = (rules) =>
  [
    START,
    '<!-- Generated from your meta-harness rules. Edit them there, not here;',
    '     anything outside this block is yours and is never touched. -->',
    '',
    ...rules.map((r) => r.body.trim()).flatMap((b) => [b, '']),
    END,
  ].join('\n')

// Splice the block into whatever the user already has.
export function spliceBlock(existing, block) {
  if (existing === null) return `${block}\n`
  const s = existing.indexOf(START)
  const e = existing.indexOf(END)
  if (s !== -1 && e !== -1 && e > s) return existing.slice(0, s) + block + existing.slice(e + END.length)
  // No block yet — append, keeping their prose first since it's the file's point.
  return `${existing.trimEnd()}\n\n${block}\n`
}

export const extractBlock = (raw) => {
  const s = raw.indexOf(START)
  const e = raw.indexOf(END)
  return s !== -1 && e !== -1 && e > s ? raw.slice(s, e + END.length) : null
}

// One output, regardless of how many AGENTS.md-reading targets are enabled —
// emitting per target would collide on the same file.
export function emitAgentsMd(model, targetNames) {
  if (!targetNames.some((t) => AGENTS_MD_TARGETS.includes(t))) return []
  const rules = model.rules.filter((r) => targetNames.some((t) => AGENTS_MD_TARGETS.includes(t) && wants(r, t)))
  if (!rules.length) return []
  // `root: true` leads the file. Identity ("you are the orchestrator, this is
  // the source of truth") only does its job if it is read before the rules it
  // frames, and filename ordering is too implicit to rely on for that.
  const ordered = [...rules.filter((r) => r.fm.root), ...rules.filter((r) => !r.fm.root)]
  return [{ category: 'rules', path: 'AGENTS.md', markerFile: true, block: blockBody(ordered) }]
}
