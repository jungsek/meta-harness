import fs from 'node:fs'
import path from 'node:path'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
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

function discover(root, cfg, { only, targetNames }) {
  const srcDir = path.join(root, cfg.sourceDir)
  if (!fs.existsSync(srcDir)) throw new Error(`source dir not found: ${srcDir} — run: meta-harness init`)
  const model = loadModel(srcDir)
  const errors = model.issues.filter((i) => i.level === 'error')
  if (errors.length)
    throw new Error(`source validation failed:\n${errors.map((i) => `  ${i.file}: ${i.message}`).join('\n')}`)
  const warnings = model.issues.filter((i) => i.level === 'warn').map((i) => `${path.basename(i.file)}: ${i.message}`)

  const ctx = { srcDir, warnings }
  let outputs = []
  for (const t of resolveTargets(targetNames)) outputs = outputs.concat(registry[t].emit(model, ctx))
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
    const cur = sharedMap.get(o.sharedFile) ?? { format: o.format, data: {} }
    mergeFragments(cur.data, o.data)
    sharedMap.set(o.sharedFile, cur)
  }
  for (const [rel, { format, data }] of sharedMap)
    if (Object.keys(data).length)
      files.push({ shared: true, format, path: rel, data, keys: Object.keys(data) })
  return { files, warnings }
}

const loadManifest = (root, cfg) => {
  const raw = readIf(path.join(root, cfg.sourceDir, MANIFEST))
  return raw ? JSON.parse(raw) : { version: 2, files: {} }
}

// Owned-key subset hash for a shared file — foreign-key edits never count as drift.
const ownedHashOf = (data, ownedKeys) => sha256(canonicalJson(pick(data, ownedKeys)))

function detectDrift(root, manifest) {
  const drifted = []
  for (const [rel, entry] of Object.entries(manifest.files)) {
    const abs = path.join(root, rel)
    if (entry.symlink || !fs.existsSync(abs)) continue
    const raw = fs.readFileSync(abs, 'utf8')
    if (entry.ownedKeys) {
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
function mergeShared(root, out, prevOwned, warnings) {
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
      const owned = out.keys.includes(k) || (prevOwned ?? []).includes(k)
      if (!owned) merged[k] = v // foreign key — preserved verbatim
    }
    for (const [k, v] of Object.entries(out.data)) {
      if (k in merged) warnings.push(`${out.path}: overwriting foreign key "${k}" (now owned)`)
      merged[k] = v
    }
  }
  return { content: serialize(out.format, merged), finalData: merged }
}

export function generate(root, { check = false, force = false, only = null, targets = null } = {}) {
  const cfg = loadConfig(root)
  const targetNames = targets ?? cfg.targets
  const manifest = loadManifest(root, cfg)
  const { files, warnings } = discover(root, cfg, { only, targetNames })
  const result = { written: [], pruned: [], drifted: [], unchanged: [], warnings }

  result.drifted = detectDrift(root, manifest)
  if (result.drifted.length && !force) {
    const err = new Error(
      `refusing to overwrite hand-edited outputs (use --force to discard):\n  ${result.drifted.join('\n  ')}`
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
      const m = mergeShared(root, out, prev?.ownedKeys, warnings)
      content = m.content
      entry = {
        format: out.format,
        ownedKeys: out.keys,
        ownedHash: ownedHashOf(m.finalData, out.keys),
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
      const abs = path.join(root, rel)
      if (entry.ownedKeys) {
        // shared file no longer produced: remove only our keys, keep foreign ones
        const raw = readIf(abs)
        if (raw !== null) {
          try {
            const data = parseByFormat(entry.format, raw)
            const foreign = Object.fromEntries(Object.entries(data).filter(([k]) => !entry.ownedKeys.includes(k)))
            if (!check) {
              if (Object.keys(foreign).length) writeFileEnsured(abs, serialize(entry.format, foreign))
              else fs.rmSync(abs)
            }
            result.pruned.push(rel)
          } catch {
            /* unparseable — leave it alone */
          }
        }
      } else if (fs.existsSync(abs) || isLink(abs)) {
        if (!check) fs.rmSync(abs)
        result.pruned.push(rel)
      }
    }
  } else {
    for (const [rel, entry] of Object.entries(manifest.files))
      if (!nextManifest.files[rel]) nextManifest.files[rel] = entry
  }

  if (!check) writeFileEnsured(path.join(root, cfg.sourceDir, MANIFEST), JSON.stringify(nextManifest, null, 2) + '\n')
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
