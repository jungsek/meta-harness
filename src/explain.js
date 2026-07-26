// Per-category source schema. Single source of the file shapes — the skill
// points here rather than restating them, so docs can't drift from the code.

export const CATEGORIES = {
  rules: {
    where: '<sourceDir>/rules/*.md',
    what: 'Policy and identity prose the agents must follow.',
    frontmatter: 'description (string), targets (array, default ["*"]), globs/paths (array, cursor scoping), root (bool — leads the AGENTS.md block; use it for identity)',
    example: `---
description: Safety floor — protected domains and secrets
---
# Safety
Stop for human review: migrations, auth, payments, API contracts, CI config.`,
    goes: 'claude (symlink), agents, cursor (.mdc), opencode (+ instructions[]), codex (.codex/harness-rules.md — path-scoped rules skipped there)',
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
