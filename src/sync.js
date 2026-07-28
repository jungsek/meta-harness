// sync — reconcile lived-in native config with the source dir, then re-emit.
//
// `generate` is one-way: source → native, and refuses when native drifted.
// `sync` closes the loop. The manifest is the merge base for a three-way
// compare per item (SYNC-PLAN §1):
//
//   native == base, source != base   → forward generate (source wins)
//   native != base, source == base   → fold native back into source (import)
//   native != base, source != base   → conflict (exit 1 unless --prefer)
//   native not in the manifest       → import (this is the asymmetry heal:
//                                       an item hand-written into one target
//                                       reaches every other target)
//
// Item granularity is per server / event / var / key / file. The *baseline*
// half of the compare is per file, because that is all the manifest stores —
// one hash (or one owned-key hash) per output. So when both halves of a file
// moved, every item that differs is reported as a conflict rather than
// guessed at. Conservative on purpose: `--prefer` is one flag, silently
// discarding someone's edit is unrecoverable.
//
// ponytail: file-level baseline, item-level report. Per-item baselines would
// need a new manifest shape — add that only if the conflict noise is real.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import matter from 'gray-matter'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { detectTargets, detectedNames } from './detect.js'
import { discover, generate, loadConfig, loadManifest } from './engine.js'
import { KNOWN_TARGETS } from './model.js'
import {
  canonicalJson,
  isLink,
  parseJsonc,
  pick,
  readIf,
  relSymlink,
  sha256,
  sortKeys,
  writeFileEnsured,
} from './util.js'

// Full backward translation. Everything else is inventory-only (§2) — found
// and reported, never silently skipped.
const SUPPORTED = ['claude', 'codex']

const FORMATS = {
  json: (raw) => JSON.parse(raw),
  jsonc: (raw, rel) => parseJsonc(raw, rel),
  toml: (raw) => parseToml(raw),
}

const eq = (a, b) => canonicalJson(a) === canonicalJson(b)
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const ownedHashOf = (data, keys) => sha256(canonicalJson(pick(data, keys)))

// a ⊆ b. Forward dialects are lossy (codex drops `type`, empty tables, …), so
// the same item read back from two targets is not a disagreement when one is
// a strict subset of the other — it is the lossier target's copy.
function subsetOf(a, b) {
  if (!isObj(a) || !isObj(b)) return eq(a, b)
  return Object.entries(a).every(([k, v]) => k in b && (isObj(v) ? subsetOf(v, b[k]) : eq(v, b[k])))
}

function readNative(root, rel, format) {
  const raw = readIf(path.join(root, rel))
  if (raw === null) return null
  try {
    return { raw, data: FORMATS[format](raw, rel) ?? {} }
  } catch (e) {
    // §7.3: no data-loss path. An unreadable native file is exactly the case
    // where guessing costs someone their config — abort, name the file.
    throw new Error(
      `${rel}: cannot parse (${e.message}) — sync will not import or overwrite config it cannot read. Fix the file (or move it aside) and rerun.`
    )
  }
}

/* ── native → items ─────────────────────────────────────────────────────── */

const splitMcp = (d) =>
  Object.entries(d.mcpServers ?? {}).map(([name, value]) => ({ category: 'connections', name, value }))

function splitClaudeSettings(d) {
  const out = []
  for (const [k, v] of Object.entries(d)) {
    if (k === 'hooks') for (const [name, value] of Object.entries(v ?? {})) out.push({ category: 'hooks', name, value })
    else if (k === 'env') for (const [name, value] of Object.entries(v ?? {})) out.push({ category: 'env', name, value })
    else if (k === 'enabledPlugins')
      for (const [name, value] of Object.entries(Array.isArray(v) ? Object.fromEntries(v.map((p) => [p, true])) : (v ?? {})))
        out.push({ category: 'plugins', name, value })
    else if (k === 'permissions')
      for (const [name, value] of Object.entries(v ?? {})) out.push({ category: 'permissions', name, value })
    else out.push({ category: 'settings', name: k, value: v })
  }
  return out
}

// Codex approval_policy / sandbox_mode are permission concepts with no
// portable form — they belong in permissions/ next to the rules they modify
// (src/permissions.js says so), not adrift in settings/.
const CODEX_PERMISSION_KEYS = ['approval_policy', 'sandbox_mode']

function splitCodexConfig(d) {
  const out = []
  for (const [k, v] of Object.entries(d)) {
    if (k === 'mcp_servers')
      for (const [name, value] of Object.entries(v ?? {})) out.push({ category: 'connections', name, value })
    else if (k === 'shell_environment_policy')
      for (const [pk, pv] of Object.entries(v ?? {})) {
        if (pk === 'set') for (const [name, value] of Object.entries(pv ?? {})) out.push({ category: 'env', name, value })
        else out.push({ category: 'env', name: `policy.${pk}`, value: pv })
      }
    else if (CODEX_PERMISSION_KEYS.includes(k)) out.push({ category: 'permissions', name: k, value: v })
    else out.push({ category: 'settings', name: k, value: v })
  }
  return out
}

const SURFACES = {
  claude: [
    { file: '.mcp.json', format: 'json', split: splitMcp },
    { file: '.claude/settings.json', format: 'json', split: splitClaudeSettings },
  ],
  codex: [
    { file: '.codex/config.toml', format: 'toml', split: splitCodexConfig },
    {
      file: '.codex/hooks.json',
      format: 'json',
      split: (d) => Object.entries(d.hooks ?? {}).map(([name, value]) => ({ category: 'hooks', name, value })),
    },
  ],
}

const DIR_SURFACES = {
  claude: [
    { dir: '.claude/commands', category: 'commands', ext: '.md' },
    { dir: '.claude/agents', category: 'agents', ext: '.md' },
  ],
  codex: [{ dir: '.codex/agents', category: 'agents', ext: '.toml' }],
}

// Native config a later version will import; listed so the report can say
// "found, not yet importable" instead of pretending it isn't there.
const INVENTORY = {
  cursor: ['.cursor/mcp.json', '.cursor/hooks.json', '.cursor/rules', '.cursor/commands', '.cursor/agents'],
  opencode: ['opencode.json', '.opencode'],
  hermes: ['.hermes'],
}

const index = (items) => new Map(items.map((i) => [`${i.category}/${i.name}`, i]))

function dataItems(ctx, target, { file, format, split }) {
  const native = readNative(ctx.root, file, format)
  if (!native) return []
  const exp = ctx.expected.get(file)
  const expData = exp ? (exp.shared ? exp.data : FORMATS[format](exp.content, file)) : {}
  const entry = ctx.manifest.files[file]
  const tracked = Boolean(entry)
  const nativeChanged = !tracked
    ? true
    : entry.ownedKeys
      ? ownedHashOf(native.data, entry.ownedKeys) !== entry.ownedHash
      : sha256(native.raw) !== entry.hash
  const sourceChanged = !tracked
    ? true
    : entry.ownedKeys
      ? ownedHashOf(expData, exp?.keys ?? []) !== entry.ownedHash
      : sha256(exp ? exp.content : '') !== entry.hash
  const expIdx = index(split(expData))
  return split(native.data).map((item) => {
    const e = expIdx.get(`${item.category}/${item.name}`)
    return {
      target,
      file,
      category: item.category,
      name: item.name,
      value: item.value,
      expected: e?.value,
      hasExpected: Boolean(e),
      tracked,
      nativeChanged,
      sourceChanged,
    }
  })
}

function fileItems(ctx, target, { dir, category, ext }) {
  const abs = path.join(ctx.root, dir)
  if (!fs.existsSync(abs)) return []
  const out = []
  for (const name of fs.readdirSync(abs).sort()) {
    if (!name.endsWith(ext)) continue
    const rel = path.join(dir, name)
    const p = path.join(abs, name)
    const entry = ctx.manifest.files[rel]
    if (isLink(p)) {
      // Ours (commands are symlinked into the source) or the user's own link
      // to a file we don't own. Either way there is nothing to import.
      if (!entry) ctx.warnings.push(`${rel}: symlink meta-harness did not write — left alone, not imported`)
      continue
    }
    const exp = ctx.expected.get(rel)
    const expected = exp ? (exp.content ?? readIf(exp.symlinkTo) ?? undefined) : undefined
    const raw = fs.readFileSync(p, 'utf8')
    const tracked = Boolean(entry)
    out.push({
      target,
      file: rel,
      category,
      name: path.basename(name, ext),
      value: raw,
      expected,
      hasExpected: expected !== undefined,
      tracked,
      // A manifest symlink entry against a real file means someone replaced
      // our link with their own file: native changed, by definition.
      nativeChanged: !tracked ? true : entry.symlink ? true : sha256(raw) !== entry.hash,
      // Symlinked outputs carry no content hash, so a source-side edit is
      // invisible to the manifest — treat source as unmoved and let the
      // native file fold back over it.
      sourceChanged: !tracked ? true : entry.symlink ? false : expected !== undefined && sha256(expected) !== entry.hash,
    })
  }
  return out
}

// CLAUDE.md that is only the generated @AGENTS.md import carries no prose.
const isStub = (raw) => /^\s*(<!--[^]*?-->\s*)*@AGENTS\.md\s*$/.test(raw)

function rulesItems(ctx) {
  const out = []
  for (const rel of ['AGENTS.md', 'CLAUDE.md']) {
    const raw = readIf(path.join(ctx.root, rel))
    if (raw === null) continue
    const entry = ctx.manifest.files[rel]
    if (rel === 'CLAUDE.md' && !entry && isStub(raw)) continue
    const expected = ctx.expected.get(rel)?.content
    const tracked = Boolean(entry)
    out.push({
      target: rel === 'CLAUDE.md' ? 'claude' : 'shared',
      file: rel,
      category: 'rules',
      name: rel,
      value: raw,
      expected,
      hasExpected: expected !== undefined,
      tracked,
      nativeChanged: !tracked ? true : sha256(raw) !== entry.hash,
      sourceChanged: !tracked ? true : expected !== undefined && sha256(expected) !== entry.hash,
    })
  }
  return out
}

function scan(ctx) {
  const items = []
  for (const target of SUPPORTED) {
    if (!ctx.enabled.includes(target)) continue
    for (const spec of SURFACES[target]) items.push(...dataItems(ctx, target, spec))
    for (const spec of DIR_SURFACES[target]) items.push(...fileItems(ctx, target, spec))
  }
  return items.concat(rulesItems(ctx))
}

function inventory(ctx) {
  const out = []
  for (const [target, paths] of Object.entries(INVENTORY)) {
    for (const rel of paths) {
      const abs = path.join(ctx.root, rel)
      if (!fs.existsSync(abs)) continue
      const files = fs.statSync(abs).isDirectory() ? walk(abs).map((f) => path.join(rel, f)) : [rel]
      const untracked = files.filter((f) => !ctx.manifest.files[f] && !ctx.expected.has(f))
      if (untracked.length)
        out.push({
          target,
          path: rel,
          reason: `${target} config found (${untracked.length} file${untracked.length > 1 ? 's' : ''}) — backward translation is claude+codex only in this version, so it was left untouched`,
        })
    }
  }
  return out
}

function walk(dir, prefix = '') {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? path.join(prefix, e.name) : e.name
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel))
    else out.push(rel)
  }
  return out
}

function classify(it) {
  if (it.hasExpected && eq(it.value, it.expected)) return 'clean'
  // Native matches the baseline: whatever differs came from the source side,
  // including deletions. Forward generate owns it.
  if (it.tracked && !it.nativeChanged) return 'generate'
  if (!it.hasExpected) return 'new'
  if (!it.tracked || it.sourceChanged) return 'conflict'
  return 'changed'
}

/* ── items → source files (backward translation, §2) ────────────────────── */

const CODEX_FIELD_REV = { enabled_tools: 'enabledTools', disabled_tools: 'disabledTools', env_vars: 'envVars' }

// Reverse of toCodexServers in src/targets/codex.js.
function fromCodexServer(cfg) {
  const out = {}
  for (const [k, v] of Object.entries(cfg)) {
    if (k === 'enabled') {
      if (v === false) out.disabled = true
    } else if (CODEX_FIELD_REV[k]) out[CODEX_FIELD_REV[k]] = v
    else out[k] = v
  }
  return out
}

// Reverse of CLAUDE_TOOL in src/permissions.js.
const CLAUDE_TOOL_REV = { Bash: 'bash', Edit: 'edit', Read: 'read', Write: 'write', WebFetch: 'webfetch' }

function codexAgentToMd(raw) {
  const { developer_instructions: body = '', name, ...fm } = parseToml(raw)
  return matter.stringify(`\n${String(body).trim()}\n`, fm)
}

function foldAll(ctx, items) {
  const docs = new Map()
  const texts = new Map()
  const claims = new Map()
  const conflicts = []

  const doc = (rel, format) => {
    if (!docs.has(rel)) {
      const raw = readIf(path.join(ctx.root, ctx.cfg.sourceDir, rel))
      let data = {}
      if (raw !== null) {
        try {
          data = FORMATS[format](raw, rel) ?? {}
        } catch (e) {
          throw new Error(`${path.join(ctx.cfg.sourceDir, rel)}: cannot parse (${e.message}) — fix the source file and rerun`)
        }
      }
      docs.set(rel, { data, format })
    }
    return docs.get(rel).data
  }

  // One source slot, possibly claimed by two targets. Equal (or a lossy
  // subset) is a dedupe; a real disagreement is a conflict, per §2.
  const claim = (slot, value, it) => {
    const prev = claims.get(slot)
    if (!prev) {
      claims.set(slot, { value, target: it.target })
      return true
    }
    if (eq(prev.value, value) || subsetOf(value, prev.value)) return false
    if (subsetOf(prev.value, value)) {
      claims.set(slot, { value, target: it.target })
      return true
    }
    conflicts.push({
      target: it.target,
      category: it.category,
      name: it.name,
      source: prev.value,
      native: value,
      detail: `also imported from ${prev.target} with a different value — kept ${prev.target}'s`,
    })
    return false
  }

  for (const it of items) fold(it)

  function fold(it) {
    switch (it.category) {
      case 'connections': {
        const v = it.target === 'codex' ? fromCodexServer(it.value) : it.value
        const d = doc('connections/mcp.jsonc', 'jsonc')
        if (claim(`mcp:${it.name}`, v, it)) (d.mcpServers ??= {})[it.name] = v
        break
      }
      case 'hooks': {
        const d = doc('hooks/hooks.jsonc', 'jsonc')
        if (claim(`hook:${it.name}`, it.value, it)) (d.hooks ??= {})[it.name] = it.value
        break
      }
      case 'env': {
        const d = doc('env/env.jsonc', 'jsonc')
        if (it.name.startsWith('policy.')) {
          const k = it.name.slice('policy.'.length)
          if (claim(`envpolicy:${k}`, it.value, it)) ((d.codex ??= {}).shell_environment_policy ??= {})[k] = it.value
        } else if (claim(`env:${it.name}`, it.value, it)) (d.vars ??= {})[it.name] = it.value
        break
      }
      case 'plugins': {
        const d = doc('plugins/plugins.jsonc', 'jsonc')
        d.enabledPlugins ??= []
        if (it.value !== false && !d.enabledPlugins.includes(it.name)) d.enabledPlugins.push(it.name)
        break
      }
      case 'permissions':
        foldPermission(it)
        break
      case 'settings': {
        const rel = it.target === 'claude' ? 'settings/claude.settings.jsonc' : 'settings/codex.config.toml'
        const d = doc(rel, it.target === 'claude' ? 'jsonc' : 'toml')
        if (claim(`${it.target}-settings:${it.name}`, it.value, it)) d[it.name] = it.value
        break
      }
      case 'commands':
        putText(`commands/${it.name}.md`, it.value, it)
        break
      case 'agents':
        putText(`agents/${it.name}.md`, it.target === 'codex' ? codexAgentToMd(it.value) : it.value, it)
        break
      case 'rules':
        foldRules(it)
        break
    }
  }

  // Permissions never fold into settings/: a `permissions` key in both
  // settings/claude.settings.jsonc and permissions/permissions.jsonc is a
  // hard fragment collision at generate time. Import must not be able to
  // build that state.
  function foldPermission(it) {
    const d = doc('permissions/permissions.jsonc', 'jsonc')
    if (it.target === 'codex') {
      if (claim(`perm-codex:${it.name}`, it.value, it)) (d.codex ??= {})[it.name] = it.value
      return
    }
    const bucket = it.name // allow | deny | ask, or a native key like defaultMode
    const native = () => {
      if (claim(`perm-claude:${bucket}`, it.value, it)) ((d.claude ??= {}).permissions ??= {})[bucket] = it.value
    }
    if (!['allow', 'deny', 'ask'].includes(bucket) || !Array.isArray(it.value)) return native()
    const parsed = it.value.map((e) => {
      const m = /^(\w+)\((.*)\)$/s.exec(String(e))
      return m && CLAUDE_TOOL_REV[m[1]] ? { kind: CLAUDE_TOOL_REV[m[1]], pattern: m[2] } : null
    })
    // One unmappable entry (an MCP tool rule, say) sends the whole bucket to
    // the native block — splitting it would put the same array key in two
    // fragments, which is the collision above.
    if (parsed.some((p) => !p)) {
      ctx.warnings.push(
        `permissions: ${bucket} contains entries with no portable form — kept verbatim in permissions/permissions.jsonc under "claude"`
      )
      return native()
    }
    if (!claim(`perm-claude:${bucket}`, it.value, it)) return
    for (const p of parsed) ((d.permission ??= {})[p.kind] ??= {})[p.pattern] = bucket
  }

  function putText(rel, content, it) {
    if (texts.has(rel)) {
      if (texts.get(rel) !== content)
        ctx.warnings.push(`${it.category}: "${it.name}" found in more than one target — imported the first form`)
      return
    }
    texts.set(rel, content)
  }

  // Hand-written AGENTS.md / CLAUDE.md prose lands verbatim in
  // rules/imported.md with a provenance line. Appends, so a second origin
  // (or a later sync) never overwrites the first.
  function foldRules(it) {
    const rel = 'rules/imported.md'
    const chunk = `<!-- imported by meta-harness sync from ${it.name} (hand-written, not generated) -->\n\n${it.value.trim()}\n`
    const existing = texts.get(rel) ?? readIf(path.join(ctx.root, ctx.cfg.sourceDir, rel))
    texts.set(
      rel,
      existing
        ? `${existing.trimEnd()}\n\n${chunk}`
        : `---\ndescription: rules imported from your existing ${it.name}\nroot: true\n---\n\n${chunk}`
    )
    if (it.tracked)
      ctx.warnings.push(
        `${it.name} was generated and then hand-edited — imported verbatim, so review rules/imported.md for text that now appears twice`
      )
  }

  const writes = []
  for (const [rel, { data, format }] of docs)
    writes.push({
      rel,
      path: path.join(ctx.cfg.sourceDir, rel),
      content: format === 'toml' ? stringifyToml(sortKeys(data)) + '\n' : JSON.stringify(sortKeys(data), null, 2) + '\n',
    })
  for (const [rel, content] of texts) writes.push({ rel, path: path.join(ctx.cfg.sourceDir, rel), content })
  return { writes, conflicts }
}

/* ── plan / apply ───────────────────────────────────────────────────────── */

// What a follow-up generate would write, given the folded source. Built in a
// throwaway dir so the plan stays a pure read of the repo, and computed by
// the real target modules rather than a second copy of their path table.
// Does this predicted output differ from what is on disk now? Keeps the plan
// report to what sync would actually rewrite instead of the whole surface.
// (Symlink targets point into the preview dir — rebase them onto the real
// source before comparing.)
function wouldChange(root, f, tmp, realSrc) {
  const abs = path.join(root, f.path)
  if (f.symlinkTo) {
    const real = path.join(realSrc, path.relative(tmp, f.symlinkTo))
    return !isLink(abs) || fs.readlinkSync(abs) !== path.relative(path.dirname(abs), real)
  }
  const existing = readIf(abs)
  if (existing === null) return true
  if (!f.shared) return existing !== f.content
  try {
    return !eq(pick(FORMATS[f.format](existing, f.path), f.keys), pick(f.data, f.keys))
  } catch {
    return true
  }
}

function previewGenerates(ctx, writes) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-sync-'))
  try {
    const realSrc = path.join(ctx.root, ctx.cfg.sourceDir)
    if (fs.existsSync(realSrc)) fs.cpSync(realSrc, tmp, { recursive: true })
    for (const w of writes) writeFileEnsured(path.join(tmp, w.rel), w.content)
    const res = discover(ctx.root, { ...ctx.cfg, sourceDir: path.relative(ctx.root, tmp) }, {
      only: null,
      targetNames: ctx.targetNames,
    })
    const changed = res.files.filter((f) => wouldChange(ctx.root, f, tmp, realSrc))
    return { generates: changed.map((f) => f.path).sort(), warnings: res.warnings }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

export function syncPlan(root, { targets = null, prefer = null } = {}) {
  if (prefer && !['native', 'source'].includes(prefer)) throw new Error(`--prefer must be "native" or "source" (got "${prefer}")`)
  const cfg = loadConfig(root)
  const srcDir = path.join(root, cfg.sourceDir)
  const configured = fs.existsSync(path.join(root, 'meta-harness.jsonc'))
  const mode = configured && fs.existsSync(srcDir) ? 'reconcile' : 'bootstrap'

  const detected = detectedNames(detectTargets(root))
  const targetNames = targets ?? (mode === 'bootstrap' ? (detected.length ? detected : cfg.targets) : cfg.targets)
  const enabled = targetNames.includes('*') ? KNOWN_TARGETS : targetNames

  const ctx = { root, cfg, mode, targetNames, enabled, warnings: [], expected: new Map(), manifest: { files: {} } }
  if (mode === 'reconcile') {
    ctx.manifest = loadManifest(root, cfg)
    const d = discover(root, cfg, { only: null, targetNames })
    for (const f of d.files) ctx.expected.set(f.path, f)
    ctx.warnings.push(...d.warnings)
  }

  const imports = []
  const conflicts = []
  const clean = []
  const toFold = []
  for (const it of scan(ctx)) {
    let kind = classify(it)
    // A generated AGENTS.md/CLAUDE.md is a compilation of every rules/ file;
    // folding an edited one back would duplicate all of them. Always a
    // conflict, so the user picks: keep the edit (--prefer native, imported
    // verbatim) or discard it (--prefer source).
    if (it.category === 'rules' && it.tracked && kind === 'changed') kind = 'conflict'
    if (kind === 'clean') {
      clean.push({ target: it.target, category: it.category, name: it.name })
      continue
    }
    if (kind === 'generate') continue
    if (kind === 'conflict') {
      conflicts.push({
        target: it.target,
        category: it.category,
        name: it.name,
        source: it.expected,
        native: it.value,
        prefer,
        detail:
          it.category === 'rules' && it.tracked
            ? 'generated file was hand-edited — prose belongs in a rules/ file'
            : 'changed in the source and natively since the last generate',
      })
      if (prefer === 'native') toFold.push(it)
      continue
    }
    imports.push({
      target: it.target,
      category: it.category,
      name: it.name,
      kind,
      detail: kind === 'new' ? (it.tracked ? 'added natively' : 'unmanaged') : 'edited natively',
    })
    toFold.push(it)
  }

  const folded = foldAll(ctx, toFold)
  for (const c of folded.conflicts) conflicts.push({ ...c, prefer })
  const preview = previewGenerates(ctx, folded.writes)

  return {
    mode,
    targets: enabled,
    imports,
    conflicts,
    unsupported: inventory(ctx),
    generates: preview.generates,
    clean,
    warnings: [...ctx.warnings, ...preview.warnings],
    sourceWrites: folded.writes.map(({ path: p, content }) => ({ path: p, content })),
    scanned: [...new Set(scanPaths(ctx))],
  }
}

// Every native path sync looked at — apply uses it to tell "we decided about
// this file" from "we have never seen this file".
function scanPaths(ctx) {
  const out = ['AGENTS.md', 'CLAUDE.md']
  for (const target of SUPPORTED) {
    if (!ctx.enabled.includes(target)) continue
    for (const s of SURFACES[target]) out.push(s.file)
    for (const s of DIR_SURFACES[target]) {
      const abs = path.join(ctx.root, s.dir)
      if (fs.existsSync(abs)) for (const f of fs.readdirSync(abs)) out.push(path.join(s.dir, f))
    }
  }
  return out
}

// `npx skills add` owns skills dirs; the one thing sync repairs is the
// .claude/skills mirror, which only gets written when a Claude agent happens
// to be driving the install (§2).
function repairSkillMirror(root) {
  const agents = path.join(root, '.agents/skills')
  if (!fs.existsSync(agents)) return []
  const out = []
  for (const name of fs.readdirSync(agents)) {
    const mirror = path.join(root, '.claude/skills', name)
    if (fs.existsSync(mirror) || isLink(mirror)) continue
    relSymlink(path.join(agents, name), mirror)
    out.push(path.join('.claude/skills', name))
  }
  return out
}

export function syncApply(root, { targets = null, prefer = null, dryRun = false } = {}) {
  const plan = syncPlan(root, { targets, prefer })
  if (plan.conflicts.length && !prefer) {
    const err = new Error(
      `sync stopped — ${plan.conflicts.length} conflict${plan.conflicts.length > 1 ? 's' : ''} (changed in the source and natively):\n` +
        plan.conflicts.map((c) => `  ${c.target} ${c.category} ${c.name}`).join('\n') +
        `\n  resolve with --prefer native or --prefer source`
    )
    err.conflicts = plan.conflicts
    throw err
  }
  const warnings = [...plan.warnings]
  if (dryRun)
    return { plan, written: plan.generates, pruned: [], warnings }

  const cfg = loadConfig(root)
  // The fold makes the source truthful about every native item sync looked
  // at, so force-generating those outputs restores them byte-for-byte (or
  // applies the resolution the user asked for). Nothing else may be in the
  // blast radius: a drifted path sync never scanned is config it does not
  // understand, and force would destroy it. Checked before the fold (so a
  // refusal leaves the repo untouched) and again after (imports can create
  // outputs that did not exist to collide before).
  const accounted = new Set(plan.scanned)
  const guard = () => {
    try {
      generate(root, { check: true, targets })
    } catch (e) {
      const unexpected = (e.drifted ?? []).filter((p) => !accounted.has(p))
      if (!unexpected.length) return
      const err = new Error(
        `sync would overwrite config it cannot import:\n  ${unexpected.join('\n  ')}\n  move those aside (or port them into ${cfg.sourceDir}/) and rerun`
      )
      err.drifted = unexpected
      throw err
    }
  }
  guard()

  if (plan.mode === 'bootstrap' && !fs.existsSync(path.join(root, 'meta-harness.jsonc')))
    writeFileEnsured(
      path.join(root, 'meta-harness.jsonc'),
      `{\n  // source-of-truth directory\n  "sourceDir": "${cfg.sourceDir}",\n` +
        `  // targets to generate (see: meta-harness targets); "*" = all\n  "targets": ${JSON.stringify(plan.targets)}\n}\n`
    )
  for (const w of plan.sourceWrites) writeFileEnsured(path.join(root, w.path), w.content)

  guard()

  const res = generate(root, { force: true, targets })
  warnings.push(...res.warnings)
  return {
    plan,
    written: [...res.written, ...repairSkillMirror(root)],
    pruned: res.pruned,
    warnings,
  }
}
