import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { computeDiff } from '../server/diff.mjs'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const DRIFT = path.join(FIXTURES, 'demo-drift')

test('a drifted (EDITED) file yields identical:false with add and del rows', () => {
  // .claude/settings.json drifts on a changed value (LOG_LEVEL) — one del
  // (source says "trace") + one add (disk says "warn").
  const diff = computeDiff(DRIFT, '.claude/settings.json')
  assert.equal(diff.path, '.claude/settings.json')
  assert.equal(diff.kind, 'text')
  assert.equal(diff.identical, false)
  assert.equal(diff.expectedLabel, 'generated from source')
  assert.equal(diff.actualLabel, 'on disk')
  assert.ok(diff.rows.some((r) => r.type === 'add'), 'expected at least one add row (on disk says)')
  assert.ok(diff.rows.some((r) => r.type === 'del'), 'expected at least one del row (source says)')
})

test('a drifted plain file with a pure append yields adds only', () => {
  const diff = computeDiff(DRIFT, '.codex/agents/reviewer.toml')
  assert.equal(diff.identical, false)
  assert.ok(diff.rows.some((r) => r.type === 'add'))
  assert.ok(diff.rows.every((r) => r.type !== 'del'))
})

test('a clean file yields identical:true', () => {
  const diff = computeDiff(DRIFT, '.claude/agents/reviewer.md')
  assert.equal(diff.kind, 'text')
  assert.equal(diff.identical, true)
  assert.ok(diff.rows.every((r) => r.type === 'ctx' || r.type === 'skip'))
})

test('a missing managed file reports kind missing', () => {
  const diff = computeDiff(DRIFT, '.mcp.json')
  assert.equal(diff.kind, 'missing')
  assert.equal(diff.identical, false)
  assert.ok(diff.rows.every((r) => r.type !== 'add'), 'an empty disk side has no add rows')
})

test('a symlink entry reports kind symlink with a target and no text rows', () => {
  const diff = computeDiff(DRIFT, '.claude/commands/ship.md')
  assert.equal(diff.kind, 'symlink')
  assert.equal(diff.rows.length, 0)
  assert.ok(diff.target.length > 0)
})

test('an unmanaged path returns the {error} shape', () => {
  const diff = computeDiff(DRIFT, 'not/a/managed/file.txt')
  assert.equal(diff.error, 'not managed')
})

// Same hashTree pattern as wire-safety.test.mjs's read-only test: prove
// computeDiff never writes anything into the tree it reads.
function hashTree(dir) {
  const hash = createHash('sha256')
  const walk = (d, prefix) => {
    for (const name of fs.readdirSync(d).sort()) {
      const abs = path.join(d, name)
      const rel = prefix ? `${prefix}/${name}` : name
      const st = fs.lstatSync(abs)
      if (st.isDirectory()) walk(abs, rel)
      else if (st.isSymbolicLink()) hash.update(`link:${rel}:${fs.readlinkSync(abs)}`)
      else hash.update(`file:${rel}:${fs.readFileSync(abs)}`)
    }
  }
  walk(dir, '')
  return hash.digest('hex')
}

test('computeDiff leaves the fixture tree byte-identical', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-dash-diff-readonly-'))
  const root = path.join(tmp, 'demo-drift')
  fs.cpSync(DRIFT, root, { recursive: true })
  try {
    const before = hashTree(root)
    computeDiff(root, '.codex/agents/reviewer.toml')
    computeDiff(root, '.claude/settings.json')
    computeDiff(root, '.claude/commands/ship.md')
    computeDiff(root, '.mcp.json')
    computeDiff(root, 'not/a/managed/file.txt')
    const after = hashTree(root)
    assert.equal(after, before, 'computeDiff must never mutate the tree it reads')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
