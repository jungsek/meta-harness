/**
 * Bundled sample data, shaped exactly like the wire contract in ../types.ts.
 *
 * It exists so the UI is buildable and reviewable while the server lane is
 * still landing `dashboard/server/index.mjs`. `api.ts` prefers the real
 * endpoints and only falls back here when the API is not reachable (network
 * error, 404, or a non-JSON reply). Nothing in the component tree knows the
 * difference; the top bar states which one is on screen.
 */
import type { Reference, RootsResponse, Snapshot, StatusPoll } from '@/types'

const ROOT = '/Users/dev/acme-api'

export const mockSnapshot = (): Snapshot => ({
  root: ROOT,
  sourceDir: '.meta-harness',
  configured: true,
  sourceExists: true,
  generatedAt: new Date().toISOString(),
  durationMs: 214,
  plan: {
    mode: 'reconcile',
    targets: ['claude', 'codex'],
    proposed: ['cursor', 'opencode'],
    imports: [
      {
        target: 'codex',
        category: 'agents',
        name: 'release-notes',
        kind: 'file',
        detail: '.codex/agents/release-notes.md',
      },
      {
        target: 'claude',
        category: 'commands',
        name: 'smoke',
        kind: 'file',
        detail: '.claude/commands/smoke.md',
      },
    ],
    conflicts: [
      {
        target: 'claude',
        category: 'permissions',
        name: 'bash',
        kind: 'value',
        detail: 'both sides changed since the last generate',
        prefer: 'source',
        source: {
          bash: { 'git status': 'allow', 'git push': 'ask', 'rm -rf *': 'deny', '*': 'ask' },
        },
        native: {
          bash: { 'git status': 'allow', 'git push': 'allow', 'npm publish': 'allow', '*': 'ask' },
        },
      },
      {
        target: 'codex',
        category: 'settings',
        name: 'codex.config.toml',
        kind: 'value',
        detail: 'sandbox_mode differs between the source and the native file',
        prefer: 'source',
        source: { approval_policy: 'never', sandbox_mode: 'workspace-write', model: 'gpt-5-codex' },
        native: { approval_policy: 'on-request', sandbox_mode: 'danger-full-access', model: 'gpt-5-codex' },
      },
    ],
    unsupported: [
      {
        target: 'codex',
        path: '.meta-harness/plugins/plugins.jsonc',
        reason: 'codex has no plugin surface — the source keeps it, codex never sees it',
      },
      {
        target: 'codex',
        path: '.meta-harness/commands/smoke.md',
        reason: 'codex prompts are global-only, so a repo-scoped command cannot be emitted for codex',
      },
    ],
    generates: [
      { target: 'claude', path: 'CLAUDE.md' },
      { target: 'claude', path: '.claude/settings.json' },
      { target: 'claude', path: '.claude/agents/planner.md' },
      { target: 'claude', path: '.mcp.json' },
      { target: 'codex', path: 'AGENTS.md' },
      { target: 'codex', path: '.codex/config.toml' },
      { target: 'codex', path: '.codex/hooks.json' },
    ],
    clean: [
      { target: 'claude', category: 'rules', name: 'safety' },
      { target: 'claude', category: 'rules', name: 'style' },
      { target: 'claude', category: 'agents', name: 'planner' },
      { target: 'claude', category: 'connections', name: 'deepwiki' },
      { target: 'codex', category: 'rules', name: 'safety' },
      { target: 'codex', category: 'rules', name: 'style' },
      { target: 'codex', category: 'agents', name: 'planner' },
      { target: 'codex', category: 'env', name: 'PROJECT_MODE' },
    ],
    warnings: [
      'codex skipped hook event PreCompact — the runtime has no equivalent.',
      '.claude/settings.json has drifted since the last generate.',
    ],
    scanned: ['.claude', '.codex', '.cursor', '.mcp.json', 'AGENTS.md', 'CLAUDE.md'],
  },
  model: {
    rules: [
      {
        name: 'safety',
        file: '.meta-harness/rules/safety.md',
        targets: ['*'],
        description: 'Safety floor — protected domains and secrets',
        fm: { description: 'Safety floor — protected domains and secrets', root: true },
        body: '# Safety\n\nStop for human review: migrations, auth, payments, API contracts, CI config.\nNever print a secret. Never read `.env*` values aloud.',
      },
      {
        name: 'style',
        file: '.meta-harness/rules/style.md',
        targets: ['*'],
        description: 'House style for this repo',
        fm: { description: 'House style for this repo' },
        body: '# Style\n\nTypeScript strict. No default exports. Tests beside the code they cover.',
      },
      {
        name: 'review',
        file: '.meta-harness/rules/review.md',
        targets: ['claude', 'codex'],
        description: 'Review discipline before any merge',
        fm: { description: 'Review discipline before any merge', targets: ['claude', 'codex'] },
        body: '# Review\n\nEvery PR gets a second pass. Infrastructure changes get two.',
      },
    ],
    agents: [
      {
        name: 'planner',
        file: '.meta-harness/agents/planner.md',
        targets: ['*'],
        description: 'Breaks work into verifiable steps. Writes no code.',
        fm: { description: 'Breaks work into verifiable steps. Writes no code.' },
        body: 'Output a numbered plan with acceptance checks. Never write code.',
        perTarget: { claude: { model: 'inherit' }, codex: { model: 'gpt-5-codex' } },
      },
      {
        name: 'release-notes',
        file: '.meta-harness/agents/release-notes.md',
        targets: ['codex'],
        description: 'Turns a merged range into user-facing notes.',
        fm: { description: 'Turns a merged range into user-facing notes.', targets: ['codex'] },
        body: 'Read the commit range. Group by user-visible change. No internal refactors.',
      },
    ],
    commands: [
      {
        name: 'smoke',
        file: '.meta-harness/commands/smoke.md',
        targets: ['*'],
        description: 'Verify the harness compiled cleanly',
        fm: { description: 'Verify the harness compiled cleanly' },
        body: 'Run `meta-harness status` and report whether every output is clean.',
      },
      {
        name: 'ship',
        file: '.meta-harness/commands/ship.md',
        targets: ['claude'],
        description: 'Branch, PR, review, merge',
        fm: { description: 'Branch, PR, review, merge', targets: ['claude'] },
        body: 'Branch from main, push, open a PR, request the second review, then merge.',
      },
    ],
    mcp: {
      servers: {
        deepwiki: { type: 'http', url: 'https://mcp.deepwiki.com/mcp' },
        postgres: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'] },
      },
      perTarget: { codex: { deepwiki: null } },
      file: '.meta-harness/connections/mcp.jsonc',
    },
    hooks: [
      {
        event: 'SessionStart',
        entries: [{ hooks: [{ type: 'command', command: 'date >> .sessions.log' }] }],
      },
      {
        event: 'PreCompact',
        entries: [{ hooks: [{ type: 'command', command: 'node scripts/snapshot.mjs' }] }],
      },
    ],
    env: { PROJECT_MODE: 'dev', LOG_LEVEL: 'debug' },
    plugins: { enabledPlugins: ['ponytail@jungsek', 'caveman@jungsek'], file: '.meta-harness/plugins/plugins.jsonc' },
    permissions: {
      permission: {
        bash: { 'git status': 'allow', 'git push': 'ask', 'rm -rf *': 'deny', '*': 'ask' },
        read: { '.env': 'deny' },
      },
      codex: { approval_policy: 'never', sandbox_mode: 'workspace-write' },
    },
    settings: {
      claude: { model: 'opus', enableAllProjectMcpServers: true },
      codex: { approval_policy: 'never', sandbox_mode: 'workspace-write', model: 'gpt-5-codex' },
    },
    issues: [
      {
        level: 'warn',
        file: '.meta-harness/agents/release-notes.md',
        message: 'targets lists "codex" only — claude will not receive this agent.',
      },
    ],
    counts: {
      rules: 3,
      agents: 2,
      commands: 2,
      connections: 2,
      hooks: 2,
      env: 2,
      plugins: 2,
      permissions: 2,
      settings: 2,
    },
  },
  detection: [
    {
      target: 'claude',
      repo: ['.claude', 'CLAUDE.md', '.mcp.json'],
      bin: 'claude',
      enabled: true,
      proposed: false,
      supports: ['rules', 'agents', 'commands', 'connections', 'hooks', 'env', 'plugins', 'permissions', 'settings'],
      outputs: ['CLAUDE.md', '.claude/settings.json', '.claude/agents/planner.md', '.mcp.json'],
    },
    {
      target: 'codex',
      repo: ['.codex', 'AGENTS.md'],
      bin: 'codex',
      enabled: true,
      proposed: false,
      supports: ['rules', 'agents', 'connections', 'hooks', 'env', 'permissions', 'settings'],
      outputs: ['AGENTS.md', '.codex/config.toml', '.codex/hooks.json', '.codex/agents/release-notes.md'],
    },
    {
      target: 'cursor',
      repo: ['.cursor'],
      bin: null,
      enabled: false,
      proposed: true,
      supports: ['rules', 'agents', 'commands', 'connections', 'hooks'],
      outputs: [],
    },
    {
      target: 'opencode',
      repo: [],
      bin: 'opencode',
      enabled: false,
      proposed: true,
      supports: ['rules', 'agents', 'commands', 'connections', 'hooks'],
      outputs: [],
    },
    {
      target: 'hermes',
      repo: [],
      bin: null,
      enabled: false,
      proposed: false,
      supports: ['rules', 'agents'],
      outputs: [],
    },
  ],
  status: [
    { path: 'CLAUDE.md', state: 'clean', target: 'claude', category: 'rules' },
    { path: '.claude/settings.json', state: 'EDITED', target: 'claude', category: 'settings' },
    { path: '.claude/agents/planner.md', state: 'clean', target: 'claude', category: 'agents' },
    { path: '.claude/commands', state: 'link', target: 'claude', category: 'commands' },
    { path: '.mcp.json', state: 'clean', target: 'claude', category: 'connections' },
    { path: 'AGENTS.md', state: 'clean', target: 'codex', category: 'rules' },
    { path: '.codex/config.toml', state: 'EDITED', target: 'codex', category: 'settings' },
    { path: '.codex/hooks.json', state: 'clean', target: 'codex', category: 'hooks' },
    { path: '.codex/agents/release-notes.md', state: 'MISSING', target: 'codex', category: 'agents' },
    { path: '.codex/rules/meta-harness.rules', state: 'clean', target: 'codex', category: 'permissions' },
  ],
  drift: {
    stale: true,
    drifted: ['.claude/settings.json', '.codex/config.toml'],
    error: null,
  },
  trustGates: [
    {
      target: 'codex',
      gate: 'directory trust',
      relevant: true,
      blocks: ['.codex/rules/meta-harness.rules', '.codex/hooks.json'],
      hint: 'Run `codex` once in this directory and accept the trust prompt, or the generated permission rules stay inert.',
    },
    {
      target: 'claude',
      gate: '/hooks accept',
      relevant: true,
      blocks: ['.claude/settings.json'],
      hint: 'Open Claude Code in this repo and run `/hooks` once to accept the generated hook entries.',
    },
    {
      target: 'claude',
      gate: 'folder trust',
      relevant: false,
      blocks: [],
      hint: 'Nothing generated here depends on folder trust.',
    },
  ],
  error: null,
})

export const mockStatus = (): StatusPoll => {
  const snap = mockSnapshot()
  return { status: snap.status, drift: snap.drift, generatedAt: new Date().toISOString() }
}

export const mockReference = (): Reference => ({
  categories: {
    rules: {
      where: '<sourceDir>/rules/*.md',
      what: 'Policy and identity prose the agents must follow.',
      frontmatter:
        'description (string), targets (array, default ["*"] — decides inclusion only; AGENTS.md is shared), root (bool — leads the generated AGENTS.md; use it for identity).',
      example: '---\ndescription: Safety floor — protected domains and secrets\n---\n# Safety\nStop for human review: migrations, auth, payments, API contracts, CI config.',
      goes: 'a fully generated AGENTS.md — read natively by codex, cursor, opencode, hermes; Claude reads it through a generated CLAUDE.md @AGENTS.md stub',
    },
    agents: {
      where: '<sourceDir>/agents/*.md',
      what: 'Subagent definitions. Body is the system prompt.',
      frontmatter:
        'description (string, required), targets (array), plus per-target blocks: claude/codex/cursor/opencode/hermes — keys only that target sees',
      example: '---\ndescription: Breaks work into verifiable steps. Writes no code.\nclaude:\n  model: inherit\n---\nOutput a numbered plan with acceptance checks. Never write code.',
      goes: 'all five targets, each in its native encoding',
    },
    commands: {
      where: '<sourceDir>/commands/*.md',
      what: 'Slash commands. Body is the prompt.',
      frontmatter: 'description (string), targets (array)',
      goes: 'claude (symlink), cursor, opencode. codex prompts are global-only.',
    },
    connections: {
      where: '<sourceDir>/connections/mcp.jsonc',
      what: 'MCP servers, canonical (Claude-shaped) map. Per-target overrides replace a server wholesale; null deletes it.',
      frontmatter: 'n/a — JSONC',
      goes: '.mcp.json, codex [mcp_servers], .cursor/mcp.json, opencode.json — real dialect translation each',
    },
    hooks: {
      where: '<sourceDir>/hooks/hooks.jsonc',
      what: 'Hook events, canonical PascalCase, Claude-shaped entries. Unsupported events are skipped per target with a warning.',
      frontmatter: 'n/a — JSONC.',
      goes: 'claude settings.json, .codex/hooks.json (needs one-time interactive trust), .cursor/hooks.json, generated opencode plugin',
    },
    env: {
      where: '<sourceDir>/env/env.jsonc',
      what: 'Environment variables for agent sessions.',
      frontmatter: 'n/a — JSONC',
      goes: 'claude env block, codex [shell_environment_policy]',
    },
    plugins: {
      where: '<sourceDir>/plugins/plugins.jsonc',
      what: 'Claude enabledPlugins list.',
      frontmatter: 'n/a — JSONC',
      goes: 'claude only',
    },
    permissions: {
      where: '<sourceDir>/permissions/permissions.jsonc',
      what: 'Unified permissions — one declaration, enforced in every runtime that can. Values: allow | deny | ask.',
      frontmatter: 'n/a — JSONC.',
      goes: 'claude permissions block; codex .codex/rules/meta-harness.rules Starlark prefix_rules (needs directory trust to take effect)',
    },
    settings: {
      where: '<sourceDir>/settings/claude.settings.jsonc and <sourceDir>/settings/codex.config.toml',
      what: 'Native per-runtime keys in each tool’s own dialect, for anything the unified categories do not cover.',
      frontmatter: 'n/a — JSONC / TOML',
      goes: 'merged into .claude/settings.json and .codex/config.toml alongside the other fragments',
    },
  },
  targets: {
    claude: {
      verified: 'claude-code 2.x (hooks, permissions, env, MCP live)',
      docs: 'https://code.claude.com/docs',
      surfaces: {
        rules: 'generated CLAUDE.md stub → @AGENTS.md',
        agents: '.claude/agents/*.md',
        commands: '.claude/commands/ (symlink)',
        connections: '.mcp.json',
        hooks: 'hooks in .claude/settings.json',
      },
    },
    codex: {
      verified: 'codex 0.4x (config.toml, hooks.json, Starlark rules)',
      docs: 'https://developers.openai.com/codex',
      surfaces: {
        rules: 'generated AGENTS.md',
        agents: '.codex/agents/*.md',
        connections: '[mcp_servers] in .codex/config.toml',
        hooks: '.codex/hooks.json (one-time interactive trust)',
      },
      nuances: ['Hook entries stay inert until the directory is trusted.'],
    },
    cursor: { docs: 'https://docs.cursor.com', surfaces: { rules: '.cursor/rules/*.mdc' } },
    opencode: { docs: 'https://opencode.ai/docs', surfaces: { rules: 'AGENTS.md' } },
    hermes: { docs: 'https://hermes.dev', surfaces: { rules: 'AGENTS.md' } },
  },
  knownTargets: ['claude', 'codex', 'cursor', 'opencode', 'hermes'],
  canonicalEvents: [
    'SessionStart',
    'SessionEnd',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'Stop',
    'SubagentStop',
    'PreCompact',
    'Notification',
  ],
})

export const mockRoots = (): RootsResponse => ({
  roots: [
    { path: ROOT, label: 'acme-api', configured: true },
    { path: '/Users/dev/acme-api/dashboard/fixtures/bootstrap', label: 'fixture · bootstrap', configured: false },
    { path: '/Users/dev/acme-api/dashboard/fixtures/reconcile', label: 'fixture · reconcile', configured: true },
  ],
})
