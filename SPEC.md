# meta-harness — spec v0.4 (2026-07-26)

One-way config compiler for coding-agent harnesses. Reads a single
source-of-truth directory (default `.meta-harness/`), emits native
project-scope config for six targets: **claude, codex, agents (`.agents/`),
cursor, opencode, hermes**.

v0.4: standalone spec — external tool comparisons removed; the product stands
on its own. v0.3 expanded the target set from 2 to 6 with a target registry
(`src/targets/<name>.js`), owned-keys-only drift for shared files, per-target
hook event whitelists with warn-and-skip, and real MCP dialect translation.
v0.2 ratified the source layout, hand-authored identity files, and
npm-published CLI. All ratified decisions below still stand.

## 1. Design principles

- **One source, many dialects.** Every category (rules, agents, commands,
  MCP, hooks, env, plugins, settings) is authored once in a canonical shape;
  each target module owns the translation into its tool's native format.
- **Project scope only.** Never writes to `~/`. Global runtime config
  (per-user prompts, model providers, notification settings, trust) is
  hand-managed, out of scope.
- **Outputs are committed.** Generated config is part of the repo; the
  manifest makes "these files are outputs" enforceable in CI.
- **Identity files are hand-authored.** `AGENTS.md`/`CLAUDE.md` are never
  generated — most tools read them natively, and generating a shadow file
  (e.g. `.hermes.md`) would override them.
- **Own the encoding matrix.** Six targets × ~7 categories is small enough
  to maintain directly; correctness of each dialect beats breadth of tools.

## 2. Target scope decisions [ratified]

- **claude**: rules/commands/workflows symlinked (`.claude/rules|commands|
  workflows/`), agents generated (`.claude/agents/*.md`), `.mcp.json`,
  env + hooks + plugins + settings fragments → `.claude/settings.json`.
- **codex**: agents → `.codex/agents/*.toml` (`developer_instructions`
  triple-quoted); MCP → `[mcp_servers]` in `.codex/config.toml` with real
  dialect translation (field renames, `type` dropped, `disabled`→`enabled`,
  name charset check, empty-table stripping); hooks → `.codex/hooks.json`
  (NOT `[hooks]` in config.toml); env → `[shell_environment_policy]`;
  settings → rest of config.toml. Rules and commands skipped at project
  scope (AGENTS.md read natively; custom prompts are global-only).
- **cursor**: rules → `.cursor/rules/*.mdc` (hand-rolled frontmatter:
  unquoted comma-joined globs; `alwaysApply: true` default when no globs),
  commands, agents, `.cursor/mcp.json` (shared file, `${VAR}`→`${env:VAR}`),
  native `.cursor/hooks.json` (camelCase events, flat defs).
- **opencode**: rules → `.opencode/memories/` + registered in `opencode.json
  instructions[]`; commands; agents (`mode: subagent` default); MCP →
  `opencode.json` `mcp`+`tools` (local/remote types, command array,
  `environment`, `{env:VAR}` refs); hooks → generated
  `.opencode/plugins/meta-harness-hooks.js` (no native hooks file exists).
  `opencode.json` is a shared file: owned keys `instructions`, `mcp`,
  `tools`; foreign keys preserved.
- **agents** (`.agents/` standard): rules → `.agents/memories/`, commands →
  `.agents/commands/`, agents → `.agents/subagents/`. Skills stay with
  `npx skills add`.
- **hermes**: project scope = subagents only (`.hermes/meta-harness/
  subagents/*.json` specs + `.hermes/plugins/meta-harness-subagents/`
  Python plugin registering each as a `delegate_task` command). MCP/hooks/
  permissions/commands live in `~/.hermes/config.yaml` — global, out of
  scope. Rules deliberately not folded into `.hermes.md`: it would shadow
  the hand-authored AGENTS.md, which Hermes reads natively.
- Canonical hook events are PascalCase (both major runtimes native);
  per-target maps translate (cursor camelCase, opencode event ids).

## 3. Non-goals [ratified]

- **Skills.** `skills` owns install + registry (`skills-lock.json`).
  meta-harness never *writes* `.agents/skills/` or `.claude/skills/` — but
  `init` does *invoke* `npx skills add <repo>` to install meta-harness's own
  agent skill. Delegating to the owner of a domain honors the boundary;
  writing those directories directly would break it. `--no-skill` opts out.
- **Global scope.** Never writes to `~/`.
- **Orchestration.** Agent-team briefs are prose read at spawn; nothing to
  compile.
- **Bidirectional sync.** One-way generate. `import` maybe later (§8).
- **More targets without a concrete need.** The registry makes adding one
  cheap, but each dialect must be verified against the real tool.

## 4. Source layout

Default source dir `.meta-harness/`; configurable via `sourceDir` in
`meta-harness.jsonc` (jung-os points it at `.harness/`).

```
.meta-harness/
├── rules/*.md                # markdown rules (+ optional frontmatter)
├── agents/*.md               # subagents: shared frontmatter + per-target blocks
│   └── teams/                # NOT compiled (prose briefs, presets)
├── commands/*.md             # slash commands
├── workflows/*.md            # Claude workflows
├── connections/mcp.jsonc     # canonical MCP map + per-target overrides
├── env/env.jsonc             # env vars
├── hooks/hooks.jsonc         # canonical events + per-target overrides
│   └── *.sh                  # hook scripts — referenced in place, never copied
├── plugins/plugins.jsonc     # Claude enabledPlugins (others: no-op)
├── settings/
│   ├── claude.settings.jsonc # Claude-only keys (model, permissions, statusLine…)
│   └── codex.config.toml     # Codex-only keys (approval_policy, sandbox_mode…)
└── (clis/ loops/ scripts/)   # never compiled; tool ignores unknown dirs
```

Frontmatter convention — shared body + optional per-target blocks:

```yaml
---
name: planner
description: ...
targets: ["*"]        # or a subset: ["claude", "cursor"]
claude:               # keys only Claude output sees
  model: inherit
hermes:
  toolsets: ["terminal", "file", "web"]
---
```

## 5. Output matrix

See README.md for the full 6-target matrix. Modes: `symlink` when bytes are
identical (claude rules/commands/workflows), `generate` when encoding
differs. Symlinks are relative, survive clone.

**Shared-file assembly:** `.claude/settings.json`, `.codex/config.toml`,
`opencode.json`, and `.cursor/mcp.json` are each assembled from multiple
fragments. Deterministic deep-merge, key-sorted output. Fragment collision
on the same key = hard error at generate time, not last-wins.

## 6. Ownership & drift (the contract)

- **Manifest** `<sourceDir>/.manifest.json`: every generated path + hash,
  committed alongside the outputs.
- `generate` refuses if any managed output was hand-edited since the
  manifest (untouched → rewrite; deleted → rewrite; edited → abort, list
  paths, `--force` to discard). Prunes orphans it owns (source renamed →
  old output deleted). Never touches files it didn't generate.
- **Declared-key ownership** for shared files: meta-harness owns only the
  keys its fragments produce; foreign keys (hand-added or other tools') are
  preserved verbatim and never count as drift. Taking over a foreign key
  warns. Drift on shared files hashes the owned-key subset only.
- `generate --check`: dry-run + exit 1 on drift or staleness — the CI gate
  that makes "these files are outputs" enforced.
- Partial runs (`--only`, `--targets`) never prune — they don't discover
  everything and would over-prune.

## 6a. Layering: CLI / agent / skill

Three layers, no overlap:

- **CLI** — deterministic. Compiles, verifies, reports; owns every write to a
  target. Never prompts, never guesses, never interactive. `--json` for
  machines.
- **Agent** — the interactive layer. Turns prose (`HARNESS.md`) into source
  files, chooses targets, drafts `AGENTS.md`, runs the commands the CLI can't
  decide for you. Never writes a generated output — the drift contract catches
  it if it tries.
- **Skill** — the contract between them: procedure and boundaries only. It
  points at `--help` rather than restating the CLI surface, so it can't rot.

Corollary: no interactive `init` wizard. The agent is the wizard.

## 7. CLI surface

```
meta-harness init [--no-skill]       # scaffold source dir + config, install agent skill
meta-harness generate [--check|--force|--dry-run] [-t <targets>] [--only <cats>] [--json]
meta-harness status [--json]         # manifest vs disk: clean / EDITED / MISSING
meta-harness targets                 # list supported targets
meta-harness explain [category]      # source file shape per category (schema lives in code)
```

## 8. Implementation

- **Stack:** plain ESM JavaScript (no build step), Node ≥22. Deps, all
  boring: `commander`, `gray-matter`, `smol-toml`, `jsonc-parser`.
  Hand-rolled validation; schema rigor when it earns it.
- **Shape:** `src/targets/<name>.js` each exporting `{name, emit(model,
  ctx)}`; `src/model.js` loads the canonical model + validates;
  `src/engine.js` runs discover → assemble → drift-check → write →
  manifest. ~1.2k LOC total.
- **Tests:** `node --test tests/` — behavior tests over a fixture tree
  (matrix, drift, prune, collisions, CLI e2e).
- **Language choice:** JavaScript over Rust/Go — the workload is small-file
  IO + JSON/TOML/YAML transforms; a full 6-target generate runs in tens of
  milliseconds and process startup dominates. `npx` distribution and
  zero-build publishing outweigh compiled-binary startup gains. Revisit
  only if the tool grows a watch mode or 100×-file workloads.
- **Maybe later:** `import` (reverse-engineer existing native config into
  the source dir), `doctor`, watch mode. None in scope now.

## 9. Ratified decisions (2026-07-26)

1. Source dir default `.meta-harness/`; jung-os config sets
   `sourceDir: ".harness"`. npm name `@jungsek/meta-harness` (unscoped
   blocked by registry name-similarity rule); bin command `meta-harness`.
2. rules/ → native rules dirs. `.claude/rules/` confirmed in official docs
   (recursive, `paths:` frontmatter globs, symlinks OK). Codex
   `.codex/rules/` format unverified — skipped. AGENTS.md/CLAUDE.md stay
   hand-authored.
3. Permissions are ordinary settings keys (`permissions` block in
   `settings/claude.settings.jsonc`; `approval_policy`/`sandbox_mode` in
   `settings/codex.config.toml`). No unified permissions format — each
   dialect written natively.
4. Publishable npm CLI from day 1; plain ESM, no build step.
