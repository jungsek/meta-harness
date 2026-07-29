import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { getSnapshot } from '../server/collect.mjs'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

test('demo-full: configured, clean, no conflicts', () => {
  const snap = getSnapshot(path.join(FIXTURES, 'demo-full'))
  assert.equal(snap.error, null)
  assert.equal(snap.configured, true)
  assert.equal(snap.sourceExists, true)
  assert.equal(snap.plan.mode, 'reconcile')
  assert.equal(snap.plan.conflicts.length, 0)
  assert.ok(snap.plan.clean.length > 0)
  assert.ok(snap.status.every((s) => s.state === 'clean' || s.state === 'link'))
})

test('demo-drift: yields a real conflict with both sides present', () => {
  const snap = getSnapshot(path.join(FIXTURES, 'demo-drift'))
  assert.ok(snap.plan.conflicts.length >= 1, 'expected at least one conflict')
  const conflict = snap.plan.conflicts.find((c) => c.name === 'LOG_LEVEL')
  assert.ok(conflict, 'expected the LOG_LEVEL conflict')
  assert.notEqual(conflict.source, undefined)
  assert.notEqual(conflict.native, undefined)
  assert.notEqual(conflict.source, conflict.native)
})

test('demo-drift: yields an EDITED status row', () => {
  const snap = getSnapshot(path.join(FIXTURES, 'demo-drift'))
  assert.ok(snap.status.some((s) => s.state === 'EDITED'))
})

test('demo-drift: yields a MISSING status row', () => {
  const snap = getSnapshot(path.join(FIXTURES, 'demo-drift'))
  const missing = snap.status.find((s) => s.state === 'MISSING')
  assert.ok(missing, 'expected a MISSING row')
  assert.equal(missing.path, '.mcp.json')
})

test('demo-drift: yields a pending generate', () => {
  const snap = getSnapshot(path.join(FIXTURES, 'demo-drift'))
  assert.ok(snap.plan.generates.some((g) => g.path === '.claude/commands/audit.md'))
})

test('demo-drift: yields an unsupported item', () => {
  const snap = getSnapshot(path.join(FIXTURES, 'demo-drift'))
  assert.ok(snap.plan.unsupported.some((u) => u.target === 'cursor'))
})

test('demo-drift: yields at least one warning', () => {
  const snap = getSnapshot(path.join(FIXTURES, 'demo-drift'))
  assert.ok(snap.plan.warnings.length >= 1)
})

test('demo-bootstrap: mode is bootstrap, unconfigured, no model', () => {
  const snap = getSnapshot(path.join(FIXTURES, 'demo-bootstrap'))
  assert.equal(snap.configured, false)
  assert.equal(snap.sourceExists, false)
  assert.equal(snap.model, null)
  assert.equal(snap.plan.mode, 'bootstrap')
  assert.ok(snap.plan.imports.length > 0)
})
