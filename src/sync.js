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
import { NAME_OK as CODEX_NAME_OK } from './targets/codex.js'
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

// Every item carries `key`: the top-level native key it lives under. That is
// the granularity the manifest records ownership at (`ownedKeys` on a shared
// file), so it is what says whether *this item* was ever generated — a
// question the file-level entry cannot answer. A natively added `hooks` block
// in a settings.json we own is unmanaged, not clean.
const splitMcp = (d) =>
  Object.entries(d.mcpServers ?? {}).map(([name, value]) => ({ category: 'connections', key: 'mcpServers', name, value }))

function splitClaudeSettings(d) {
  const out = []
  for (const [k, v] of Object.entries(d)) {
    if (k === 'hooks') for (const [name, value] of Object.entries(v ?? {})) out.push({ category: 'hooks', key: k, name, value })
    else if (k === 'env') for (const [name, value] of Object.entries(v ?? {})) out.push({ category: 'env', key: k, name, value })
    else if (k === 'enabledPlugins')
      for (const [name, value] of Object.entries(Array.isArray(v) ? Object.fromEntries(v.map((p) => [p, true])) : (v ?? {})))
        out.push({ category: 'plugins', key: k, name, value })
    else if (k === 'permissions')
      for (const [name, value] of Object.entries(v ?? {})) out.push({ category: 'permissions', key: k, name, value })
    else out.push({ category: 'settings', key: k, name: k, value: v })
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
      for (const [name, value] of Object.entries(v ?? {})) out.push({ category: 'connections', key: k, name, value })
    else if (k === 'shell_environment_policy')
      for (const [pk, pv] of Object.entries(v ?? {})) {
        if (pk === 'set') for (const [name, value] of Object.entries(pv ?? {})) out.push({ category: 'env', key: k, name, value })
        else out.push({ category: 'env', key: k, name: `policy.${pk}`, value: pv })
      }
    else if (CODEX_PERMISSION_KEYS.includes(k)) out.push({ category: 'permissions', key: k, name: k, value: v })
    else out.push({ category: 'settings', key: k, name: k, value: v })
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
      split: (d) => Object.entries(d.hooks ?? {}).map(([name, value]) => ({ category: 'hooks', key: 'hooks', name, value })),
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
  const natIdx = index(split(native.data))
  // Union, so absence is a value: an item the manifest says we wrote and
  // that is now gone from the native file is a deletion, and deletions are
  // native changes like any other (§1 row 2). Iterating native keys alone
  // made them invisible, and force-generate then silently put them back.
  const out = []
  for (const key of new Set([...natIdx.keys(), ...expIdx.keys()])) {
    const n = natIdx.get(key)
    const e = expIdx.get(key)
    out.push({
      target,
      file,
      category: (n ?? e).category,
      name: (n ?? e).name,
      value: n?.value,
      hasNative: Boolean(n),
      expected: e?.value,
      hasExpected: Boolean(e),
      // Ownership is per top-level key on a shared file; the whole file
      // otherwise.
      tracked: itemTracked(entry, (n ?? e).key),
      nativeChanged,
      sourceChanged,
    })
  }
  return out
}

const itemTracked = (entry, key) => Boolean(entry) && (entry.ownedKeys ? entry.ownedKeys.includes(key) : true)

function fileItems(ctx, target, { dir, category, ext }) {
  const abs = path.join(ctx.root, dir)
  const onDisk = fs.existsSync(abs) ? fs.readdirSync(abs).filter((n) => n.endsWith(ext)) : []
  // Union again: an output the manifest lists under this dir that is no
  // longer on disk was deleted natively.
  const known = [...ctx.expected.keys()].filter((p) => path.dirname(p) === dir && p.endsWith(ext)).map((p) => path.basename(p))
  const out = []
  for (const name of [...new Set([...onDisk, ...known])].sort()) {
    const rel = path.join(dir, name)
    const p = path.join(abs, name)
    const entry = ctx.manifest.files[rel]
    const present = onDisk.includes(name)
    if (present && isLink(p)) {
      // Ours (commands are symlinked into the source) or the user's own link
      // to a file we don't own. Either way there is nothing to import.
      if (!entry) ctx.warnings.push(`${rel}: symlink meta-harness did not write — left alone, not imported`)
      continue
    }
    const exp = ctx.expected.get(rel)
    const expected = exp ? (exp.content ?? readIf(exp.symlinkTo) ?? undefined) : undefined
    const raw = present ? fs.readFileSync(p, 'utf8') : undefined
    const tracked = Boolean(entry)
    out.push({
      target,
      file: rel,
      category,
      name: path.basename(name, ext),
      value: raw,
      hasNative: present,
      expected,
      hasExpected: expected !== undefined,
      tracked,
      // A manifest symlink entry against a real file (or nothing at all)
      // means someone replaced or removed our link: native changed.
      nativeChanged: !tracked ? true : entry.symlink || !present ? true : sha256(raw) !== entry.hash,
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
      hasNative: true,
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
  if (!it.hasNative) {
    // Gone from the native file. Only a deletion if we put it there and the
    // native surface has moved since; otherwise it is simply an item the
    // source grew and generate has not emitted yet.
    if (!it.tracked || !it.nativeChanged) return 'generate'
    return it.sourceChanged ? 'conflict' : 'removed'
  }
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

// The source file name decides the emitted agent name, so a native TOML
// `name` that says something else would be rewritten on the next generate.
// Keep it as a codex-only frontmatter override (targets/codex.js applies
// perTarget.codex last) — the file stays at its own path, the name survives.
function codexAgentToMd(raw, fileName) {
  const { developer_instructions: body = '', name, ...fm } = parseToml(raw)
  if (name !== undefined && name !== fileName) fm.codex = { ...(fm.codex ?? {}), name }
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
    // Both values are native and they disagree. `--prefer native` cannot
    // choose between two natives, and scan order is not a decision — so this
    // one is fatal whatever the flag says. No `source` field either: neither
    // value came from the source dir, and labelling one that way would lie
    // to anything reading the plan.
    conflicts.push({
      target: it.target,
      category: it.category,
      name: it.name,
      fatal: true,
      // Authoritative pair. `source` stays null rather than holding one of
      // the two native values: nothing here came from the source dir, and a
      // consumer reading `source` must not be told otherwise.
      sides: [
        { target: prev.target, value: prev.value },
        { target: it.target, value },
      ],
      source: null,
      native: value,
      detail: `${prev.target} and ${it.target} both define it natively, with different values — --prefer cannot pick; make them agree (or delete one) and rerun`,
    })
    return false
  }

  for (const it of items) (it.kind === 'removed' ? unfold : fold)(it)

  function fold(it) {
    switch (it.category) {
      case 'connections': {
        // Codex refuses server names outside its charset, so the forward
        // translator drops them (targets/codex.js NAME_OK). Importing one
        // into the canonical map would hand it to a generate that then
        // deletes it from the only target that had it. §2's answer for an
        // untranslatable native key: keep it in that target's own settings
        // file, verbatim, and report it.
        if (it.target === 'codex' && !CODEX_NAME_OK.test(it.name)) {
          const d = doc('settings/codex.config.toml', 'toml')
          if (claim(`codex-mcp:${it.name}`, it.value, it)) (d.mcp_servers ??= {})[it.name] = it.value
          ctx.unsupported.push({
            target: 'codex',
            path: `.codex/config.toml [mcp_servers."${it.name}"]`,
            reason: `server name is not portable (codex accepts ${CODEX_NAME_OK.source}) — kept verbatim in ${ctx.cfg.sourceDir}/settings/codex.config.toml, codex only`,
          })
          break
        }
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
        putText(`agents/${it.name}.md`, it.target === 'codex' ? codexAgentToMd(it.value, it.name) : it.value, it)
        break
      case 'rules':
        foldRules(it)
        break
    }
  }

  // The mirror of fold(): the item is gone from the native file, so take it
  // out of the source too. Only reached for items inside a config file we
  // rewrite anyway — a deleted command/agent FILE is classified as a
  // conflict instead, because folding that would delete a source file the
  // user authored, and `rm` on a generated symlink is too light a gesture
  // for that. `--prefer native` still does it.
  function unfold(it) {
    const gone = (t) => ctx.warnings.push(`${it.category}: "${it.name}" was deleted from ${it.target} — removing it from the source drops it from ${t} too`)
    switch (it.category) {
      case 'connections': {
        const d = doc('connections/mcp.jsonc', 'jsonc')
        if (d.mcpServers) delete d.mcpServers[it.name]
        for (const t of KNOWN_TARGETS) if (d[t]?.mcpServers && it.name in d[t].mcpServers) gone(t)
        break
      }
      case 'hooks': {
        const d = doc('hooks/hooks.jsonc', 'jsonc')
        if (d.hooks) delete d.hooks[it.name]
        break
      }
      case 'env': {
        const d = doc('env/env.jsonc', 'jsonc')
        if (it.name.startsWith('policy.')) delete d.codex?.shell_environment_policy?.[it.name.slice('policy.'.length)]
        else if (d.vars) delete d.vars[it.name]
        break
      }
      case 'plugins': {
        const d = doc('plugins/plugins.jsonc', 'jsonc')
        if (Array.isArray(d.enabledPlugins)) d.enabledPlugins = d.enabledPlugins.filter((p) => p !== it.name)
        break
      }
      case 'permissions': {
        const d = doc('permissions/permissions.jsonc', 'jsonc')
        if (it.target === 'codex') delete d.codex?.[it.name]
        else {
          delete d.claude?.permissions?.[it.name]
          // A bucket maps to every unified rule carrying that decision.
          for (const entries of Object.values(d.permission ?? {}))
            for (const [pattern, decision] of Object.entries(entries)) if (decision === it.name) delete entries[pattern]
        }
        break
      }
      case 'settings': {
        const rel = it.target === 'claude' ? 'settings/claude.settings.jsonc' : 'settings/codex.config.toml'
        delete doc(rel, it.target === 'claude' ? 'jsonc' : 'toml')[it.name]
        break
      }
      // Only reachable via --prefer native (see the classify override): the
      // user chose to let the deletion take the source file with it.
      case 'commands':
        texts.set(`commands/${it.name}.md`, null)
        break
      case 'agents':
        texts.set(`agents/${it.name}.md`, null)
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
// Which target a generated file belongs under in the plan report. Same
// signal detect.js reads to spot a lived-in target: the path prefix. Files
// every runtime reads (AGENTS.md, CLAUDE.md, .mcp.json) group as 'shared',
// matching the AGENTS.md import rows.
const TARGET_DIRS = {
  '.claude/': 'claude',
  '.codex/': 'codex',
  '.cursor/': 'cursor',
  '.opencode/': 'opencode',
  '.hermes/': 'hermes',
}
const ownerOf = (rel) =>
  (rel === 'opencode.json' ? 'opencode' : Object.entries(TARGET_DIRS).find(([p]) => rel.startsWith(p))?.[1]) ?? 'shared'

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
    for (const w of writes) {
      const abs = path.join(tmp, w.rel)
      if (w.content === null) fs.rmSync(abs, { force: true })
      else writeFileEnsured(abs, w.content)
    }
    const res = discover(ctx.root, { ...ctx.cfg, sourceDir: path.relative(ctx.root, tmp) }, {
      only: null,
      targetNames: ctx.targetNames,
    })
    const changed = res.files.filter((f) => wouldChange(ctx.root, f, tmp, realSrc))
    return {
      files: res.files,
      generates: changed
        .map((f) => ({ target: ownerOf(f.path), path: f.path }))
        .sort((a, b) => a.target.localeCompare(b.target) || a.path.localeCompare(b.path)),
      warnings: res.warnings,
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// Is `a` still there in `b` after a round trip? Not equality: a forward
// translator may add (other rules join a permissions bucket) or drop what
// carries no meaning (an empty table codex rejects). Anything else missing
// is a value the import would have deleted from the target it came from.
function retained(a, b) {
  if (Array.isArray(a)) return Array.isArray(b) && a.every((x) => b.some((y) => eq(x, y)))
  if (isObj(a)) {
    if (!isObj(b)) return false
    return Object.entries(a).every(([k, v]) => {
      if (!(k in b)) return (isObj(v) || Array.isArray(v)) && Object.keys(v).length === 0
      return retained(v, b[k])
    })
  }
  return eq(a, b)
}

// Values a dialect drops because they are its default. `enabled = true` is
// codex's, and the canonical shape has no field for it (only `disabled`), so
// demanding it survive the round trip would make an ordinary codex config
// unsyncable by any flag — a refusal no user could clear. Normalize first,
// compare after: it is the meaning that has to survive, not the syntax.
function normalizeNative(it) {
  if (it.target === 'codex' && it.category === 'connections' && isObj(it.value) && it.value.enabled === true) {
    const { enabled, ...rest } = it.value
    return rest
  }
  return it.value
}

// Whole-file surfaces (commands, agents) round-trip through a formatter, so
// bytes never match — compare what the file means. A symlinked output points
// straight back at the source file we just wrote, so it holds by definition.
const trimStrings = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]))

function fileRetained(it, f) {
  if (!f) return false
  if (f.symlinkTo) return true
  try {
    if (it.file.endsWith('.toml'))
      return retained(trimStrings(parseToml(it.value)), trimStrings(parseToml(f.content)))
    const a = matter(it.value)
    const b = matter(f.content)
    return retained(a.data, b.data) && a.content.trim() === b.content.trim()
  } catch {
    return false
  }
}

// §7.3 backstop. Every item we import gets re-emitted to the target it came
// from — unless a forward translator cannot carry it, in which case importing
// it would move the value into the source and then delete it from the only
// place it existed. Refuse instead; the caller reports it as unsupported.
function lostInTranslation(ctx, items, previewFiles, conflicts) {
  const byPath = new Map(previewFiles.map((f) => [f.path, f]))
  const specs = new Map(Object.values(SURFACES).flat().map((s) => [s.file, s]))
  const dirCategories = new Set(Object.values(DIR_SURFACES).flat().map((s) => s.category))
  // Already fatal for another reason (two natives disagreeing drops one of
  // them by construction) — one report per problem.
  const known = new Set(conflicts.filter((c) => c.fatal).map((c) => `${c.category}/${c.name}`))
  const out = []
  for (const it of items) {
    const spec = specs.get(it.file)
    const isFile = !spec && dirCategories.has(it.category)
    if ((!spec && !isFile) || !it.hasNative || it.kind === 'removed' || known.has(`${it.category}/${it.name}`)) continue
    const f = byPath.get(it.file)
    if (isFile) {
      if (fileRetained(it, f)) continue
    } else {
      let emitted = {}
      try {
        emitted = f ? (f.shared ? f.data : FORMATS[spec.format](f.content, it.file)) : {}
      } catch {
        /* preview unparseable — the item is certainly not safely there */
      }
      const found = index(spec.split(emitted)).get(`${it.category}/${it.name}`)
      if (found && retained(normalizeNative(it), found.value)) continue
    }
    out.push({
      target: it.target,
      path: `${it.file} ${it.category}/${it.name}`,
      fatal: true,
      reason: `importing it would drop it from ${it.target} — ${it.target} cannot re-emit this value from the source. Leave it where it is (sync wrote nothing) or move it out of ${it.file} by hand.`,
    })
  }
  return out
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

  const ctx = {
    root,
    cfg,
    mode,
    targetNames,
    enabled,
    warnings: [],
    unsupported: [],
    expected: new Map(),
    manifest: { files: {} },
  }
  if (mode === 'reconcile') {
    ctx.manifest = loadManifest(root, cfg)
    const d = discover(root, cfg, { only: null, targetNames })
    for (const f of d.files) ctx.expected.set(f.path, f)
    ctx.warnings.push(...d.warnings)
  }

  const stale = staleStaging(root, cfg)
  if (stale.length) ctx.warnings.push(STALE_STAGING_NOTE(stale))

  const imports = []
  const conflicts = []
  const clean = []
  const toFold = []
  const items = scan(ctx)

  // A managed output that is simply gone gets recreated by the generate at
  // the end of sync. That restores rather than destroys, so it is not a
  // §7.3 path and it is not folded back as a deletion — but it must not be
  // silent either: without this the plan shows a bare "→ generate" row for a
  // file the user deliberately deleted.
  const scannedFiles = new Set(items.map((i) => i.file))
  for (const [rel, entry] of Object.entries(ctx.manifest.files)) {
    if (scannedFiles.has(rel) || entry.symlink) continue
    if (fs.existsSync(path.join(root, rel)) || isLink(path.join(root, rel))) continue
    ctx.warnings.push(
      `${rel}: deleted natively — sync recreates it from the source. Whole-file deletions are not folded back; remove the entries from ${cfg.sourceDir}/ to make it stick.`
    )
  }

  for (const it of items) {
    let kind = classify(it)
    // A generated AGENTS.md/CLAUDE.md is a compilation of every rules/ file;
    // folding an edited one back would duplicate all of them. Always a
    // conflict, so the user picks: keep the edit (--prefer native, imported
    // verbatim) or discard it (--prefer source).
    if (it.category === 'rules' && it.tracked && kind === 'changed') kind = 'conflict'
    // Same reasoning for a deleted command/agent: unfolding it means deleting
    // a source file. Explicit resolution only.
    if (kind === 'removed' && ['commands', 'agents', 'rules'].includes(it.category)) kind = 'conflict'
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
            : !it.hasNative
              ? 'deleted natively, changed in the source'
              : it.category === 'commands' || it.category === 'agents'
                ? 'deleted natively — --prefer native removes the source file too'
                : 'changed in the source and natively since the last generate',
      })
      if (prefer === 'native') toFold.push({ ...it, kind: it.hasNative ? 'changed' : 'removed' })
      continue
    }
    imports.push({
      target: it.target,
      category: it.category,
      name: it.name,
      kind,
      detail:
        kind === 'removed'
          ? 'deleted natively'
          : kind === 'new'
            ? it.tracked
              ? 'added natively'
              : 'unmanaged'
            : 'edited natively',
    })
    toFold.push({ ...it, kind })
  }

  const folded = foldAll(ctx, toFold)
  for (const c of folded.conflicts) conflicts.push({ ...c, prefer })
  const preview = previewGenerates(ctx, folded.writes)
  const unsupported = [
    ...inventory(ctx),
    ...ctx.unsupported,
    ...lostInTranslation(ctx, toFold, preview.files, conflicts),
  ]

  return {
    mode,
    targets: enabled,
    imports,
    conflicts,
    unsupported,
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

// Stage every source write, then commit. Two phases so a failure — full
// disk, EISDIR, a kill — leaves either the whole fold or none of it, never a
// half-built source dir that the next run would treat as a real reconcile
// base. Rename within a directory is atomic; the pre-images make the commit
// loop reversible if one of them fails.
// Staging files a previous run left behind. They are writes that were never
// committed, so clearing them loses nothing — but they are also the only
// trace that a run died mid-commit, which can leave the source partly
// folded. Saying so matters more than the cleanup: the next sync re-derives
// the fold from native config, so rerunning is the recovery.
//
// ponytail: per-file rename is atomic, the sequence of renames is not — a
// SIGKILL between two of them commits a prefix. Closing that needs a
// transaction marker or a whole-tree pointer swap; not worth it while the
// recovery is "run sync again". Upgrade path if it ever is: write a
// <sourceDir>/.sync-journal listing the intended set, and finish or unwind
// it here on startup.
const STAGING_SUFFIX = '.mh-sync-tmp'

function staleStaging(root, cfg) {
  const dir = path.join(root, cfg.sourceDir)
  if (!fs.existsSync(dir)) return []
  return walk(dir)
    .filter((f) => f.endsWith(STAGING_SUFFIX))
    .map((f) => path.join(cfg.sourceDir, f))
}

const STALE_STAGING_NOTE = (paths) =>
  `${paths.length} leftover staging file${paths.length > 1 ? 's' : ''} from a sync that was killed mid-write (${paths.join(', ')}) — the source dir may be only partly folded; this run re-derives it from your native config`

function commitWrites(root, writes) {
  const staged = []
  const clean = () => {
    for (const s of staged) fs.rmSync(s.tmp, { force: true })
  }
  try {
    for (const w of writes) {
      const abs = path.join(root, w.path)
      const prev = readIf(abs)
      if (w.content === null) {
        staged.push({ abs, tmp: null, prev })
        continue
      }
      const tmp = `${abs}${STAGING_SUFFIX}`
      writeFileEnsured(tmp, w.content)
      staged.push({ abs, tmp, prev })
    }
  } catch (e) {
    clean()
    throw e
  }
  const done = []
  try {
    for (const s of staged) {
      if (s.tmp === null) fs.rmSync(s.abs, { force: true })
      else fs.renameSync(s.tmp, s.abs)
      done.push(s)
    }
  } catch (e) {
    for (const d of done) {
      if (d.prev === null) fs.rmSync(d.abs, { force: true })
      else writeFileEnsured(d.abs, d.prev)
    }
    clean()
    throw e
  }
}

export function syncApply(root, { targets = null, prefer = null, dryRun = false } = {}) {
  const plan = syncPlan(root, { targets, prefer })
  // Fatal items are not resolvable by --prefer: two natives disagreeing
  // (prefer cannot name a side) or a value no target could carry back.
  const fatal = [...plan.conflicts.filter((c) => c.fatal), ...plan.unsupported.filter((u) => u.fatal)]
  if (fatal.length) {
    const err = new Error(
      `sync stopped — ${fatal.length} unresolvable item${fatal.length > 1 ? 's' : ''} (nothing was written):\n` +
        fatal.map((f) => `  ${f.target} ${f.path ?? `${f.category}/${f.name}`}\n    ${f.detail ?? f.reason}`).join('\n')
    )
    err.conflicts = plan.conflicts.filter((c) => c.fatal)
    err.unsupported = plan.unsupported.filter((u) => u.fatal)
    throw err
  }
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
  // `written` is a path list in both modes — same shape generate returns, so
  // a caller can count or print it without knowing which mode ran. The
  // target grouping for the report lives on plan.generates.
  if (dryRun) return { plan, written: plan.generates.map((g) => g.path), pruned: [], warnings }

  const cfg = loadConfig(root)
  // Clear a killed run's uncommitted staging before writing our own; the
  // plan already warned that the source may be partly folded, and this run
  // re-derives it either way.
  for (const rel of staleStaging(root, cfg)) fs.rmSync(path.join(root, rel), { force: true })

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

  // The fold commits first, and meta-harness.jsonc only after it: a config
  // file pointing at a source dir that was never completely written is what
  // turns a failed bootstrap into a bad reconcile base on the next run.
  commitWrites(root, plan.sourceWrites)
  if (plan.mode === 'bootstrap' && !fs.existsSync(path.join(root, 'meta-harness.jsonc')))
    commitWrites(root, [
      {
        path: 'meta-harness.jsonc',
        content:
          `{\n  // source-of-truth directory\n  "sourceDir": "${cfg.sourceDir}",\n` +
          `  // targets to generate (see: meta-harness targets); "*" = all\n  "targets": ${JSON.stringify(plan.targets)}\n}\n`,
      },
    ])

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
