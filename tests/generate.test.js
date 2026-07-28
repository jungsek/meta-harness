import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { generate, status, uninstall } from '../src/engine.js'
import { isLink } from '../src/util.js'

const write = (root, rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), content)
}

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const readJson = (root, rel) => JSON.parse(read(root, rel))

function fixture({ targets = '["claude", "codex"]' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-'))
  write(root, 'meta-harness.jsonc', `{ "sourceDir": ".meta-harness", "targets": ${targets} }`)
  write(root, '.meta-harness/rules/style.md', '---\ndescription: TS style\n---\nUse 2-space indent.\n')
  write(
    root,
    '.meta-harness/agents/planner.md',
    '---\ndescription: plans things\ntargets: ["*"]\nclaude:\n  model: inherit\n---\nYou plan. You do not write code.\n'
  )
  write(root, '.meta-harness/commands/ship.md', '---\ndescription: ship it\n---\nRun checks then report.\n')
  write(
    root,
    '.meta-harness/connections/mcp.jsonc',
    `{
      "mcpServers": {
        "deepwiki": { "type": "http", "url": "https://mcp.deepwiki.com/mcp" },
        "files": { "command": "npx", "args": ["-y", "server-fs"], "env": { "KEY": "\${SECRET}" }, "enabledTools": ["read"] }
      },
      "codex": { "mcpServers": { "deepwiki": null } }
    }`
  )
  write(root, '.meta-harness/env/env.jsonc', '{ "vars": { "FOO": "bar" } }')
  write(
    root,
    '.meta-harness/hooks/hooks.jsonc',
    `{
      "hooks": {
        "PostToolUse": [{ "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "fmt.sh" }] }],
        "SessionEnd": [{ "hooks": [{ "type": "command", "command": "bye.sh" }] }]
      }
    }`
  )
  write(root, '.meta-harness/plugins/plugins.jsonc', '{ "enabledPlugins": ["caveman"] }')
  write(root, '.meta-harness/settings/claude.settings.jsonc', '{ "model": "opus", "permissions": { "deny": ["Read(.env)"] } }')
  write(root, '.meta-harness/settings/codex.config.toml', 'approval_policy = "on-request"\nsandbox_mode = "workspace-write"\n')
  return root
}

test('claude + codex output matrix', () => {
  const root = fixture()
  const res = generate(root)

  assert.ok(fs.lstatSync(path.join(root, '.claude/commands/ship.md')).isSymbolicLink(), 'command is symlink')

  // rules: one generated AGENTS.md + a CLAUDE.md import stub, no per-target rule files
  assert.match(read(root, 'AGENTS.md'), /2-space indent/)
  const stub = read(root, 'CLAUDE.md')
  assert.match(stub, /@AGENTS\.md/)
  assert.ok(!fs.lstatSync(path.join(root, 'CLAUDE.md')).isSymbolicLink(), 'stub is a real file, never a symlink')
  assert.ok(!fs.existsSync(path.join(root, '.claude/rules')), 'no .claude/rules emitted')

  const claudeAgent = read(root, '.claude/agents/planner.md')
  assert.match(claudeAgent, /model: inherit/)
  const codexAgent = read(root, '.codex/agents/planner.toml')
  assert.match(codexAgent, /developer_instructions = '''/)
  assert.ok(!codexAgent.includes('model'), 'claude-only key stays out of codex output')

  // mcp: claude gets both servers; codex override deletes deepwiki
  const mcp = readJson(root, '.mcp.json')
  assert.ok(mcp.mcpServers.deepwiki && mcp.mcpServers.files)
  const codexCfg = read(root, '.codex/config.toml')
  assert.ok(!codexCfg.includes('deepwiki'), 'null override deletes server for codex')
  assert.match(codexCfg, /\[mcp_servers\.files\]/)
  assert.match(codexCfg, /enabled_tools = \[ "read" \]/)
  assert.ok(!codexCfg.includes('type ='), 'type key dropped for codex')

  // hooks: claude gets both events in settings.json; codex hooks.json drops SessionEnd
  const settings = readJson(root, '.claude/settings.json')
  assert.ok(settings.hooks.PostToolUse && settings.hooks.SessionEnd)
  assert.deepStrictEqual(settings.env, { FOO: 'bar' })
  assert.strictEqual(settings.model, 'opus')
  // record, not array — an array makes Claude skip the whole settings file
  assert.deepStrictEqual(settings.enabledPlugins, { caveman: true })
  const codexHooks = readJson(root, '.codex/hooks.json')
  assert.ok(codexHooks.hooks.PostToolUse)
  assert.ok(!codexHooks.hooks.SessionEnd, 'codex-unsupported event skipped')
  assert.ok(res.warnings.some((w) => w.includes('SessionEnd')), 'skip produces warning')

  assert.match(codexCfg, /approval_policy = "on-request"/)
  assert.match(codexCfg, /FOO = "bar"/)
})

test('cursor / opencode / hermes targets', () => {
  const root = fixture({ targets: '["*"]' })
  generate(root)

  // cursor — rules come via AGENTS.md, not .mdc files
  assert.ok(!fs.existsSync(path.join(root, '.cursor/rules')), 'no .cursor/rules emitted')
  const cursorMcp = readJson(root, '.cursor/mcp.json')
  assert.strictEqual(cursorMcp.mcpServers.files.env.KEY, '${env:SECRET}')
  const cursorHooks = readJson(root, '.cursor/hooks.json')
  assert.deepStrictEqual(cursorHooks.hooks.postToolUse[0], {
    type: 'command',
    command: 'fmt.sh',
    matcher: 'Write|Edit',
  })
  assert.ok(cursorHooks.hooks.sessionEnd)
  assert.ok(read(root, '.cursor/agents/planner.md').includes('name: planner'))
  assert.ok(read(root, '.cursor/commands/ship.md').includes('description: ship it'))

  // opencode — no memories/instructions; rules come via AGENTS.md
  const oc = readJson(root, 'opencode.json')
  assert.ok(!oc.instructions, 'no instructions key')
  assert.ok(!fs.existsSync(path.join(root, '.opencode/memories')), 'no memories emitted')
  assert.strictEqual(oc.mcp.deepwiki.type, 'remote')
  assert.strictEqual(oc.mcp.files.type, 'local')
  assert.deepStrictEqual(oc.mcp.files.command, ['npx', '-y', 'server-fs'])
  assert.strictEqual(oc.mcp.files.environment.KEY, '{env:SECRET}')
  assert.deepStrictEqual(oc.tools, { files_read: true })
  const plugin = read(root, '.opencode/plugins/meta-harness-hooks.js')
  assert.match(plugin, /"tool.execute.after": async \(input\)/)
  assert.match(plugin, /new RegExp\("Write\|Edit"\)\.test\(input\.tool\)/)
  assert.ok(!plugin.includes('bye.sh'), 'SessionEnd has no opencode equivalent')

  // the .agents/ tree belongs to `npx skills add` — no target emits into it
  assert.ok(!fs.existsSync(path.join(root, '.agents')), 'nothing emitted under .agents/')

  // hermes
  const spec = readJson(root, '.hermes/meta-harness/subagents/planner.json')
  assert.strictEqual(spec.hermes.command, 'subagent_planner')
  assert.deepStrictEqual(spec.toolsets, ['terminal', 'file', 'web'])
  assert.ok(read(root, '.hermes/plugins/meta-harness-subagents/__init__.py').includes('register_command'))
})

test('idempotent: second run writes nothing', () => {
  const root = fixture({ targets: '["*"]' })
  generate(root)
  const res = generate(root)
  assert.strictEqual(res.written.length, 0)
  assert.strictEqual(res.pruned.length, 0)
})

test('drift: hand-edited output aborts without --force', () => {
  const root = fixture()
  generate(root)
  fs.appendFileSync(path.join(root, '.claude/agents/planner.md'), 'rogue\n')
  assert.throws(() => generate(root), /hand-edited/)
  const res = generate(root, { force: true })
  assert.ok(res.written.includes('.claude/agents/planner.md'))
})

test('foreign-key edits to shared files are NOT drift', () => {
  const root = fixture()
  generate(root)
  const p = path.join(root, '.claude/settings.json')
  const s = JSON.parse(fs.readFileSync(p, 'utf8'))
  s.statusLine = { left: 'custom' } // hand-added foreign key
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n')
  const res = generate(root) // no --force needed
  const after = readJson(root, '.claude/settings.json')
  assert.deepStrictEqual(after.statusLine, { left: 'custom' })
  assert.strictEqual(after.model, 'opus')
  assert.ok(!res.drifted.length)
  assert.strictEqual(status(root).find((r) => r.path === '.claude/settings.json').state, 'clean')
})

test('owned-key edits to shared files ARE drift', () => {
  const root = fixture()
  generate(root)
  const p = path.join(root, '.claude/settings.json')
  const s = JSON.parse(fs.readFileSync(p, 'utf8'))
  s.model = 'haiku' // owned key
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n')
  assert.throws(() => generate(root), /hand-edited/)
})

test('prune: removing a source file removes its output, foreign keys survive shared-file prune', () => {
  const root = fixture()
  generate(root)
  fs.rmSync(path.join(root, '.meta-harness/commands/ship.md'))
  const res = generate(root)
  assert.ok(res.pruned.includes('.claude/commands/ship.md'))
  assert.ok(!fs.existsSync(path.join(root, '.claude/commands/ship.md')))
})

test('check mode writes nothing', () => {
  const root = fixture()
  const res = generate(root, { check: true })
  assert.ok(res.written.length > 0)
  assert.ok(!fs.existsSync(path.join(root, '.claude/settings.json')))
})

test('fragment collision is a hard error', () => {
  const root = fixture()
  write(root, '.meta-harness/settings/claude.settings.jsonc', '{ "env": { "FOO": "clash" } }')
  assert.throws(() => generate(root), /fragment collision/)
})

test('validation: unknown target in frontmatter is an error', () => {
  const root = fixture()
  write(root, '.meta-harness/rules/bad.md', '---\ntargets: ["cluade"]\n---\nbody\n')
  assert.throws(() => generate(root), /unknown target "cluade"/)
})

test('validation: duplicate names error, jsonc error carries line number', () => {
  const root = fixture()
  write(root, '.meta-harness/agents/planner2.md', '---\nname: planner\ndescription: dup\n---\nbody\n')
  assert.throws(() => generate(root), /duplicate agents name "planner"/)
  fs.rmSync(path.join(root, '.meta-harness/agents/planner2.md'))
  write(root, '.meta-harness/connections/mcp.jsonc', '{\n  "mcpServers": {,}\n}')
  assert.throws(() => generate(root), /invalid JSONC in .*mcp\.jsonc:2/)
})

test('meta-harness.local.jsonc overrides project config', () => {
  const root = fixture()
  write(root, 'meta-harness.local.jsonc', '{ "targets": ["claude"] }')
  generate(root)
  assert.ok(fs.existsSync(path.join(root, '.claude/settings.json')))
  assert.ok(!fs.existsSync(path.join(root, '.codex')))
})

test('--targets partial run does not prune other targets', () => {
  const root = fixture()
  generate(root)
  const res = generate(root, { targets: ['claude'] })
  assert.strictEqual(res.pruned.length, 0)
  assert.ok(fs.existsSync(path.join(root, '.codex/config.toml')))
})

test('per-file targets frontmatter filters outputs', () => {
  const root = fixture({ targets: '["claude"]' })
  write(root, '.meta-harness/agents/codex-only.md', '---\ndescription: d\ntargets: ["codex"]\n---\nnope\n')
  generate(root)
  assert.ok(!fs.existsSync(path.join(root, '.claude/agents/codex-only.md')))
})

test('narrowed rule targets: included when a listed target is enabled, with a shared-file warning', () => {
  const root = fixture()
  write(root, '.meta-harness/rules/codex-only.md', '---\ntargets: ["codex"]\n---\ncodex prose\n')
  const res = generate(root)
  assert.match(read(root, 'AGENTS.md'), /codex prose/, 'rule lands in the shared file')
  assert.ok(res.warnings.some((w) => w.includes('narrows targets')))
})

test('path-scoped rules are rejected', () => {
  const root = fixture()
  write(root, '.meta-harness/rules/scoped.md', '---\npaths: ["**/*.ts"]\n---\nbody\n')
  assert.throws(() => generate(root), /paths:\/globs: is not supported/)
})

test('pre-existing hand CLAUDE.md is refused, --force adopts to the generated stub', () => {
  const root = fixture()
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Mine\n\n@AGENTS.md\n')
  assert.throws(() => generate(root), /did not write/)
  generate(root, { force: true })
  assert.match(read(root, 'CLAUDE.md'), /@AGENTS\.md/)
  assert.match(read(root, 'CLAUDE.md'), /Generated by meta-harness/)
})

test('CLI end-to-end: generate, status, targets, --json', () => {
  const root = fixture()
  const bin = path.resolve(import.meta.dirname, '../bin/meta-harness.js')
  const out = execFileSync('node', [bin, 'generate'], { cwd: root, encoding: 'utf8' })
  assert.match(out, /written/)
  const statusOut = execFileSync('node', [bin, 'status'], { cwd: root, encoding: 'utf8' })
  assert.match(statusOut, /clean/)
  const json = JSON.parse(execFileSync('node', [bin, 'generate', '--json'], { cwd: root, encoding: 'utf8' }))
  assert.ok(Array.isArray(json.written))
  const targetsOut = execFileSync('node', [bin, 'targets'], { cwd: root, encoding: 'utf8' })
  assert.match(targetsOut, /hermes/)
})

test('CLI init scaffolds examples idempotently', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-init-'))
  const bin = path.resolve(import.meta.dirname, '../bin/meta-harness.js')
  execFileSync('node', [bin, 'init', '--no-skill'], { cwd: root, encoding: 'utf8' })
  assert.ok(fs.existsSync(path.join(root, '.meta-harness/rules/example-rule.md')))
  assert.ok(fs.existsSync(path.join(root, 'meta-harness.jsonc')))
  const again = execFileSync('node', [bin, 'init', '--no-skill'], { cwd: root, encoding: 'utf8' })
  assert.match(again, /already initialized/)
})

test('HARNESS-REQUEST.md in the source root is never compiled', () => {
  const root = fixture()
  fs.writeFileSync(path.join(root, '.meta-harness/HARNESS-REQUEST.md'), '# request\n\nplain language\n')
  const res = generate(root)
  assert.ok(!res.written.some((p) => p.includes('HARNESS')), 'the request file must not produce output')
})

test('explain covers every category the loader reads', () => {
  const out = execFileSync('node', [path.resolve(import.meta.dirname, '../bin/meta-harness.js'), 'explain'], {
    encoding: 'utf8',
  })
  for (const c of ['rules', 'agents', 'commands', 'connections', 'hooks', 'env', 'plugins', 'permissions', 'settings'])
    assert.match(out, new RegExp(c), `explain must list ${c}`)
  for (const t of ['claude', 'codex', 'cursor', 'opencode', 'hermes']) assert.match(out, new RegExp(t))
})

test('explain <target> prints surfaces, nuances, and verified version', () => {
  const bin = path.resolve(import.meta.dirname, '../bin/meta-harness.js')
  const out = execFileSync('node', [bin, 'explain', 'codex'], { encoding: 'utf8' })
  assert.match(out, /verified: codex-cli 0\.145\.0/)
  assert.match(out, /generated AGENTS\.md/)
  assert.match(out, /directory trust/)
  assert.match(out, /developers\.openai\.com/)
  // 'agents' is both category and target — category wins
  const cat = execFileSync('node', [bin, 'explain', 'agents'], { encoding: 'utf8' })
  assert.match(cat, /Subagent definitions/)
})

test('empty mcpServers map emits no connection outputs', () => {
  const root = fixture({ targets: '["*"]' })
  write(root, '.meta-harness/connections/mcp.jsonc', '{ "mcpServers": {} }')
  generate(root)
  assert.ok(!fs.existsSync(path.join(root, '.mcp.json')), 'no empty .mcp.json')
  assert.ok(!fs.existsSync(path.join(root, '.cursor/mcp.json')), 'no empty .cursor/mcp.json')
  assert.ok(!read(root, '.codex/config.toml').includes('mcp_servers'), 'no empty [mcp_servers] table')
  assert.ok(!fs.existsSync(path.join(root, 'opencode.json')), 'no empty opencode.json')
})

test('codex: servers all filtered out (bad names) emit no [mcp_servers], with warnings', () => {
  const root = fixture()
  write(root, '.meta-harness/connections/mcp.jsonc', '{ "mcpServers": { "bad name!": { "command": "x" } } }')
  const res = generate(root)
  assert.ok(!read(root, '.codex/config.toml').includes('mcp_servers'))
  assert.ok(res.warnings.some((w) => w.includes('bad name!')))
})

test('first generate refuses an unparseable pre-existing shared file (no silent overwrite)', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, '.codex'), { recursive: true })
  fs.writeFileSync(path.join(root, '.codex/config.toml'), 'not valid toml: [\n')
  assert.throws(() => generate(root), /did not write/)
  assert.strictEqual(read(root, '.codex/config.toml'), 'not valid toml: [\n', 'file untouched')
  generate(root, { force: true }) // explicit opt-in still works
  assert.match(read(root, '.codex/config.toml'), /approval_policy/)
})

test('--only partial run preserves shared-file keys owned by unselected categories', () => {
  const root = fixture()
  generate(root)
  const before = read(root, '.codex/config.toml')
  assert.match(before, /\[mcp_servers\.files\]/)
  const res = generate(root, { only: ['env'] })
  assert.ok(!res.drifted.length)
  const after = read(root, '.codex/config.toml')
  assert.match(after, /\[mcp_servers\.files\]/, 'connection keys survive an env-only run')
  assert.match(after, /FOO = "bar"/)
  // and the manifest keeps the union of ownership — a following full run stays clean
  const full = generate(root)
  assert.strictEqual(full.written.length, 0)
})

test('legacy managed-block markers in AGENTS.md: migration refusal, --force converges', () => {
  const root = fixture()
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Mine\n\nprose\n\n<!-- meta-harness:start -->\n')
  assert.throws(() => generate(root), /pre-0\.18.*fully generated/)
  generate(root, { force: true })
  const md = read(root, 'AGENTS.md')
  assert.match(md, /Generated by meta-harness/)
  assert.ok(!md.includes('meta-harness:start'), 'markers gone — whole file regenerated')
  assert.strictEqual(generate(root).written.length, 0, 'clean and stable afterwards')
})

const BIN = path.resolve(import.meta.dirname, '../bin/meta-harness.js')
// Strip agent binaries from PATH so machine signals don't leak into detection tests.
const BARE_ENV = { ...process.env, PATH: '/usr/bin:/bin' }

test('init detects targets from repo signals; nothing found → default', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-detect-'))
  fs.mkdirSync(path.join(root, '.cursor'), { recursive: true })
  fs.writeFileSync(path.join(root, 'opencode.json'), '{}')
  const out = execFileSync(process.execPath, [BIN, 'init', '--no-skill'], { cwd: root, env: BARE_ENV, encoding: 'utf8' })
  assert.match(out, /\.cursor in repo/)
  const cfg = fs.readFileSync(path.join(root, 'meta-harness.jsonc'), 'utf8')
  assert.match(cfg, /"targets": \["cursor","opencode"\]/)

  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-detect-'))
  const out2 = execFileSync(process.execPath, [BIN, 'init', '--no-skill'], { cwd: bare, env: BARE_ENV, encoding: 'utf8' })
  assert.match(out2, /nothing detected/)
  assert.match(fs.readFileSync(path.join(bare, 'meta-harness.jsonc'), 'utf8'), /"targets": \["claude","codex"\]/)
})

test('init --targets overrides detection; existing config never rewritten', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-detect-'))
  execFileSync(process.execPath, [BIN, 'init', '--no-skill', '--targets', 'hermes'], { cwd: root, env: BARE_ENV, encoding: 'utf8' })
  assert.match(fs.readFileSync(path.join(root, 'meta-harness.jsonc'), 'utf8'), /"targets": \["hermes"\]/)
  const again = execFileSync(process.execPath, [BIN, 'init', '--no-skill', '--targets', 'claude'], { cwd: root, env: BARE_ENV, encoding: 'utf8' })
  assert.match(again, /already initialized/)
  assert.match(fs.readFileSync(path.join(root, 'meta-harness.jsonc'), 'utf8'), /"targets": \["hermes"\]/)
})

test('uninstall removes every trace; prose, foreign keys, and other skills survive', () => {
  const root = fixture()
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Mine\n\nkeep me.\n')
  write(root, '.agents/skills/meta-harness/SKILL.md', 'skill')
  write(root, '.agents/skills/other-skill/SKILL.md', 'other')
  write(
    root,
    'skills-lock.json',
    JSON.stringify({ version: 1, skills: { 'meta-harness': { source: 'x' }, 'other-skill': { source: 'y' } } })
  )
  generate(root, { force: true })
  // hand-added foreign key must survive uninstall
  const sp = path.join(root, '.claude/settings.json')
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'))
  s.statusLine = { left: 'custom' }
  fs.writeFileSync(sp, JSON.stringify(s, null, 2) + '\n')

  const res = uninstall(root, {})
  assert.ok(res.pruned.includes('CLAUDE.md'))
  assert.ok(res.pruned.includes('.meta-harness'))
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')), 'generated AGENTS.md removed')
  assert.deepStrictEqual(JSON.parse(read(root, '.claude/settings.json')), { statusLine: { left: 'custom' } })
  assert.ok(!fs.existsSync(path.join(root, '.claude/agents')), 'generated files gone')
  assert.ok(!fs.existsSync(path.join(root, '.meta-harness')), 'source dir gone')
  assert.ok(!fs.existsSync(path.join(root, 'meta-harness.jsonc')), 'config gone')
  assert.ok(!fs.existsSync(path.join(root, '.agents/skills/meta-harness')), 'skill gone')
  assert.ok(fs.existsSync(path.join(root, '.agents/skills/other-skill')), 'other skills kept')
  const lock = JSON.parse(read(root, 'skills-lock.json'))
  assert.ok(!lock.skills['meta-harness'] && lock.skills['other-skill'], 'only our lock entry removed')
})

test('uninstall refuses a sourceDir that escapes or equals the project root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-purge-'))
  write(root, 'meta-harness.jsonc', '{ "sourceDir": ".", "targets": ["claude"] }')
  write(root, 'precious.txt', 'keep')
  const res = uninstall(root, {})
  assert.ok(res.warnings.some((w) => w.includes('refusing')), 'warned')
  assert.ok(fs.existsSync(path.join(root, 'precious.txt')), 'repo not deleted')
})

test('uninstall refuses on hand-edited outputs without --force', () => {
  const root = fixture()
  generate(root)
  fs.appendFileSync(path.join(root, '.claude/agents/planner.md'), 'rogue\n')
  assert.throws(() => uninstall(root, {}), /hand-edited/)
  uninstall(root, { force: true })
  assert.ok(!fs.existsSync(path.join(root, '.claude/agents/planner.md')))
})

test('SKILL.md frontmatter is valid YAML with name and description', async () => {
  const matter = (await import('gray-matter')).default
  const raw = fs.readFileSync(path.resolve(import.meta.dirname, '../skills/meta-harness/SKILL.md'), 'utf8')
  const { data } = matter(raw) // throws on the unquoted-colon class of bug that broke `npx skills add`
  assert.ok(data.name && data.description)
})

test('show reports the source contents, not the outputs', () => {
  const root = fixture()
  const out = execFileSync('node', [path.resolve(import.meta.dirname, '../bin/meta-harness.js'), 'show'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.match(out, /planner/, 'lists subagents')
  assert.ok(!out.includes('.claude/'), 'must not list generated outputs')
})



test('unified permissions compile to both Claude and Codex dialects', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, '.meta-harness/permissions'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.meta-harness/permissions/permissions.jsonc'),
    JSON.stringify({ permission: { bash: { 'git status': 'allow', 'rm -rf *': 'deny' }, read: { '.env': 'deny' } } })
  )
  // the fixture's own settings must not also declare permissions
  fs.writeFileSync(path.join(root, '.meta-harness/settings/claude.settings.jsonc'), '{}')
  const res = generate(root)

  const claude = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'))
  assert.deepStrictEqual(claude.permissions.allow, ['Bash(git status)'])
  assert.deepStrictEqual(claude.permissions.deny, ['Bash(rm -rf *)', 'Read(.env)'])

  const starlark = fs.readFileSync(path.join(root, '.codex/rules/meta-harness.rules'), 'utf8')
  assert.match(starlark, /pattern = \["rm", "-rf", "\*"\]/)
  assert.match(starlark, /decision = "forbidden"/)
  assert.ok(!starlark.includes('.env'), 'read rules are Claude-only; codex policy is command-scoped')

  // Silent non-enforcement without directory trust is worth warning about.
  assert.ok(res.warnings.some((w) => w.includes('trusted directory')))
})

test('rejects an invalid permission decision instead of guessing', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, '.meta-harness/permissions'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.meta-harness/permissions/permissions.jsonc'),
    JSON.stringify({ permission: { bash: { ls: 'maybe' } } })
  )
  assert.throws(() => generate(root), /not allow, deny, or ask/)
})

test('fragment collision names both sources', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, '.meta-harness/permissions'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.meta-harness/permissions/permissions.jsonc'),
    JSON.stringify({ permission: { read: { '.env': 'deny' } } })
  )
  fs.writeFileSync(
    path.join(root, '.meta-harness/settings/claude.settings.jsonc'),
    JSON.stringify({ permissions: { deny: ['Read(something-else)'] } })
  )
  assert.throws(() => generate(root), /permissions\/ and settings\/|settings\/ and permissions\//)
})

test('AGENTS.md is fully generated; root rule leads; hand edits are drift', () => {
  const root = fixture()
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Mine\n\nProse I wrote.\n')
  fs.writeFileSync(
    path.join(root, '.meta-harness/rules/identity.md'),
    '---\ndescription: d\nroot: true\n---\n\n# Identity\n'
  )
  assert.throws(() => generate(root), /did not write/, 'hand-written file refused without --force')
  generate(root, { force: true })
  const md = () => fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')

  assert.match(md(), /# Identity/, 'rules land in the file')
  assert.ok(md().indexOf('# Identity') < md().indexOf('2-space indent'), 'root: true leads the file')
  assert.ok(!md().includes('Prose I wrote'), 'whole-file output — hand prose belongs in rules/')

  // any hand edit to the output is drift now
  fs.appendFileSync(path.join(root, 'AGENTS.md'), '\nMore prose.\n')
  assert.throws(() => generate(root), /hand-edited/)
})
test('native permission knobs live with the permissions they modify', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, '.meta-harness/permissions'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.meta-harness/permissions/permissions.jsonc'),
    JSON.stringify({
      permission: { bash: { 'rm -rf *': 'deny' } },
      codex: { approval_policy: 'on-request', sandbox_mode: 'workspace-write' },
      claude: { defaultMode: 'acceptEdits' },
    })
  )
  fs.writeFileSync(path.join(root, '.meta-harness/settings/claude.settings.jsonc'), '{}')
  generate(root)
  assert.match(fs.readFileSync(path.join(root, '.codex/config.toml'), 'utf8'), /approval_policy = "on-request"/)
  const claude = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'))
  assert.strictEqual(claude.defaultMode, 'acceptEdits')
})

test('first generate refuses to destroy pre-existing config it did not write', () => {
  const root = fixture()
  // adopter's hand-written command, at a path we are about to claim
  fs.mkdirSync(path.join(root, '.claude/commands'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/commands/ship.md'), 'MY COMMAND\n')
  fs.writeFileSync(path.join(root, '.meta-harness/commands/ship.md'), '---\ndescription: d\n---\nGenerated\n')

  // The manifest is empty on a first run, so the manifest-based drift check
  // sees nothing — this is the case that used to silently clobber.
  assert.throws(() => generate(root), /did not write/)
  assert.strictEqual(fs.readFileSync(path.join(root, '.claude/commands/ship.md'), 'utf8'), 'MY COMMAND\n')

  // --force is the explicit adoption opt-in
  generate(root, { force: true })
  assert.ok(isLink(path.join(root, '.claude/commands/ship.md')), 'adopted after --force')
})
