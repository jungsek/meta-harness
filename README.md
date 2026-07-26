# meta-harness

One-way config compiler for coding-agent harnesses: a single source-of-truth
directory compiles to native project config for **Claude Code, Codex CLI,
Cursor, OpenCode, Hermes Agent, and the `.agents/` standard**.

rulesync's model, cut down and sharpened: project scope only, six targets,
committed outputs, symlinks where bytes are identical, and a drift contract
that refuses to clobber hand edits.

```
npx meta-harness init               # scaffold source dir + config (commented examples)
npx meta-harness generate           # compile to native config for all enabled targets
npx meta-harness generate --check   # CI drift gate (exit 1 if stale or hand-edited)
npx meta-harness status             # manifest vs disk: clean / EDITED / MISSING
npx meta-harness targets            # list supported targets
```

## Source layout

```
.meta-harness/
├── rules/*.md                # markdown rules (+ optional frontmatter)
├── agents/*.md               # subagents: shared frontmatter + per-target blocks
├── commands/*.md             # slash commands
├── workflows/*.md            # Claude workflows
├── connections/mcp.jsonc     # canonical MCP server map + per-target overrides
├── env/env.jsonc             # env vars
├── hooks/hooks.jsonc         # canonical hook events (PascalCase) + per-target overrides
├── plugins/plugins.jsonc     # Claude enabledPlugins
└── settings/
    ├── claude.settings.jsonc # Claude-only keys (model, permissions, statusLine…)
    └── codex.config.toml     # Codex-only keys (approval_policy, sandbox_mode…)
```

Config at repo root — `meta-harness.jsonc` (+ optional `meta-harness.local.jsonc`
machine-local overlay, gitignore it):

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/jungsek/meta-harness/main/schema/meta-harness.schema.json",
  "sourceDir": ".meta-harness",       // point anywhere, e.g. ".harness"
  "targets": ["claude", "codex"]      // or "*" for all six
}
```

## Output matrix

| Source | claude | codex | cursor | opencode | agents | hermes |
|---|---|---|---|---|---|---|
| rules/ | `.claude/rules/` (symlink) | — ¹ | `.cursor/rules/*.mdc` | `.opencode/memories/` + `instructions[]` | `.agents/memories/` | — ¹ |
| agents/ | `.claude/agents/*.md` | `.codex/agents/*.toml` | `.cursor/agents/*.md` | `.opencode/agents/*.md` | `.agents/subagents/*.md` | JSON specs + Python plugin |
| commands/ | `.claude/commands/` (symlink) | — ² | `.cursor/commands/` | `.opencode/commands/` | `.agents/commands/` | — ² |
| workflows/ | `.claude/workflows/` (symlink) | — | — | — | — | — |
| mcp.jsonc | `.mcp.json` | `[mcp_servers]` in config.toml ³ | `.cursor/mcp.json` | `opencode.json` `mcp`+`tools` ³ | — | — ² |
| hooks.jsonc | `hooks` in settings.json | `.codex/hooks.json` | `.cursor/hooks.json` | generated JS plugin ⁴ | — | — ² |
| env.jsonc | `env` in settings.json | `[shell_environment_policy]` | — | — | — | — |
| plugins.jsonc | `enabledPlugins` | — | — | — | — | — |
| settings/ | rest of settings.json | rest of config.toml | — | — | — | — |

¹ Identity root files (`AGENTS.md`/`CLAUDE.md`) stay **hand-authored** — out of
tool scope. Codex and Hermes read them natively, so rules are not re-encoded
for them (generating `.hermes.md` would shadow your AGENTS.md).
² Global-only in that tool (`~/`); meta-harness never writes outside the project.
³ Real dialect translation per target — field renames, `type` handling,
`${VAR}` env-ref syntax, `disabled`→`enabled`, tool filters.
⁴ OpenCode has no hooks config file; meta-harness generates
`.opencode/plugins/meta-harness-hooks.js` from your canonical events.

## Frontmatter

Every source file takes `targets: ["*"]` (default) or a subset
(`["claude", "cursor"]`). Agents add per-target override blocks — keys only
that target's output sees:

```yaml
---
description: plans work, writes no code
targets: ["*"]
claude:
  model: inherit
cursor:
  readonly: true
hermes:
  toolsets: ["terminal", "file", "web"]
---
```

Hook events are canonical PascalCase (`PreToolUse`, `SessionStart`, …) in
Claude-shaped entries. Each target declares its supported subset; unsupported
events are **skipped with a warning**, never silently written.

MCP servers use the canonical (Claude-style) shape. Per-target overrides
replace a server wholesale; `null` deletes it for that target:

```jsonc
{
  "mcpServers": { "deepwiki": { "type": "http", "url": "https://mcp.deepwiki.com/mcp" } },
  "codex": { "mcpServers": { "deepwiki": null } }
}
```

## The contract

- **Symlink when bytes are identical**, generate when encoding differs.
  Symlinks are relative and survive clone.
- **Shared files are assembled from fragments** (`.claude/settings.json`,
  `.codex/config.toml`, `opencode.json`, `.cursor/mcp.json`). Same-key
  collision between fragments = hard error, not last-wins.
- **Foreign keys are yours.** In shared files, meta-harness owns only the keys
  it produces; anything you (or another tool) add is preserved verbatim and
  never counts as drift.
- **Hand edits to owned output abort `generate`** (SHA manifest at
  `<sourceDir>/.manifest.json`, committed). `--force` discards them.
- **Orphans are pruned.** Rename a source file → the old output is removed;
  a pruned shared file keeps its foreign keys.
- **Never touches `~/`.** Global runtime config is out of scope. Skills are
  out of scope (use `npx skills add`).

## CI

```yaml
- run: npx meta-harness generate --check   # fails if outputs are stale or hand-edited
```

`generate --json` and `status --json` for machines.

Full design + ratified decisions: [SPEC.md](SPEC.md).
