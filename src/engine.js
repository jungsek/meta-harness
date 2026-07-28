import fs from 'node:fs'
import path from 'node:path'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { emitAgentsMd, END, legacyProse, START } from './agentsmd.js'
import { loadModel } from './model.js'
import { targets as registry } from './targets/index.js'
import {
  canonicalJson,
  isLink,
  mergeFragments,
  overlay,
  parseJsonc,
  pick,
  readIf,
  relSymlink,
  sha256,
  sortKeys,
  writeFileEnsured,
} from './util.js'

const MANIFEST = '.manifest.json'
export const DEFAULT_TARGETS = ['claude', 'codex']

export function loadConfig(root) {
  const cfg = { sourceDir: '.meta-harness', targets: DEFAULT_TARGETS }
  for (const name of ['meta-harness.jsonc', 'meta-harness.local.jsonc']) {
    const raw = readIf(path.join(root, name))
    if (raw !== null) overlay(cfg, parseJsonc(raw, name))
  }
  return cfg
}

function resolveTargets(names) {
  const list = names.includes('*') ? Object.keys(registry) : names
  for (const t of list) if (!registry[t]) throw new Error(`unknown target "${t}" (known: ${Object.keys(registry).join(' ')})`)
  return list
}

const serialize = (format, data) =>
  format === 'toml' ? stringifyToml(sortKeys(data)) + '\n' : JSON.stringify(sortKeys(data), null, 2) + '\n'

const parseByFormat = (format, raw) => (format === 'toml' ? parseToml(raw) : JSON.parse(raw))

// exported for src/sync.js: the expected native surface, computed by the real
// target modules rather than a second copy of their tables.
export function discover(root, cfg, { only, targetNames }) {
  const srcDir = path.join(root, cfg.sourceDir)
  if (!fs.existsSync(srcDir)) throw new Error(`source dir not found: ${srcDir} — run: meta-harness init`)
  const model = loadModel(srcDir)
  const errors = model.issues.filter((i) => i.level === 'error')
  if (errors.length)
    throw new Error(`source validation failed:\n${errors.map((i) => `  ${i.file}: ${i.message}`).join('\n')}`)
  const warnings = model.issues.filter((i) => i.level === 'warn').map((i) => `${path.basename(i.file)}: ${i.message}`)

  const ctx = { srcDir, root, warnings }
  const enabled = resolveTargets(targetNames)
  let outputs = []
  for (const t of enabled) outputs = outputs.concat(registry[t].emit(model, ctx))
  outputs = outputs.concat(emitAgentsMd(model, enabled, ctx))
  if (only) outputs = outputs.filter((o) => only.includes(o.category))

  // Assemble shared files (settings.json / config.toml / opencode.json …)
  // from fragments. Same-key collision between fragments = hard error.
  const sharedMap = new Map()
  const files = []
  for (const o of outputs) {
    if (!o.sharedFile) {
      files.push(o)
      continue
    }
    const cur = sharedMap.get(o.sharedFile) ?? { format: o.format, data: {}, owners: new Map() }
    mergeFragments(cur.data, o.data, '', cur.owners, `${o.category}/`)
    sharedMap.set(o.sharedFile, cur)
  }
  for (const [rel, { format, data }] of sharedMap)
    if (Object.keys(data).length)
      files.push({ shared: true, format, path: rel, data, keys: Object.keys(data) })
  return { files, warnings }
}

export const loadManifest = (root, cfg) => {
  const raw = readIf(path.join(root, cfg.sourceDir, MANIFEST))
  return raw ? JSON.parse(raw) : { version: 2, files: {} }
}

// Owned-key subset hash for a shared file — foreign-key edits never count as drift.
const ownedHashOf = (data, ownedKeys) => sha256(canonicalJson(pick(data, ownedKeys)))

// A path we are about to write that already exists but was never recorded in
// the manifest is someone's hand-written config, not ours. The manifest-based
// check below can't see it — an empty manifest means zero checks — so without
// this the very first generate in an already-configured repo destroys files
// silently. That first run is exactly when adopters have the most to lose.
function detectUnmanaged(root, files, manifest) {
  const out = []
  for (const f of files) {
    if (manifest.files[f.path]) continue
    const abs = path.join(root, f.path)
    if (!fs.existsSync(abs) && !isLink(abs)) continue
    // Shared files merge rather than replace, so existing content normally
    // survives on its own terms — but only when the merge can actually see
    // it. An unparseable shared file would be overwritten wholesale, so it
    // gets the same refusal as any other unmanaged path.
    if (f.shared) {
      try {
        parseByFormat(f.format, fs.readFileSync(abs, 'utf8'))
        continue
      } catch {
        out.push(f.path)
        continue
      }
    }
    out.push(f.path)
  }
  return out
}

function detectDrift(root, manifest) {
  const drifted = []
  for (const [rel, entry] of Object.entries(manifest.files)) {
    const abs = path.join(root, rel)
    if (entry.symlink || !fs.existsSync(abs)) continue
    const raw = fs.readFileSync(abs, 'utf8')
    if (entry.marker) {
      // Legacy pre-0.18 co-owned block entry — always regenerate-worthy, but
      // the migration guard below decides whether prose would be lost.
      drifted.push(rel)
    } else if (entry.ownedKeys) {
      try {
        const data = parseByFormat(entry.format, raw)
        if (ownedHashOf(data, entry.ownedKeys) !== entry.ownedHash) drifted.push(rel)
      } catch {
        drifted.push(rel)
      }
    } else if (sha256(raw) !== entry.hash) drifted.push(rel)
  }
  return drifted
}

// Merge tool-owned keys into an existing shared file, preserving foreign keys.
// A full run drops previously-owned keys that are no longer produced (that is
// how a removed category leaves the file); a partial run didn't look at every
// category, so keys owned by unselected ones must survive untouched.
function mergeShared(root, out, prevOwned, warnings, partial) {
  const existingRaw = readIf(path.join(root, out.path))
  let merged = out.data
  if (existingRaw !== null) {
    let existing
    try {
      existing = parseByFormat(out.format, existingRaw)
    } catch {
      warnings.push(`${out.path}: existing file unparseable — overwriting entirely`)
      existing = {}
    }
    merged = {}
    for (const [k, v] of Object.entries(existing)) {
      const owned = out.keys.includes(k) || (!partial && (prevOwned ?? []).includes(k))
      if (!owned) merged[k] = v // foreign or partial-run-retained key — preserved verbatim
    }
    for (const [k, v] of Object.entries(out.data)) {
      if (k in merged && !(prevOwned ?? []).includes(k)) warnings.push(`${out.path}: overwriting foreign key "${k}" (now owned)`)
      merged[k] = v
    }
  }
  const ownedKeys = partial ? [...new Set([...out.keys, ...(prevOwned ?? [])])] : out.keys
  return { content: serialize(out.format, merged), finalData: merged, ownedKeys }
}

export function generate(root, { check = false, force = false, only = null, targets = null } = {}) {
  const cfg = loadConfig(root)
  const targetNames = targets ?? cfg.targets
  const manifest = loadManifest(root, cfg)
  const { files, warnings } = discover(root, cfg, { only, targetNames })
  const result = { written: [], pruned: [], drifted: [], unchanged: [], warnings }

  // Migration off the pre-0.18 co-owned AGENTS.md/CLAUDE.md block: these are
  // whole-file outputs now, so a file still carrying the old markers gets a
  // refusal that names the fix — never a silent clobber of prose the user
  // wrote outside the block.
  if (!force)
    for (const f of files) {
      if (f.shared || f.symlinkTo) continue
      const raw = readIf(path.join(root, f.path))
      if (raw === null || (!raw.includes(START) && !raw.includes(END))) continue
      throw new Error(
        `${f.path} carries pre-0.18 managed-block markers — AGENTS.md and CLAUDE.md are now fully generated. Move any hand-written prose into a rules/ file (e.g. rules/project.md with "root: true"), then rerun with --force to overwrite.`
      )
    }

  const unmanaged = detectUnmanaged(root, files, manifest)
  result.drifted = [...new Set([...detectDrift(root, manifest), ...unmanaged])]
  if (result.drifted.length && !force) {
    const adopting = unmanaged.length === result.drifted.length
    const err = new Error(
      (adopting
        ? `refusing to overwrite existing config meta-harness did not write (use --force to adopt these paths):`
        : `refusing to overwrite hand-edited outputs (use --force to discard):`) +
        `\n  ${result.drifted.join('\n  ')}`
    )
    err.drifted = result.drifted
    throw err
  }

  const nextManifest = { version: 2, files: {} }
  for (const out of files) {
    const abs = path.join(root, out.path)
    if (out.symlinkTo) {
      const target = path.relative(path.dirname(abs), out.symlinkTo)
      const current = isLink(abs) ? fs.readlinkSync(abs) : null
      nextManifest.files[out.path] = { symlink: target }
      if (current === target) result.unchanged.push(out.path)
      else if (check) result.written.push(out.path)
      else {
        relSymlink(out.symlinkTo, abs)
        result.written.push(out.path)
      }
      continue
    }
    let content, entry
    if (out.shared) {
      const prev = manifest.files[out.path]
      const m = mergeShared(root, out, prev?.ownedKeys, warnings, Boolean(only || targets))
      content = m.content
      entry = {
        format: out.format,
        ownedKeys: m.ownedKeys,
        ownedHash: ownedHashOf(m.finalData, m.ownedKeys),
      }
    } else {
      content = out.content
      entry = { hash: sha256(content) }
    }
    nextManifest.files[out.path] = entry
    const existing = readIf(abs)
    if (existing !== null && sha256(existing) === sha256(content)) result.unchanged.push(out.path)
    else if (check) result.written.push(out.path)
    else {
      writeFileEnsured(abs, content)
      result.written.push(out.path)
    }
  }

  // Prune: manifest-tracked outputs no longer produced. Full runs only — a
  // partial --only/--targets run doesn't discover everything and would over-prune.
  const partial = only || targets
  if (!partial) {
    for (const [rel, entry] of Object.entries(manifest.files)) {
      if (nextManifest.files[rel]) continue
      pruneEntry(root, rel, entry, check, result)
    }
  } else {
    for (const [rel, entry] of Object.entries(manifest.files))
      if (!nextManifest.files[rel]) nextManifest.files[rel] = entry
  }

  if (!check) writeFileEnsured(path.join(root, cfg.sourceDir, MANIFEST), JSON.stringify(nextManifest, null, 2) + '\n')
  return result
}

// Remove one manifest-tracked output the way its kind demands: marker files
// lose only our block (file deleted when nothing else remains), shared files
// lose only our keys, plain files/symlinks are deleted with empty parent dirs.
function pruneEntry(root, rel, entry, check, result) {
  const abs = path.join(root, rel)
  const rm = (p) => {
    fs.rmSync(p)
    try {
      fs.rmdirSync(path.dirname(p)) // only succeeds when empty
    } catch {}
  }
  if (entry.marker) {
    // Legacy pre-0.18 co-owned block entry: remove only our block, keep the
    // user's surrounding prose — same contract the old splice made.
    const raw = readIf(abs)
    const prose = raw === null ? null : legacyProse(raw)
    if (raw !== null && prose !== null) {
      if (!check) {
        if (prose) writeFileEnsured(abs, prose + '\n')
        else rm(abs)
      }
      result.pruned.push(rel)
    }
  } else if (entry.ownedKeys) {
    const raw = readIf(abs)
    if (raw !== null) {
      try {
        const data = parseByFormat(entry.format, raw)
        const foreign = Object.fromEntries(Object.entries(data).filter(([k]) => !entry.ownedKeys.includes(k)))
        if (!check) {
          if (Object.keys(foreign).length) writeFileEnsured(abs, serialize(entry.format, foreign))
          else rm(abs)
        }
        result.pruned.push(rel)
      } catch {
        /* unparseable — leave it alone */
      }
    }
  } else if (fs.existsSync(abs) || isLink(abs)) {
    if (!check) rm(abs)
    result.pruned.push(rel)
  }
}

// Tear down every trace of meta-harness: all manifest-tracked outputs go
// through the same kind-aware prune as generate (user prose and foreign keys
// survive), then the manifest, the source dir, meta-harness.jsonc, the
// installed agent skill, and its skills-lock.json entry. Hand-edited outputs
// refuse without `force`, same contract as generate: uninstall must not
// silently discard work either.
export function uninstall(root, { force = false, check = false } = {}) {
  const cfg = loadConfig(root)
  const manifest = loadManifest(root, cfg)
  const result = { pruned: [], drifted: [], warnings: [] }
  result.drifted = detectDrift(root, manifest)
  if (result.drifted.length && !force) {
    const err = new Error(
      `refusing to remove hand-edited outputs (use --force to discard):\n  ${result.drifted.join('\n  ')}`
    )
    err.drifted = result.drifted
    throw err
  }
  for (const [rel, entry] of Object.entries(manifest.files)) pruneEntry(root, rel, entry, check, result)

  const rootAbs = path.resolve(root)
  // .claude/skills/meta-harness is the symlink `npx skills add` creates so
  // Claude sees the .agents skill — dangling once the target goes.
  for (const rel of [cfg.sourceDir, 'meta-harness.jsonc', '.agents/skills/meta-harness', '.claude/skills/meta-harness']) {
    const abs = path.resolve(root, rel)
    // sourceDir comes from user config — "." would delete the repo itself,
    // "../x" would escape it. Only delete strict descendants of root.
    if (abs === rootAbs || !abs.startsWith(rootAbs + path.sep)) {
      result.warnings.push(`refusing "${rel}" — resolves outside the project (or to it)`)
      continue
    }
    // existsSync follows symlinks — a dangling skill symlink needs isLink
    if (!fs.existsSync(abs) && !isLink(abs)) continue
    if (!check) {
      fs.rmSync(abs, { recursive: true })
      // tidy .agents/skills → .agents when the skill was the last thing there
      let dir = path.dirname(abs)
      while (dir !== rootAbs) {
        try {
          fs.rmdirSync(dir)
        } catch {
          break
        }
        dir = path.dirname(dir)
      }
    }
    result.pruned.push(rel)
  }

  // skills-lock.json is shared with other skills — remove only our entry.
  const lockPath = path.join(root, 'skills-lock.json')
  const lockRaw = readIf(lockPath)
  if (lockRaw !== null) {
    try {
      const lock = JSON.parse(lockRaw)
      if (lock.skills?.['meta-harness']) {
        delete lock.skills['meta-harness']
        if (!check) {
          if (Object.keys(lock.skills).length) fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
          else fs.rmSync(lockPath)
        }
        result.pruned.push('skills-lock.json (meta-harness entry)')
      }
    } catch {
      result.warnings.push('skills-lock.json unparseable — left alone')
    }
  }
  return result
}

export function status(root) {
  const cfg = loadConfig(root)
  const manifest = loadManifest(root, cfg)
  const rows = []
  for (const [rel, entry] of Object.entries(manifest.files)) {
    const abs = path.join(root, rel)
    let state
    if (entry.symlink) state = isLink(abs) ? 'link' : 'MISSING'
    else if (!fs.existsSync(abs)) state = 'MISSING'
    else if (entry.marker) state = 'EDITED' // legacy pre-0.18 block entry — regenerate to migrate
    else if (entry.ownedKeys) {
      try {
        state =
          ownedHashOf(parseByFormat(entry.format, fs.readFileSync(abs, 'utf8')), entry.ownedKeys) === entry.ownedHash
            ? 'clean'
            : 'EDITED'
      } catch {
        state = 'EDITED'
      }
    } else state = sha256(fs.readFileSync(abs)) === entry.hash ? 'clean' : 'EDITED'
    rows.push({ path: rel, state })
  }
  return rows
}
