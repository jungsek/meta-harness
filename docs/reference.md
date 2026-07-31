# Reference

The detailed material that used to live in the README: file formats, the
output matrix, frontmatter, the ownership contract, and CI setup. For the
concepts behind the tool, read [how-it-works.md](how-it-works.md) first.

## Source layout

```
.meta-harness/
├── rules/*.md                # markdown rules (+ optional frontmatter)
├── agents/*.md               # subagents: shared frontmatter + per-target blocks
├── commands/*.md             # slash commands
├── connections/mcp.jsonc     # canonical MCP server map + per-target overrides
├── env/env.jsonc             # env vars
├── hooks/hooks.jsonc         # canonical hook events (PascalCase) + per-target overrides
├── permissions/permissions.jsonc  # allow / deny / ask
├── plugins/plugins.jsonc     # Claude enabledPlugins
└── settings/
    ├── claude.settings.jsonc # Claude-only keys (model, permissions, statusLine…)
    └── codex.config.toml     # Codex-only keys (approval_policy, sandbox_mode…)
```

Config at repo root is `meta-harness.jsonc`, plus an optional
`meta-harness.local.jsonc` machine-local overlay (gitignore it):

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/jungsek/meta-harness/main/schema/meta-harness.schema.json",
  "sourceDir": ".meta-harness",       // point anywhere, e.g. ".harness"
  "targets": ["claude", "codex"]      // the default
}
```

## Two ways to define your harness

**By hand.** Edit the files in `.meta-harness/` (each one is a commented
example), then run `meta-harness generate`. No agent involved.
`meta-harness explain <category>` prints the shape of any source file.

**By agent.** Ask any coding agent "build my harness", with requirements
inline, after sketching them in `.meta-harness/HARNESS-INIT.md`, or by asking
to be interviewed. The agent writes the source files; the CLI still owns every
write to `.claude/` and `.codex/`. The first `sync` (and `init`) installs five
skills via `npx skills add`, which owns skill directories; meta-harness never
writes them itself. `meta-harness` is the brain (build / change / advise);
`mh-sync`, `mh-generate`, `mh-status`, and `mh-audit` are thin entry points, so
every CLI capability is reachable through the agent without touching the
terminal. Invocation is `/name` in Claude Code and `$name` in Codex (Codex has
no slash skills, and it only sees project skills after you accept its
directory-trust prompt).

The split is deliberate: turning intent into source files is judgment (agent);
turning source files into native config is a pure function (CLI).

`.meta-harness/` is always the source of truth. `HARNESS-INIT.md` is only ever
input: a scratchpad for what you want, never compiled, never a record of what
exists. For that, `meta-harness show` derives the contents from the source
files, so it cannot go stale the way a checked-in summary would.

## Sync modes in detail

`sync` runs one of two modes, decided by whether a source dir exists:

- **Bootstrap** (no source dir): import the native config it finds, build the
  source dir, generate to every enabled target.
- **Reconcile** (source dir exists): three-way per item against the last
  synced manifest. An item changed natively folds back into the source; an
  item changed in the source generates forward; an item changed in **both** is
  a conflict. The run stops, nothing is written, both sides are printed, and
  `--prefer native|source` settles it. Anything unmanaged is imported so it
  reaches every target, not just the one it turned up in.

A file that lives in a managed directory but is not a definition (a
`.claude/agents/README.md`, say) is reported as skipped and left exactly where
it is. It never blocks a sync and is never deleted.

Hand-edited outputs stop `generate` on purpose. The message names `sync` first
(it keeps your edits) and `--force` last (it discards them).

## Output matrix

| Source | claude | codex |
|---|---|---|
| rules/ | `CLAUDE.md` stub → `AGENTS.md` block ¹ | `AGENTS.md` block ¹ |
| agents/ | `.claude/agents/*.md` | `.codex/agents/*.toml` |
| commands/ | `.claude/commands/` (symlink) | — ² |
| mcp.jsonc | `.mcp.json` | `[mcp_servers]` in config.toml ³ |
| hooks.jsonc | `hooks` in settings.json | `.codex/hooks.json` |
| env.jsonc | `env` in settings.json | `[shell_environment_policy]` |
| plugins.jsonc | `enabledPlugins` | — |
| permissions.jsonc | `permissions` block | `.codex/rules/*.rules` (Starlark) ⁴ |
| settings/ | rest of settings.json | rest of config.toml |

¹ One prose channel: all rules compile into a fully generated `AGENTS.md`,
which Codex reads natively. Claude Code does not, so it gets a generated
`CLAUDE.md` containing `@AGENTS.md`. This is a real file, never a symlink
(Claude refuses to write through a symlinked `CLAUDE.md`). **Both files are
outputs**, generated from `rules/`; never edit them. Project prose is just
another rules file (`root: true` makes it lead the file). `paths:`/`globs:` on
a rule is an error, because `AGENTS.md` loads unconditionally and there is no
conditional-load channel.
² Global-only in that tool (`~/`); meta-harness never writes outside the project.
³ Real dialect translation: field renames, `type` handling, `${VAR}` env-ref
syntax, `disabled`→`enabled`.
⁴ `allow`/`deny`/`ask` compile to Claude's permissions and to Codex
`prefix_rule(..., decision="allow"|"forbidden"|"prompt")`, its only
per-command enforcement.

**Other targets (experimental, one-way).** Emitters for `cursor`, `opencode`
and `hermes` ship in the package but are off by default and generate-only;
nothing is imported back from them. Enable at your own risk with
`--targets cursor` or in `meta-harness.jsonc`.

## Trust gates

Two trust gates, verified live. Codex: hooks and exec policy are inert until
you run `codex` in the directory once and accept the trust and hooks prompts.
Claude: project settings (hooks, env, permissions) apply after the
folder-trust prompt on first interactive open. One invalid key makes Claude
skip the entire `settings.json`, which is why meta-harness compiles
dialect-exact shapes (e.g. `enabledPlugins` as a record). Hook fire, deny
enforcement, env injection, and MCP connection have all been verified inside
real Claude and Codex sessions.

## Frontmatter

Every source file takes `targets: ["*"]` (default) or a subset
(`["claude"]`). Agents add per-target override blocks; the keys apply only to
that target's output:

```yaml
---
description: plans work, writes no code
targets: ["*"]
claude:
  model: inherit
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

## The ownership contract

- **Symlink when bytes are identical**, generate when encoding differs.
  Symlinks are relative and survive clone.
- **Shared files are assembled from fragments** (`.claude/settings.json`,
  `.codex/config.toml`). Same-key collision between fragments is a hard
  error, not last-wins.
- **Foreign keys are yours.** In shared files, meta-harness owns only the keys
  it produces; anything you (or another tool) add is preserved verbatim and
  never counts as drift.
- **Hand edits to owned output abort `generate`** (SHA manifest at
  `<sourceDir>/.manifest.json`, committed). `sync` folds them back; `--force`
  discards them.
- **Orphans are pruned.** Rename a source file and the old output is removed;
  a pruned shared file keeps its foreign keys.
- **Never touches `~/`.** Global runtime config is out of scope. Skills belong
  to `npx skills add`.

## CI

```yaml
- run: npx @jungsek/meta-harness generate --check   # fails if outputs are stale or hand-edited
```

`sync --json`, `generate --json` and `status --json` exist for machines.
