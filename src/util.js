import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseJsoncRaw } from 'jsonc-parser'

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

export const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null)

// A file named exactly README.md in a source category dir documents the dir,
// it is never model content — exported so callers outside model.js (sync.js's
// non-definition skip) can't drift from this exclusion.
export const isDocFile = (name) => name === 'README.md'

export const listMd = (dir) => {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md') && !isDocFile(e.name))
    .map((e) => path.join(dir, e.name))
    .sort()
}

// JSONC parse with line/col in the error message.
export function parseJsonc(raw, file) {
  const errors = []
  const data = parseJsoncRaw(raw, errors, { allowTrailingComma: true })
  if (errors.length) {
    const line = raw.slice(0, errors[0].offset).split('\n').length
    throw new Error(`invalid JSONC in ${file}:${line}`)
  }
  return data
}

export const readJsonc = (p) => {
  const raw = readIf(p)
  return raw === null ? null : parseJsonc(raw, p)
}

// Deterministic deep merge; throws on scalar/shape conflict so fragment
// collisions are hard errors, not last-wins.
export function mergeFragments(base, add, keyPath = '', owners = new Map(), source = '?') {
  for (const [k, v] of Object.entries(add)) {
    const at = keyPath ? `${keyPath}.${k}` : k
    if (!(k in base)) {
      base[k] = v
      claimAll(v, at, owners, source) // nested paths too, so a later collision can name us
    } else if (isObj(base[k]) && isObj(v)) mergeFragments(base[k], v, at, owners, source)
    else if (JSON.stringify(base[k]) !== JSON.stringify(v))
      throw new Error(
        `fragment collision on "${at}": ${owners.get(at) ?? 'one source'} and ${source} set different values — declare it in only one of them`
      )
  }
  return base
}

// Last-wins deep merge (config overlays, not fragments).
export function overlay(base, add) {
  for (const [k, v] of Object.entries(add)) {
    if (isObj(base[k]) && isObj(v)) overlay(base[k], v)
    else base[k] = v
  }
  return base
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)

// Record this source as owner of a key and everything beneath it.
function claimAll(value, at, owners, source) {
  owners.set(at, source)
  if (isObj(value)) for (const [k, v] of Object.entries(value)) claimAll(v, `${at}.${k}`, owners, source)
}

export const sortKeys = (x) => {
  if (Array.isArray(x)) return x.map(sortKeys)
  if (x !== null && typeof x === 'object')
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .map((k) => [k, sortKeys(x[k])])
    )
  return x
}

export const canonicalJson = (x) => JSON.stringify(sortKeys(x))

export const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]))

export const writeFileEnsured = (p, content) => {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

export const relSymlink = (target, linkPath) => {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  const rel = path.relative(path.dirname(linkPath), target)
  if (fs.existsSync(linkPath) || isLink(linkPath)) fs.rmSync(linkPath, { recursive: true })
  fs.symlinkSync(rel, linkPath)
  return rel
}

export const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}
