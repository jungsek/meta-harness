# meta-harness

**One setup, every coding agent.**

You spent months teaching Claude Code how you work — the rules, the subagents,
the hooks that stop it before the risky thing, the permissions you tuned after
it did the risky thing. Then a better model ships inside somebody else's CLI.
Re-teaching all of that by hand loses most of it, so you don't switch. That's
the sunk cost.

```
npx @jungsek/meta-harness sync
```

One command: your setup, in the other agent. It reads the `.claude/` you
already have, builds a source of truth from it, and emits a working `.codex/`.
It works the other direction too — Codex user, no `.claude/`, same command.
Keep editing whichever tool you live in; run `sync` again and it reconciles
both ways. Nothing is silently lost: hand edits fold back into the source,
conflicts stop the run and show you both sides.

V1 promise, exactly: **Claude Code ⇄ Codex, both directions, the whole setup,
one source of truth.**

Why now: every lab ships its own coding agent and the frontier flips every
quarter. The harness you built is the durable asset. The agent is the
commodity — you should be able to move it in one command.

The mental model, if you want one: a harness above your harnesses. Dotfiles for
coding agents.

## Install

```
npm install -g @jungsek/meta-harness
```

Or run it once, without installing: `npx @jungsek/meta-harness sync`
(in CI, prefer npx).

## The first run

```
$ npx @jungsek/meta-harness sync

importing your claude setup → building .meta-harness/ → emitting claude, codex
.meta-harness/ becomes the source of truth; every target is generated from it.

sync plan
  ← import
    claude   connections  + deepwiki
             settings     + model
             env          + PROJECT_ENV
             permissions  + allow
             hooks        + PreToolUse
             commands     + ship
             agents       + planner
             rules        + CLAUDE.md
  → generate
    claude   .claude/agents/planner.md  .claude/commands/ship.md
    codex    .codex/agents/planner.toml  .codex/config.toml  .codex/hooks.json  .codex/rules/meta-harness.rules
    shared   .mcp.json  AGENTS.md  CLAUDE.md
✔ synced — 10 files written

next:
  claude  open claude here, accept the folder-trust prompt
  codex   open codex here, accept the directory-trust prompt
          then run /hooks and accept
```

No prompts, no wizard. `--dry-run` prints that same plan and writes nothing.

Your project gains exactly two things of its own — the source dir
(`.meta-harness/`) and `meta-harness.jsonc` — plus the native config compiled
from them. No local `node_modules`, no `package.json`.

## Commands

```
meta-harness sync                 import + reconcile + emit; the front door
meta-harness sync --dry-run       preview the plan, write nothing
meta-harness sync --prefer native|source   resolve conflicts in one direction
meta-harness status               is everything still in sync? clean / EDITED / MISSING
meta-harness init                 starting from scratch: scaffold the source dir + skills
meta-harness generate             compile the source, no import step
meta-harness generate --check     CI drift gate (exit 1 if stale or hand-edited)
meta-harness show                 what this harness contains, read from the source
meta-harness explain <name>       the source shape of a category, or a target's manual
meta-harness uninstall            remove every trace
meta-harness --help               everything, grouped
```

## Keeping it in sync

`sync` runs one of two modes, decided by whether a source dir exists:

- **Bootstrap** (no source dir) — import the native config it finds, build the
  source dir, generate to every enabled target.
- **Reconcile** (source dir exists) — three-way per item against the last
  synced manifest: changed natively folds back into the source; changed in the
  source generates forward; changed in **both** is a conflict — the run stops,
  nothing is written, both sides are printed, and `--prefer native|source`
  settles it. Anything unmanaged is imported so it reaches every target, not
  just the one it turned up in.

A file that lives in a managed directory but isn't a definition — a
`.claude/agents/README.md`, say — is reported as skipped and left exactly where
it is. It never blocks a sync and is never deleted.

Hand-edited outputs stop `generate`, on purpose. The message names `sync` first
(it keeps your edits) and `--force` last (it discards them).

## Two ways to define your harness

**By hand** — edit the files in `.meta-harness/` (each one is a commented
example), run `meta-harness generate`. No agent involved.
`meta-harness explain <category>` prints the shape of any source file.

**By agent** — ask any coding agent *"build my harness"*, with requirements
inline, or after sketching them in `.meta-harness/HARNESS-INIT.md`, or ask to
be interviewed. The agent writes the source files; the CLI still owns every
write to `.claude/` and `.codex/`. The first `sync` (and `init`) installs five
skills via `npx skills add`, which owns skill directories — meta-harness never
writes them itself. `meta-harness` is the brain (build / change / advise);
`mh-sync`, `mh-generate`, `mh-status`, `mh-audit` are thin entry points, so
every CLI capability is reachable through the agent without touching the
terminal. Invocation: `/name` in Claude Code, `$name` in Codex (no slash skills
there, and Codex only sees project skills after you accept its directory-trust
prompt).

The split is deliberate: **turning intent into source files is judgment
(agent); turning source files into native config is a pure function (CLI).**

`.meta-harness/` is always the source of truth. `HARNESS-INIT.md` is only ever
*input* — a scratchpad for what you want, never compiled, never a record of
what exists. For that, `meta-harness show` derives the contents from the source
files, so it can't go stale the way a checked-in summary would.

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

Config at repo root — `meta-harness.jsonc` (+ optional
`meta-harness.local.jsonc` machine-local overlay, gitignore it):

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/jungsek/meta-harness/main/schema/meta-harness.schema.json",
  "sourceDir": ".meta-harness",       // point anywhere, e.g. ".harness"
  "targets": ["claude", "codex"]      // the default
}
```

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
which Codex reads natively. Claude Code doesn't, so it gets a generated
`CLAUDE.md` containing `@AGENTS.md` — a real file, never a symlink (Claude
refuses to write through a symlinked `CLAUDE.md`). **Both files are outputs**,
generated from `rules/` — never edit them; project prose is just another rules
file (`root: true` makes it lead the file). `paths:`/`globs:` on a rule is an
error — `AGENTS.md` loads unconditionally, so there is no conditional-load
channel.
² Global-only in that tool (`~/`); meta-harness never writes outside the project.
³ Real dialect translation — field renames, `type` handling, `${VAR}` env-ref
syntax, `disabled`→`enabled`.
⁴ `allow`/`deny`/`ask` compile to Claude's permissions and to Codex
`prefix_rule(..., decision="allow"|"forbidden"|"prompt")` — its only
per-command enforcement.

**Other targets (experimental, one-way).** Emitters for `cursor`, `opencode`
and `hermes` ship in the package but are off by default and generate-only —
nothing is imported back from them. Enable at your own risk with
`--targets cursor` or in `meta-harness.jsonc`.

**Two trust gates, verified live.** Codex: hooks and exec policy are inert
until you run `codex` in the directory once and accept the trust + hooks
prompts. Claude: project settings (hooks, env, permissions) apply after the
folder-trust prompt on first interactive open — and one invalid key makes
Claude skip the *entire* `settings.json`, which is why meta-harness compiles
dialect-exact shapes (e.g. `enabledPlugins` as a record). Hook fire, deny
enforcement, env injection and MCP connection have all been verified inside
real Claude and Codex sessions.

## Frontmatter

Every source file takes `targets: ["*"]` (default) or a subset
(`["claude"]`). Agents add per-target override blocks — keys only that
target's output sees:

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

## The contract

- **Symlink when bytes are identical**, generate when encoding differs.
  Symlinks are relative and survive clone.
- **Shared files are assembled from fragments** (`.claude/settings.json`,
  `.codex/config.toml`). Same-key collision between fragments = hard error,
  not last-wins.
- **Foreign keys are yours.** In shared files, meta-harness owns only the keys
  it produces; anything you (or another tool) add is preserved verbatim and
  never counts as drift.
- **Hand edits to owned output abort `generate`** (SHA manifest at
  `<sourceDir>/.manifest.json`, committed). `sync` folds them back; `--force`
  discards them.
- **Orphans are pruned.** Rename a source file → the old output is removed; a
  pruned shared file keeps its foreign keys.
- **Never touches `~/`.** Global runtime config is out of scope. Skills belong
  to `npx skills add`.

## CI

```yaml
- run: npx @jungsek/meta-harness generate --check   # fails if outputs are stale or hand-edited
```

`sync --json`, `generate --json` and `status --json` for machines.

Full design + ratified decisions: [SPEC.md](SPEC.md).
