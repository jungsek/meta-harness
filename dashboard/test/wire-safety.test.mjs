import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { getSnapshot, getStatusPoll, validateRoot } from '../server/collect.mjs'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

test('sourceWrites never reaches the wire', () => {
  const snap = getSnapshot(path.join(FIXTURES, 'demo-drift'))
  assert.equal(snap.plan.sourceWrites, undefined)
  assert.ok(!JSON.stringify(snap).includes('sourceWrites'))
})

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out)
  return out
}

test('every file/path on the wire is root-relative, never absolute', () => {
  const root = path.join(FIXTURES, 'demo-drift')
  const snap = getSnapshot(root)
  for (const row of snap.status) assert.ok(!path.isAbsolute(row.path), `status path leaked absolute: ${row.path}`)
  for (const row of snap.detection) for (const p of row.outputs) assert.ok(!path.isAbsolute(p), `detection output leaked absolute: ${p}`)
  for (const gate of snap.trustGates) for (const p of gate.blocks) assert.ok(!path.isAbsolute(p), `trust gate block leaked absolute: ${p}`)
  for (const item of [...snap.model.rules, ...snap.model.agents, ...snap.model.commands])
    assert.ok(!path.isAbsolute(item.file), `model item file leaked absolute: ${item.file}`)
  for (const issue of snap.model.issues) assert.ok(!path.isAbsolute(issue.file), `model issue file leaked absolute: ${issue.file}`)
  // Belt and braces: no string field anywhere on the wire should contain the
  // fixture's own absolute path (the strongest signal of a leaked root path)
  // — except `root` itself, which CONTRACT.md defines as the echoed absolute
  // root the caller queried.
  const rest = Object.fromEntries(Object.entries(snap).filter(([k]) => k !== 'root'))
  for (const s of collectStrings(rest)) assert.ok(!s.includes(root), `wire payload leaked the absolute root: ${s}`)
})

test('status() on a manifest-less root yields [], not a throw', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-dash-empty-'))
  try {
    const poll = getStatusPoll(tmp)
    assert.deepEqual(poll.status, [])
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('validateRoot rejects a traversal-y or relative root', () => {
  assert.throws(() => validateRoot('../etc'))
  assert.throws(() => validateRoot(`${FIXTURES}/../fixtures/demo-full`))
  assert.throws(() => validateRoot(''))
  assert.throws(() => validateRoot(null))
})

test('validateRoot rejects a root that does not exist', () => {
  assert.throws(() => validateRoot(path.join(FIXTURES, 'does-not-exist')))
})

test('validateRoot accepts a real absolute fixture directory', () => {
  assert.equal(validateRoot(path.join(FIXTURES, 'demo-full')), path.join(FIXTURES, 'demo-full'))
})

test('validateRoot rejections are marked as the caller\'s fault (status 400)', () => {
  try {
    validateRoot('not-absolute')
    assert.fail('expected a throw')
  } catch (e) {
    assert.equal(e.status, 400)
  }
})

test('a corrupt manifest is a real failure, not a silent empty status', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-dash-corrupt-'))
  const root = path.join(tmp, 'demo-full')
  fs.cpSync(path.join(FIXTURES, 'demo-full'), root, { recursive: true })
  try {
    fs.writeFileSync(path.join(root, '.meta-harness/.manifest.json'), '{ not valid json')
    assert.throws(() => getStatusPoll(root), /Unexpected token|JSON/)
    assert.throws(() => getSnapshot(root), /Unexpected token|JSON/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

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

test('a snapshot call leaves the fixture tree byte-identical', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-dash-readonly-'))
  const root = path.join(tmp, 'demo-drift')
  fs.cpSync(path.join(FIXTURES, 'demo-drift'), root, { recursive: true })
  try {
    const before = hashTree(root)
    getSnapshot(root)
    getStatusPoll(root)
    const after = hashTree(root)
    assert.equal(after, before, 'snapshot/status must never mutate the tree they read')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
