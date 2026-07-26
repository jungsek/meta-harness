# meta-harness

One-way config compiler for coding-agent harnesses: a single source-of-truth
directory compiles to native project config for **Claude Code, Codex CLI,
Cursor, OpenCode, Hermes Agent, and the `.agents/` standard**.

Write your rules, subagents, commands, MCP servers, hooks, and settings once —
`generate` compiles them into each tool's native dialect. Project scope only,
committed outputs, symlinks where bytes are identical, and a drift contract
that refuses to clobber hand edits.

```
npm install -g @jungsek/meta-harness
```

```
meta-harness init               # scaffold source dir + config, install the agent skill
meta-harness generate           # compile to native config for all enabled targets
meta-harness generate --check   # CI drift gate (exit 1 if stale or hand-edited)
meta-harness status             # manifest vs disk: clean / EDITED / MISSING
meta-harness targets            # list supported targets
meta-harness show               # what this harness contains (derived from source)
meta-harness explain <category> # what to write in a source file, and where it lands
meta-harness --help             # all commands + examples
```

Your project gains exactly two things: the source dir (`.meta-harness/`) and
`meta-harness.jsonc` — plus the native config it compiles. No local
node_modules, no package.json. (One-off without installing:
`npx @jungsek/meta-harness <cmd>`; in CI prefer npx.)

## Two ways to define your harness

**By hand** — edit the files in `.meta-harness/` (every one is a commented
example), run `meta-harness generate`. No agent involved.
`meta-harness explain <category>` prints the shape of any source file.

**By agent** — ask any coding agent *"build my harness"*, with requirements
inline, or after sketching them in `.meta-harness/HARNESS-INIT.md`, or ask
to be interviewed. The agent writes the source files; the CLI still owns every write
to `.claude/`, `.codex/`, and friends. `init` installs the skill that teaches
it this — via `npx skills add`, which owns skill directories; meta-harness
never writes them itself.

The split is deliberate: **turning intent into source files is judgment
(agent); turning source files into native config is a pure function (CLI).**

`.meta-harness/` is always the source of truth. `HARNESS-INIT.md` is only
ever *input* — a scratchpad for describing what you want, never compiled and
never a record of what exists. For that, `meta-harness show` derives the
current contents from the source files, so it can't go stale the way a
checked-in summary would.

## Source layout

```
.meta-harness/
├── rules/*.md                # markdown rules (+ optional frontmatter)
├── agents/*.md               # subagents: shared frontmatter + per-target blocks
├── commands/*.md             # slash commands
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
| rules/ | `.claude/rules/` (symlink) | `AGENTS.md` block ¹ | `.cursor/rules/*.mdc` | `.opencode/memories/` + `instructions[]` | `.agents/memories/` | `AGENTS.md` block ¹ |
| agents/ | `.claude/agents/*.md` | `.codex/agents/*.toml` | `.cursor/agents/*.md` | `.opencode/agents/*.md` | `.agents/subagents/*.md` | JSON specs + Python plugin |
| commands/ | `.claude/commands/` (symlink) | — ² | `.cursor/commands/` | `.opencode/commands/` | `.agents/commands/` | — ² |
| mcp.jsonc | `.mcp.json` | `[mcp_servers]` in config.toml ³ | `.cursor/mcp.json` | `opencode.json` `mcp`+`tools` ³ | — | — ² |
| hooks.jsonc | `hooks` in settings.json | `.codex/hooks.json` | `.cursor/hooks.json` | generated JS plugin ⁴ | — | — ² |
| env.jsonc | `env` in settings.json | `[shell_environment_policy]` | — | — | — | — |
| plugins.jsonc | `enabledPlugins` | — | — | — | — | — |
| permissions.jsonc | `permissions` block | `.codex/rules/*.rules` (Starlark) ⁵ | — | — | — | — |
| settings/ | rest of settings.json | rest of config.toml | — | — | — | — |

¹ Codex and Hermes have no project rules directory for prose, and no additive
project-doc mechanism: `project_doc_fallback_filenames` is a true fallback,
used only when `AGENTS.md` is absent (measured, codex 0.145). So rules reach
them through a marker-delimited block in `AGENTS.md`. **The file stays yours:**
everything outside `<!-- meta-harness:start -->…<!-- meta-harness:end -->` is
preserved verbatim and never counts as drift. Path-scoped rules are skipped
here and warned about, since `AGENTS.md` loads unconditionally.
² Global-only in that tool (`~/`); meta-harness never writes outside the project.
³ Real dialect translation per target — field renames, `type` handling,
`${VAR}` env-ref syntax, `disabled`→`enabled`, tool filters.
⁴ OpenCode has no hooks config file; meta-harness generates
`.opencode/plugins/meta-harness-hooks.js` from your canonical events.
⁵ `allow`/`deny`/`ask` compile to Claude's permissions and to Codex
`prefix_rule(..., decision="allow"|"forbidden"|"prompt")` — its only
per-command enforcement. Codex loads project exec policies **only in a trusted
directory**: run `codex` once and accept the prompt, or deny rules silently
won't stop anything.

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
- run: npx @jungsek/meta-harness generate --check   # fails if outputs are stale or hand-edited
```

`generate --json` and `status --json` for machines.

Full design + ratified decisions: [SPEC.md](SPEC.md).
