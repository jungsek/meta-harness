import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse as parseToml } from 'smol-toml'
import { generate, status } from '../src/engine.js'
import { syncApply, syncPlan } from '../src/sync.js'

const write = (root, rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), content)
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const readJson = (root, rel) => JSON.parse(read(root, rel))
const readToml = (root, rel) => parseToml(read(root, rel))
const exists = (root, rel) => fs.existsSync(path.join(root, rel))
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mh-sync-t-'))
const TARGETS = ['claude', 'codex'] // explicit everywhere: detection depends on the host PATH

// A repo someone actually works in: .claude/ by hand, no meta-harness.
function claudeOnly() {
  const root = tmp()
  write(
    root,
    '.mcp.json',
    JSON.stringify({ mcpServers: { linear: { type: 'http', url: 'https://mcp.linear.app/mcp' } } }, null, 2)
  )
  write(
    root,
    '.claude/settings.json',
    JSON.stringify(
      {
        model: 'opus',
        env: { FOO: 'bar' },
        enabledPlugins: { 'caveman@jungsek': true },
        permissions: { deny: ['Read(.env)'], allow: ['Bash(git status)'] },
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'bye.sh' }] }] },
      },
      null,
      2
    )
  )
  write(root, 'AGENTS.md', '# House rules\n\nAlways run the tests before you say done.\n')
  return root
}

// A repo already compiled by meta-harness.
function managed({ extraSource = () => {} } = {}) {
  const root = tmp()
  write(root, 'meta-harness.jsonc', `{ "sourceDir": ".meta-harness", "targets": ["claude", "codex"] }`)
  write(root, '.meta-harness/rules/style.md', '---\ndescription: style\n---\nUse 2-space indent.\n')
  write(
    root,
    '.meta-harness/connections/mcp.jsonc',
    JSON.stringify({ mcpServers: { deepwiki: { type: 'http', url: 'https://mcp.deepwiki.com/mcp' } } }, null, 2)
  )
  write(root, '.meta-harness/env/env.jsonc', JSON.stringify({ vars: { FOO: 'bar' } }))
  write(
    root,
    '.meta-harness/hooks/hooks.jsonc',
    JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'fmt.sh' }] }] } })
  )
  extraSource(root)
  generate(root)
  return root
}

test('bootstrap: claude-only repo gains a working codex without questions', () => {
  const root = claudeOnly()

  const before = fs.readdirSync(root).sort()
  const plan = syncPlan(root, { targets: TARGETS })
  assert.equal(plan.mode, 'bootstrap')
  assert.deepEqual(fs.readdirSync(root).sort(), before, 'syncPlan never writes')
  assert.equal(plan.conflicts.length, 0)
  assert.ok(plan.imports.some((i) => i.category === 'connections' && i.name === 'linear' && i.kind === 'new'))
  assert.ok(plan.imports.some((i) => i.category === 'rules' && i.name === 'AGENTS.md'))
  assert.ok(plan.generates.includes('.codex/config.toml'), 'plan predicts the codex output')

  const res = syncApply(root, { targets: TARGETS })
  assert.ok(res.written.includes('.codex/config.toml'))

  // source now exists and is the truth
  assert.ok(exists(root, 'meta-harness.jsonc'))
  const mcp = JSON.parse(read(root, '.meta-harness/connections/mcp.jsonc'))
  assert.deepEqual(mcp.mcpServers.linear, { type: 'http', url: 'https://mcp.linear.app/mcp' })
  const perms = JSON.parse(read(root, '.meta-harness/permissions/permissions.jsonc'))
  assert.equal(perms.permission.read['.env'], 'deny')
  assert.equal(perms.permission.bash['git status'], 'allow')
  assert.ok(!('permissions' in JSON.parse(read(root, '.meta-harness/settings/claude.settings.jsonc'))), 'permissions never land in settings/')
  assert.equal(JSON.parse(read(root, '.meta-harness/settings/claude.settings.jsonc')).model, 'opus')
  assert.deepEqual(JSON.parse(read(root, '.meta-harness/plugins/plugins.jsonc')).enabledPlugins, ['caveman@jungsek'])
  assert.match(read(root, '.meta-harness/rules/imported.md'), /Always run the tests/)

  // codex is live: MCP + hooks + rules
  const codex = readToml(root, '.codex/config.toml')
  assert.equal(codex.mcp_servers.linear.url, 'https://mcp.linear.app/mcp')
  assert.equal(codex.shell_environment_policy.set.FOO, 'bar')
  assert.ok(readJson(root, '.codex/hooks.json').hooks.Stop, 'hook reached codex')
  assert.match(read(root, 'AGENTS.md'), /Always run the tests/)
  assert.match(read(root, 'CLAUDE.md'), /@AGENTS\.md/)

  // claude's own surface survived the round trip
  const settings = readJson(root, '.claude/settings.json')
  assert.equal(settings.model, 'opus')
  assert.deepEqual(settings.permissions.deny, ['Read(.env)'])
  assert.ok(settings.hooks.Stop)
  assert.equal(readJson(root, '.mcp.json').mcpServers.linear.type, 'http')

  // end state invariant: source == manifest == every target
  assert.deepEqual(status(root).filter((r) => r.state !== 'clean' && r.state !== 'link'), [])
})

test('reconcile: native MCP add + hook edit fold back and propagate', () => {
  const root = managed()

  const mcp = readJson(root, '.mcp.json')
  mcp.mcpServers.linear = { type: 'http', url: 'https://mcp.linear.app/mcp' }
  write(root, '.mcp.json', JSON.stringify(mcp, null, 2) + '\n')
  const settings = readJson(root, '.claude/settings.json')
  settings.hooks.PostToolUse[0].hooks[0].command = 'format-all.sh'
  write(root, '.claude/settings.json', JSON.stringify(settings, null, 2) + '\n')

  const plan = syncPlan(root, {})
  assert.equal(plan.mode, 'reconcile')
  assert.equal(plan.conflicts.length, 0)
  assert.deepEqual(
    plan.imports.map((i) => `${i.category}/${i.name}/${i.kind}`).sort(),
    ['connections/linear/new', 'hooks/PostToolUse/changed']
  )
  assert.ok(plan.clean.some((c) => c.category === 'env' && c.name === 'FOO'))

  syncApply(root, {})
  const src = JSON.parse(read(root, '.meta-harness/connections/mcp.jsonc'))
  assert.ok(src.mcpServers.linear, 'native-only server folded into the source')
  assert.ok(src.mcpServers.deepwiki, 'existing source entries survive the fold')
  const hooks = JSON.parse(read(root, '.meta-harness/hooks/hooks.jsonc'))
  assert.equal(hooks.hooks.PostToolUse[0].hooks[0].command, 'format-all.sh')

  // propagated to codex, and the manifest is clean again
  const codex = readToml(root, '.codex/config.toml')
  assert.ok(codex.mcp_servers.linear)
  assert.equal(readJson(root, '.codex/hooks.json').hooks.PostToolUse[0].hooks[0].command, 'format-all.sh')
  assert.deepEqual(status(root).filter((r) => r.state !== 'clean' && r.state !== 'link'), [])
})

test('a synced repo plans nothing', () => {
  const root = managed()
  const plan = syncPlan(root, {})
  assert.deepEqual({ imports: plan.imports, conflicts: plan.conflicts, generates: plan.generates }, {
    imports: [],
    conflicts: [],
    generates: [],
  })
  assert.ok(plan.clean.length > 0)
})

test('conflict: same item edited in the source and natively', () => {
  const root = managed()
  // source side
  write(
    root,
    '.meta-harness/connections/mcp.jsonc',
    JSON.stringify({
      mcpServers: {
        deepwiki: { type: 'http', url: 'https://mcp.deepwiki.com/mcp' },
        linear: { type: 'http', url: 'https://source.example/mcp' },
      },
    })
  )
  // native side, same item, different value
  const mcp = readJson(root, '.mcp.json')
  mcp.mcpServers.linear = { type: 'http', url: 'https://native.example/mcp' }
  write(root, '.mcp.json', JSON.stringify(mcp, null, 2) + '\n')

  const plan = syncPlan(root, {})
  assert.equal(plan.conflicts.length, 1)
  assert.deepEqual(
    { ...plan.conflicts[0], detail: undefined, prefer: undefined },
    {
      target: 'claude',
      category: 'connections',
      name: 'linear',
      source: { type: 'http', url: 'https://source.example/mcp' },
      native: { type: 'http', url: 'https://native.example/mcp' },
      detail: undefined,
      prefer: undefined,
    }
  )
  assert.throws(() => syncApply(root, {}), (e) => e.conflicts?.length === 1 && /--prefer/.test(e.message))
  // nothing was written by the refused run
  assert.equal(readJson(root, '.mcp.json').mcpServers.linear.url, 'https://native.example/mcp')

  syncApply(root, { prefer: 'native' })
  assert.equal(
    JSON.parse(read(root, '.meta-harness/connections/mcp.jsonc')).mcpServers.linear.url,
    'https://native.example/mcp'
  )
  assert.equal(readToml(root, '.codex/config.toml').mcp_servers.linear.url, 'https://native.example/mcp')
})

test('conflict: --prefer source discards the native edit', () => {
  const root = managed()
  const settings = readJson(root, '.claude/settings.json')
  settings.env.FOO = 'native'
  write(root, '.claude/settings.json', JSON.stringify(settings, null, 2) + '\n')
  write(root, '.meta-harness/env/env.jsonc', JSON.stringify({ vars: { FOO: 'source' } }))

  assert.equal(syncPlan(root, {}).conflicts.length, 1)
  syncApply(root, { prefer: 'source' })
  assert.equal(JSON.parse(read(root, '.meta-harness/env/env.jsonc')).vars.FOO, 'source')
  assert.equal(readJson(root, '.claude/settings.json').env.FOO, 'source')
  assert.equal(readToml(root, '.codex/config.toml').shell_environment_policy.set.FOO, 'source')
})

test('unmanaged AGENTS.md imports verbatim, with provenance', () => {
  const root = tmp()
  write(root, 'meta-harness.jsonc', `{ "sourceDir": ".meta-harness", "targets": ["claude", "codex"] }`)
  write(root, '.meta-harness/env/env.jsonc', JSON.stringify({ vars: { FOO: 'bar' } }))
  write(root, 'AGENTS.md', '# Hand written\n\nNever push to main.\n')

  const plan = syncPlan(root, {})
  assert.deepEqual(
    plan.imports.filter((i) => i.category === 'rules'),
    [{ target: 'shared', category: 'rules', name: 'AGENTS.md', kind: 'new', detail: 'unmanaged' }]
  )

  syncApply(root, {})
  const imported = read(root, '.meta-harness/rules/imported.md')
  assert.match(imported, /imported by meta-harness sync from AGENTS\.md/)
  assert.match(imported, /# Hand written\n\nNever push to main\./)
  assert.match(read(root, 'AGENTS.md'), /Never push to main\./)
  assert.deepEqual(status(root).filter((r) => r.state !== 'clean' && r.state !== 'link'), [])
})

test('codex config.toml reverse-translates into canonical source shape', () => {
  const root = tmp()
  write(
    root,
    '.codex/config.toml',
    [
      'approval_policy = "on-request"',
      'model = "gpt-5"',
      '',
      '[shell_environment_policy]',
      'inherit = "all"',
      '',
      '[shell_environment_policy.set]',
      'FOO = "bar"',
      '',
      '[mcp_servers.files]',
      'command = "npx"',
      'args = ["-y", "server-fs"]',
      'enabled = false',
      'enabled_tools = ["read"]',
      '',
      '[mcp_servers.files.env_vars]',
      'KEY = "v"',
      '',
    ].join('\n')
  )
  write(root, '.codex/agents/planner.toml', `name = "planner"\ndescription = "plans"\ndeveloper_instructions = '''\nYou plan.\n'''\n`)

  syncApply(root, { targets: TARGETS })

  const server = JSON.parse(read(root, '.meta-harness/connections/mcp.jsonc')).mcpServers.files
  assert.deepEqual(server, {
    command: 'npx',
    args: ['-y', 'server-fs'],
    disabled: true,
    enabledTools: ['read'],
    envVars: { KEY: 'v' },
  })
  assert.equal(JSON.parse(read(root, '.meta-harness/env/env.jsonc')).vars.FOO, 'bar')
  assert.equal(JSON.parse(read(root, '.meta-harness/env/env.jsonc')).codex.shell_environment_policy.inherit, 'all')
  assert.equal(JSON.parse(read(root, '.meta-harness/permissions/permissions.jsonc')).codex.approval_policy, 'on-request')
  assert.match(read(root, '.meta-harness/settings/codex.config.toml'), /model = "gpt-5"/)
  const agent = read(root, '.meta-harness/agents/planner.md')
  assert.match(agent, /description: plans/)
  assert.match(agent, /You plan\./)
  // …and the asymmetry heals: claude now has what only codex had
  assert.equal(readJson(root, '.mcp.json').mcpServers.files.command, 'npx')
  assert.ok(exists(root, '.claude/agents/planner.md'))
})

test('cursor config is inventoried, never touched', () => {
  const root = claudeOnly()
  write(root, '.cursor/mcp.json', JSON.stringify({ mcpServers: { x: { url: 'https://x' } } }))
  const before = read(root, '.cursor/mcp.json')

  const plan = syncPlan(root, { targets: TARGETS })
  assert.deepEqual(
    plan.unsupported.map((u) => ({ target: u.target, path: u.path })),
    [{ target: 'cursor', path: '.cursor/mcp.json' }]
  )
  assert.ok(!plan.imports.some((i) => i.target === 'cursor'))
  syncApply(root, { targets: TARGETS })
  assert.equal(read(root, '.cursor/mcp.json'), before, 'inventory-only target is left byte-identical')
})

test('repairs the .claude/skills mirror, never the skill itself', () => {
  const root = managed()
  write(root, '.agents/skills/meta-harness/SKILL.md', '# skill\n')
  const res = syncApply(root, {})
  assert.ok(res.written.includes('.claude/skills/meta-harness'))
  assert.equal(read(root, '.claude/skills/meta-harness/SKILL.md'), '# skill\n')
  assert.ok(!exists(root, '.meta-harness/skills'), 'skills dirs are never imported')
})

test('unparseable native settings aborts before anything is written', () => {
  const root = managed()
  write(root, '.claude/settings.json', '{ "model": "opus", ')
  assert.throws(() => syncPlan(root, {}), /\.claude\/settings\.json: cannot parse/)
  assert.throws(() => syncApply(root, {}), /cannot parse/)
  assert.equal(read(root, '.claude/settings.json'), '{ "model": "opus", ', 'left exactly as found')
})

test('refuses to force-generate over config it never scanned', () => {
  const root = managed({
    extraSource: (r) => write(r, '.meta-harness/commands/ship.md', '---\ndescription: ship\n---\nShip it.\n'),
  })
  // a cursor command the user wrote by hand, on a path generate would claim
  write(root, 'meta-harness.jsonc', `{ "sourceDir": ".meta-harness", "targets": ["claude", "codex", "cursor"] }`)
  write(root, '.cursor/commands/ship.md', 'my own version\n')
  const mcp = readJson(root, '.mcp.json')
  mcp.mcpServers.linear = { type: 'http', url: 'https://mcp.linear.app/mcp' }
  write(root, '.mcp.json', JSON.stringify(mcp, null, 2) + '\n')

  const src = read(root, '.meta-harness/connections/mcp.jsonc')
  assert.throws(() => syncApply(root, {}), /cannot import/)
  assert.equal(read(root, '.cursor/commands/ship.md'), 'my own version\n')
  assert.equal(read(root, '.meta-harness/connections/mcp.jsonc'), src, 'refused before the fold — repo untouched')
})
