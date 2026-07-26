// Per-category source schema. Single source of the file shapes — the skill
// points here rather than restating them, so docs can't drift from the code.

export const CATEGORIES = {
  rules: {
    where: '<sourceDir>/rules/*.md',
    what: 'Policy and identity prose the agents must follow.',
    frontmatter:
      'description (string), targets (array, default ["*"] — decides inclusion only; AGENTS.md is shared), root (bool — leads the AGENTS.md block; use it for identity). paths:/globs: rejected — rules load unconditionally.',
    example: `---
description: Safety floor — protected domains and secrets
---
# Safety
Stop for human review: migrations, auth, payments, API contracts, CI config.`,
    goes: 'one managed block in AGENTS.md — read natively by codex, cursor, opencode, hermes, .agents; Claude reads it through a generated CLAUDE.md @AGENTS.md stub',
  },
  agents: {
    where: '<sourceDir>/agents/*.md',
    what: 'Subagent definitions. Body is the system prompt.',
    frontmatter:
      'description (string, required), targets (array), plus per-target blocks: claude/codex/cursor/opencode/hermes — keys only that target sees',
    example: `---
description: Breaks work into verifiable steps. Writes no code.
claude:
  model: inherit
hermes:
  toolsets: ["terminal", "file"]
---
Output a numbered plan with acceptance checks. Never write code.`,
    goes: 'all six targets, each in its native encoding',
  },
  commands: {
    where: '<sourceDir>/commands/*.md',
    what: 'Slash commands. Body is the prompt.',
    frontmatter: 'description (string), targets (array)',
    example: `---
description: Verify the harness compiled cleanly
---
Run \`meta-harness status\` and report whether every output is clean.`,
    goes: 'claude (symlink), agents, cursor, opencode. codex prompts are global-only.',
  },
  connections: {
    where: '<sourceDir>/connections/mcp.jsonc',
    what: 'MCP servers, canonical (Claude-shaped) map. Per-target overrides replace a server wholesale; null deletes it.',
    frontmatter: 'n/a — JSONC',
    example: `{
  "mcpServers": {
    "deepwiki": { "type": "http", "url": "https://mcp.deepwiki.com/mcp" }
  },
  "codex": { "mcpServers": { "deepwiki": null } }
}`,
    goes: '.mcp.json, codex [mcp_servers], .cursor/mcp.json, opencode.json — real dialect translation each',
  },
  hooks: {
    where: '<sourceDir>/hooks/hooks.jsonc',
    what: 'Hook events, canonical PascalCase, Claude-shaped entries. Unsupported events are skipped per target with a warning.',
    frontmatter: 'n/a — JSONC. Events: SessionStart SessionEnd PreToolUse PostToolUse UserPromptSubmit Stop PreCompact …',
    example: `{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "date >> .sessions.log" }] }
    ]
  },
  "codex": { "hooks": { "SessionStart": [ /* cwd-relative — $CLAUDE_PROJECT_DIR is Claude-only */ ] } }
}`,
    goes: 'claude settings.json, .codex/hooks.json (needs one-time interactive trust), .cursor/hooks.json, generated opencode plugin',
  },
  env: {
    where: '<sourceDir>/env/env.jsonc',
    what: 'Environment variables for agent sessions.',
    frontmatter: 'n/a — JSONC',
    example: `{ "vars": { "PROJECT_MODE": "dev" } }`,
    goes: 'claude env block, codex [shell_environment_policy]',
  },
  plugins: {
    where: '<sourceDir>/plugins/plugins.jsonc',
    what: 'Claude enabledPlugins list.',
    frontmatter: 'n/a — JSONC',
    example: `{ "enabledPlugins": ["some-plugin@marketplace"] }`,
    goes: 'claude only',
  },
  permissions: {
    where: '<sourceDir>/permissions/permissions.jsonc',
    what: 'Unified permissions — one declaration, enforced in every runtime that can. Values: allow | deny | ask.',
    frontmatter: 'n/a — JSONC. permission.{bash,edit,read,write,webfetch}, plus native blocks: codex (approval_policy, sandbox_mode), claude (defaultMode).',
    example: `{
  "permission": {
    "bash": { "git status": "allow", "rm -rf *": "deny", "*": "ask" },
    "read": { ".env": "deny" }
  }
}`,
    goes: 'claude permissions block; codex .codex/rules/meta-harness.rules Starlark prefix_rules (needs directory trust to take effect)',
  },
  settings: {
    where: '<sourceDir>/settings/claude.settings.jsonc and <sourceDir>/settings/codex.config.toml',
    what: 'Native per-runtime keys in each tool’s own dialect, for anything the unified categories do not cover.',
    frontmatter: 'n/a — JSONC / TOML',
    example: `// claude.settings.jsonc  (permissions belong in permissions/, not here)
{ "model": "opus", "enableAllProjectMcpServers": true }

# codex.config.toml
approval_policy = "never"
sandbox_mode = "workspace-write"`,
    goes: 'merged into .claude/settings.json and .codex/config.toml alongside the other fragments',
  },
}

// Per-target manuals: managed surfaces, measured nuances (each carrying the
// version they were verified against so drift is attributable), vendor docs
// by link. `verified` is only claimed where we actually measured.
export const TARGETS = {
  claude: {
    verified: null,
    docs: 'https://code.claude.com/docs',
    surfaces: {
      rules: 'CLAUDE.md stub (managed block) → @AGENTS.md',
      agents: '.claude/agents/*.md',
      commands: '.claude/commands/ (symlink)',
      connections: '.mcp.json',
      hooks: 'hooks in .claude/settings.json',
      env: 'env in .claude/settings.json',
      plugins: 'enabledPlugins in .claude/settings.json',
      permissions: 'permissions in .claude/settings.json',
      settings: 'rest of .claude/settings.json',
    },
    nuances: [
      'Claude reads CLAUDE.md, not AGENTS.md — the generated stub import is its only path to the rules',
      'the stub is a real file, never a symlink — Claude refuses to write through a symlinked CLAUDE.md',
      '$CLAUDE_PROJECT_DIR exists only here — hook commands using it die on every other target',
      '.claude/settings.json is shared: meta-harness owns only the keys it produces',
    ],
  },
  codex: {
    verified: 'codex-cli 0.145.0',
    docs: 'https://developers.openai.com/codex',
    surfaces: {
      rules: 'AGENTS.md block (managed)',
      agents: '.codex/agents/*.toml',
      commands: '— global-only, skipped',
      connections: '[mcp_servers] in .codex/config.toml',
      hooks: '.codex/hooks.json',
      env: '[shell_environment_policy] in .codex/config.toml',
      permissions: '.codex/rules/meta-harness.rules (Starlark exec policy)',
      settings: 'rest of .codex/config.toml',
    },
    nuances: [
      'hooks and exec policy are inert until you accept directory trust — run `codex` once here',
      'AGENTS.md family only replaces — AGENTS.override.md > AGENTS.md > .codex/AGENTS.md, never concatenated',
      'project_doc_fallback_filenames is a true fallback, not additive — ignored whenever AGENTS.md exists',
      'from the .agents/ tree codex reads only .agents/skills/ and .agents/plugins/marketplace.json',
      '$CLAUDE_PROJECT_DIR does not exist here',
    ],
  },
  cursor: {
    verified: null,
    docs: 'https://cursor.com/docs',
    surfaces: {
      rules: 'AGENTS.md block (managed) — read natively',
      agents: '.cursor/agents/*.md',
      commands: '.cursor/commands/*.md',
      connections: '.cursor/mcp.json',
      hooks: '.cursor/hooks.json',
    },
    nuances: [
      'hook events are camelCase and a subset — unsupported canonical events are skipped with a warning',
      'env refs use ${env:VAR} — translated from the canonical ${VAR} automatically',
    ],
  },
  opencode: {
    verified: null,
    docs: 'https://opencode.ai/docs',
    surfaces: {
      rules: 'AGENTS.md block (managed) — read natively',
      agents: '.opencode/agents/*.md',
      commands: '.opencode/commands/*.md',
      connections: 'mcp + tools in opencode.json',
      hooks: '.opencode/plugins/meta-harness-hooks.js (generated plugin)',
    },
    nuances: [
      'no native hooks file exists — hooks compile to a generated plugin module',
      'opencode.json is shared: owned keys mcp and tools, foreign keys preserved',
      'env refs use {env:VAR}',
    ],
  },
  agents: {
    verified: null,
    docs: 'https://agents.md',
    surfaces: {
      rules: 'AGENTS.md block (managed)',
      agents: '.agents/subagents/*.md',
      commands: '.agents/commands/*.md',
    },
    nuances: [
      'a layout standard, not a runtime — consumers vary; .agents/skills/ is owned by `npx skills add`, never touched here',
    ],
  },
  hermes: {
    verified: null,
    docs: null,
    surfaces: {
      rules: 'AGENTS.md block (managed) — read natively',
      agents: '.hermes/meta-harness/subagents/*.json + registration plugin',
    },
    nuances: [
      'project scope is subagents only — MCP, hooks, permissions, commands live in ~/.hermes/config.yaml (global, never written)',
      'project-doc discovery order: .hermes.md → HERMES.md → AGENTS.md → CLAUDE.md',
    ],
  },
}

export function explainTarget(name, bold, dim) {
  const t = TARGETS[name]
  if (!t) return null
  const pad = (s) => s.padEnd(14)
  return [
    `${bold(name)}${t.verified ? `${' '.repeat(Math.max(1, 40 - name.length))}verified: ${t.verified}` : ''}`,
    '',
    ...Object.entries(t.surfaces).map(([k, v]) => `${pad(k)} ${v}`),
    '',
    bold('nuances'),
    ...t.nuances.map((n) => `  · ${n}`),
    ...(t.docs ? ['', `${bold('docs')}  ${dim(t.docs)}`] : []),
    '',
  ].join('\n')
}

export function explain(name, bold) {
  const c = CATEGORIES[name]
  if (!c) return null
  return [
    bold(name),
    `  ${c.what}`,
    '',
    `${bold('file')}         ${c.where}`,
    `${bold('frontmatter')}  ${c.frontmatter}`,
    `${bold('compiles to')}  ${c.goes}`,
    '',
    bold('example'),
    c.example
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
    '',
  ].join('\n')
}
