# How meta-harness works

Complete map of the current system (v0.10.0). Everything here is verified
against the code, not aspirational.

## The whole idea in one line

You write config once in `.meta-harness/`; `generate` compiles it into every
coding agent's native format; a manifest makes sure nothing you hand-edit is
ever silently overwritten.

```
.meta-harness/          →   generate   →   .claude/  .codex/  .cursor/
(source of truth,                          .opencode/  .agents/  .hermes/
 you write this)                           .mcp.json  opencode.json
                                           (outputs, never hand-edit)
```

## The six commands

| Command | What it does |
|---|---|
| `init` | Scaffold the source dir + config, install the agent skill. Idempotent. |
| `generate` | Compile source → native config. The only thing that writes outputs. |
| `status` | Per output: `clean` / `EDITED` / `MISSING` / `link`. |
| `show` | What this harness contains, read from source. Can't go stale. |
| `explain <category>` | The shape of a source file and where it lands. |
| `targets` | Which targets exist, and which are enabled. |

Useful `generate` flags: `--check` (CI gate, exit 1 if stale), `--dry-run`
(plan only), `--force` (discard hand edits), `-t <targets>` / `--only
<categories>` (partial run — never prunes), `--json`.

## The nine things you can write

Everything lives under the source dir (default `.meta-harness/`).

| Category | File | What it is |
|---|---|---|
| rules | `rules/*.md` | Policy and identity prose. `root: true` leads the Codex doc; `paths:` scopes a rule to matching files (Claude/Cursor only). |
| agents | `agents/*.md` | Subagents. Body is the system prompt. |
| commands | `commands/*.md` | Slash commands. |
| connections | `connections/mcp.jsonc` | MCP servers, Claude-shaped, per-target overrides. |
| hooks | `hooks/hooks.jsonc` | Hook events, canonical PascalCase. |
| env | `env/env.jsonc` | Environment variables. |
| plugins | `plugins/plugins.jsonc` | Claude `enabledPlugins`. |
| permissions | `permissions/permissions.jsonc` | `allow`/`deny`/`ask`, compiled to every runtime that enforces. |
| settings | `settings/claude.settings.jsonc`, `settings/codex.config.toml` | Native keys for anything above doesn't cover. |

Two files in the source dir are never compiled: `HARNESS-INIT.md` (your
plain-language request, input only) and `.manifest.json` (bookkeeping).
Unknown directories are ignored, so `scripts/`, `docs/` etc. can live there.

Every markdown file takes `targets: ["*"]` (default) or a subset. Agent files
additionally take per-target override blocks (`claude:`, `cursor:`, `hermes:`).

## The six targets, and what each gets

Running with `targets: ["*"]` on a scaffolded project produces 22 files:

| Source | claude | codex | cursor | opencode | agents | hermes |
|---|---|---|---|---|---|---|
| rules | `.claude/rules/` (symlink) | `.codex/harness-rules.md` ¹ | `.cursor/rules/*.mdc` | `.opencode/memories/` + `instructions[]` | `.agents/memories/` | — reads your AGENTS.md |
| agents | `.claude/agents/*.md` | `.codex/agents/*.toml` | `.cursor/agents/*.md` | `.opencode/agents/*.md` | `.agents/subagents/` | JSON specs + Python plugin |
| commands | `.claude/commands/` (symlink) | — global-only | `.cursor/commands/` | `.opencode/commands/` | `.agents/commands/` | — global-only |
| connections | `.mcp.json` | `[mcp_servers]` in config.toml | `.cursor/mcp.json` | `opencode.json` | — | — global-only |
| hooks | `hooks` in settings.json | `.codex/hooks.json` | `.cursor/hooks.json` | generated JS plugin | — | — global-only |
| env | `env` in settings.json | `[shell_environment_policy]` | — | — | — | — |
| plugins | `enabledPlugins` | — | — | — | — | — |
| permissions | `permissions` block | `.codex/rules/*.rules` (Starlark) | — | — | — | — |
| settings | rest of settings.json | rest of config.toml | — | — | — | — |

¹ Registered in `.codex/config.toml` via `project_doc_fallback_filenames`,
which Codex loads **in addition to** your `AGENTS.md` — verified against codex
0.145. `AGENTS.md` is never touched. Path-scoped rules are skipped here and
warned about: Codex loads project docs unconditionally, so copying one would
silently make it always-on.

Each target owns its dialect translation — field renames, env-ref syntax
(`${VAR}` vs `${env:VAR}` vs `{env:VAR}`), event-name mapping, `disabled` vs
`enabled`. That's the part that would otherwise be your problem.

## Three ways a file gets written

This is the part worth understanding, because it determines what counts as
"yours" versus "the tool's".

1. **Symlink** — when the bytes are identical to the source (Claude rules and
   commands). Relative, survives clone. Edit the source and the output is
   already updated.
2. **Generated file** — when encoding differs (Codex `.toml`, Cursor `.mdc`,
   the OpenCode hooks plugin, Hermes specs). Whole file is owned; the whole
   file is hashed.
3. **Shared-file fragment** — several categories merge into one file
   (`.claude/settings.json` takes env + hooks + plugins + permissions +
   settings). **Only the keys meta-harness produces are owned**; anything else
   in that file is preserved verbatim and never counts as drift. Two fragments
   setting the same key to different values is a hard error naming both
   sources, not a silent winner.
## What `generate` actually does

1. **Load and validate.** Read every category into one model. Duplicate names,
   unknown targets, malformed JSONC (reported with a line number) abort here —
   before anything is written.
2. **Emit per target.** Each enabled target translates the model into its
   dialect, producing outputs of the three kinds above.
3. **Assemble shared files** from their fragments, key-sorted, collisions hard.
4. **Check drift.** Every managed path is compared to the manifest — whole-file
   hash or owned-key hash depending on kind. Any hand-edited
   output aborts the run and names the file.
5. **Write and prune.** Write what changed; delete outputs whose source is
   gone. Pruning a shared file keeps foreign keys. Partial runs never prune.
6. **Update the manifest** at `<sourceDir>/.manifest.json`, committed with the
   outputs.

Same source in, same bytes out, ~80 ms for six targets. No agent anywhere in
this path — which is what makes `--check` meaningful in CI.

## The ownership contract

- **Edit the source, never the outputs.** If you edit an output, the next
  `generate` refuses and names the file. Port the change into the source, then
  `generate --force`.
- **`status` tells you which case you're in.** `EDITED` means someone's work is
  at stake (`--force` discards it). `MISSING` just needs a rebuild.
- **Foreign content is yours forever.** Keys you add to `.claude/settings.json`
  are preserved and never drift.
- **Outputs are committed.** That's what makes `generate --check` a real gate.

## Two agent-facing paths

**By hand** — edit files, run `generate`. `explain` tells you the shapes.

**By agent** — `init` installs a skill (via `npx skills add`, which owns skill
directories) that teaches any coding agent to build a harness from a plain
request, from `HARNESS-INIT.md`, or by interviewing you. The agent writes
*source*; the CLI still writes every output. The drift contract is what keeps
the agent honest.

## Deliberately out of scope

- **Skills** — `npx skills add` owns skill dirs and `skills-lock.json`.
- **Anything in `~/`** — global runtime config is hand-managed.
- **`AGENTS.md` and `CLAUDE.md`** — entirely hand-authored, never written.
- **Orchestration** — agent-team briefs are prose, nothing to compile.
- **`import`** — reverse direction, specced in `import-spec.md`, not built.
  This is the current biggest gap: an existing `.claude/`+`.codex/` setup has
  no automated way into the source dir.

## Two gates that bite silently

Both are Codex, both verified against codex 0.145, and both fail *quietly* —
which is why they're worth knowing:

1. **Hooks** in `.codex/hooks.json` do not run until you open `codex` in the
   project once and accept the trust prompt.
2. **Exec policy** in `.codex/rules/*.rules` — your `deny` permissions — does
   not enforce until the same trust prompt is accepted. Untrusted, a forbidden
   command runs normally.

`generate` warns about the second. Neither can be automated; they're Codex's
own security gates.
