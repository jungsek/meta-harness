// View-model derivation edge cases (Codex review 2026-07-29: the map's
// interpretation layer was untested). derive.ts has type-only imports, so
// node's type stripping can load it without a bundler.
import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveSyncMap, deriveVerdict } from '../src/lib/derive.ts'

const BASE = {
  root: '/tmp/x',
  sourceDir: '.meta-harness',
  configured: true,
  sourceExists: true,
  generatedAt: '2026-07-29T00:00:00Z',
  durationMs: 1,
  model: null,
  detection: [
    { target: 'claude', repo: ['.claude'], bin: 'claude', enabled: true, proposed: false, supports: [], outputs: [] },
    { target: 'codex', repo: [], bin: null, enabled: true, proposed: false, supports: [], outputs: [] },
  ],
  status: [],
  drift: { stale: false, drifted: [], error: null },
  trustGates: [],
  error: null,
}

const plan = (over = {}) => ({
  mode: 'reconcile',
  targets: ['claude', 'codex'],
  proposed: [],
  imports: [],
  conflicts: [],
  unsupported: [],
  generates: [],
  clean: [],
  warnings: [],
  scanned: [],
  ...over,
})

test('shared generates stay out of lanes and never inflate lane counts', () => {
  const m = deriveSyncMap({
    ...BASE,
    plan: plan({
      generates: [
        { target: 'claude', path: '.claude/settings.json' },
        { target: 'shared', path: 'AGENTS.md' },
        { target: 'shared', path: 'CLAUDE.md' },
      ],
    }),
  })
  assert.equal(m.lanes.get('claude').generateCount, 1)
  assert.equal(m.lanes.get('codex').generateCount, 0)
  assert.equal(m.shared.generates.length, 2)
  const laneTotal = [...m.lanes.values()].reduce((n, l) => n + l.generateCount, 0)
  assert.equal(laneTotal + m.shared.generates.length, 3) // matches the CLI plan exactly
})

test('a conflict on an unknown/shared target is never pinned to a lane', () => {
  const m = deriveSyncMap({
    ...BASE,
    plan: plan({
      conflicts: [
        { target: 'shared', category: 'rules', name: 'AGENTS.md', source: 'a', native: 'b', prefer: null },
        { target: 'claude', category: 'connections', name: 'linear', source: 'a', native: 'b', prefer: null },
      ],
    }),
  })
  assert.equal(m.shared.conflicts.length, 1)
  assert.equal(m.lanes.get('claude').conflicts.length, 1)
  assert.equal(m.lanes.get('codex').conflicts.length, 0)
})

test('env renders from the flat wire map', () => {
  const m = deriveSyncMap({
    ...BASE,
    model: {
      rules: [],
      agents: [],
      commands: [],
      mcp: null,
      hooks: null,
      env: { A: '1', B: '2' },
      plugins: null,
      permissions: null,
      settings: { claude: null, codex: null },
      issues: [],
      counts: {},
    },
    plan: plan(),
  })
  const env = m.source.categories.find((c) => c.category === 'env')
  assert.deepEqual(
    env.items.map((i) => i.name),
    ['A', 'B'],
  )
})

test('bootstrap-with-nothing does not throw and teaches the first command', () => {
  const m = deriveSyncMap({ ...BASE, configured: false, sourceExists: false, plan: null, detection: [], status: [] })
  assert.equal(m.verdict.tone, 'action')
  assert.match(m.verdict.command, /meta-harness sync/)
  assert.equal(m.panels.length, 0)
})

test('verdict priority: conflicts beat imports beat clean', () => {
  const conflicted = deriveVerdict({
    ...BASE,
    plan: plan({
      conflicts: [{ target: 'claude', category: 'x', name: 'y' }],
      imports: [{ target: 'claude', category: 'x', name: 'z', kind: 'changed' }],
    }),
  })
  assert.equal(conflicted.tone, 'conflict')
  const clean = deriveVerdict({ ...BASE, plan: plan() })
  assert.equal(clean.tone, 'ok')
  assert.equal(clean.command, null)
})

test('shared status rows land on the source panel, not the first target', () => {
  const m = deriveSyncMap({
    ...BASE,
    plan: plan(),
    status: [
      { path: 'AGENTS.md', state: 'clean', target: null, category: 'rules' },
      { path: '.claude/settings.json', state: 'EDITED', target: 'claude', category: 'settings' },
    ],
  })
  assert.deepEqual(
    m.shared.files.map((f) => f.path),
    ['AGENTS.md'],
  )
  const claude = m.panels.find((p) => p.target === 'claude')
  assert.ok(!claude.groups.flatMap((g) => g.files).some((f) => f.path === 'AGENTS.md'))
  assert.equal(claude.attention, 1)
})
