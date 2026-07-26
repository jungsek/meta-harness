# meta-harness — spec v0.3 (2026-07-26)

v0.3 (same day, ratified by Jung): target set expanded from 2 to 6 —
**claude, codex, agents (.agents/), cursor, opencode, hermes** — with native
format definitions extracted from rulesync source. Architecture moved to a
target registry (`src/targets/<name>.js`); shared-file drift is owned-keys
only (foreign edits never trip it); hooks get per-target event whitelists with
warn-and-skip; Codex MCP gets real dialect translation; Codex hooks corrected
to `.codex/hooks.json`. v0.2 decisions below still stand where not superseded.

v0.2 ratified: source dir default `.meta-harness/` (jung-os-2 overrides
`sourceDir: ".harness"`); rules map to native rules dirs (`.claude/rules/`),
NOT AGENTS.md — identity pair stays hand-authored, out of tool scope;
permissions absorbed as plain settings keys (rulesync dropped entirely);
publishable npm CLI from day 1 (`meta-harness` — verified free on npm;
`metaharness` is taken by an unrelated tool).

One-way config compiler for agent runtimes. Reads a single source-of-truth
directory (`.meta-harness/`), emits native project-scope config per target.
rulesync's model, cut to what Jung OS needs: project scope only, our category
taxonomy, committed outputs.

## v0.3 target scope decisions

- **cursor**: rules → `.cursor/rules/*.mdc` (comma-joined unquoted globs;
  `alwaysApply: true` default when no globs), commands, agents,
  `.cursor/mcp.json` (shared, `${VAR}`→`${env:VAR}`), native
  `.cursor/hooks.json` (camelCase events, flat defs).
- **opencode**: rules → `.opencode/memories/` + registered in `opencode.json
  instructions[]` (AGENTS.md hand-authored, auto-read); commands; agents
  (`mode: subagent` default); mcp → `opencode.json` `mcp`+`tools`
  (local/remote types, command array, `environment`, `{env:VAR}` refs);
  hooks → generated `.opencode/plugins/meta-harness-hooks.js` (no native
  hooks file exists). `opencode.json` is a shared file: owned keys
  `instructions`, `mcp`, `tools`; foreign keys preserved.
- **agents** (`.agents/` standard): rules → `.agents/memories/`, commands →
  `.agents/commands/`, agents → `.agents/subagents/`. Skills stay with
  `npx skills add`.
- **hermes**: project scope = subagents only (`.hermes/rulesync/subagents/
  *.json` specs + `.hermes/plugins/meta-harness-subagents/` Python plugin).
  MCP/hooks/permissions/commands live in `~/.hermes/config.yaml` — global,
  out of scope. Rules deliberately not folded into `.hermes.md`: it would
  shadow the hand-authored AGENTS.md, which Hermes reads natively.
- Canonical hook events stay PascalCase (both major runtimes native);
  per-target maps translate (cursor camelCase, opencode event ids).

Drafted 2026-07-26 from the jung-os-2 bootstrap session. Decisions inherited
from that session are marked [decided]; open items are at the bottom.

## 1. Why build (vs adopt rulesync)

rulesync covers rules/subagents/commands/MCP/hooks/permissions for 38 tools,
but: fixed `.rulesync/` layout that fights our taxonomy; no settings.json
beyond permissions; no env/workflows categories; outputs-not-committed
worldview; 38-tool surface + fast majors for a 2-target need; no local
extension point. meta-harness is the same architecture with our taxonomy as
the schema, ~2 targets, and nothing else.

Tradeoff accepted: we own the encoding matrix (small: 2 targets × ~7
categories) and lose upstream maintenance. Escape hatch: source layout is
convertible to `.rulesync/` shape if we ever bail back to rulesync.

## 2. Non-goals [all decided this session]

- **Skills.** `npx skills add` owns install + registry (`skills-lock.json`).
  meta-harness never touches `.agents/skills/`, `.claude/skills/`.
- **Global scope.** Never writes to `~/`. Runtime features that only work
  globally (Codex prompts, `model_provider`, `notify`, `otel`, profiles,
  trust) are out of scope, hand-managed.
- **Orchestration.** agent teams are prose read at spawn; herdr is the
  substrate. Nothing to compile.
- **Bidirectional sync.** One-way generate. `import` maybe later (§9).
- ~~**>2 targets.**~~ Superseded in v0.3: six targets (claude, codex, agents,
  cursor, opencode, hermes) via the target registry. Further targets still
  need a concrete need.

## 3. Source layout

Default source dir `.meta-harness/`; configurable (`sourceDir` in config) —
jung-os-2 points it at `.harness/`.

```
.meta-harness/
├── meta-harness.jsonc        # config: targets, features, sourceDir overrides
├── rules/*.md                # → .claude/rules/ (paths: frontmatter passes through)
├── agents/*.md               # subagents, md + YAML frontmatter (one source)
│   └── teams/                # NOT compiled (prose briefs, presets)
├── commands/*.md             # slash commands
├── connections/mcp.jsonc     # MCP servers, canonical map + per-target overrides
├── env/env.jsonc             # env vars (Claude env block / Codex shell_environment_policy)
├── hooks/hooks.jsonc         # canonical events + per-target overrides
│   └── *.sh                  # hook scripts — referenced in place, never copied
├── plugins/plugins.jsonc     # Claude enabledPlugins list (Codex: no-op)
├── settings/
│   ├── claude.settings.jsonc # Claude-only keys (model, statusLine, spend, autoMode…)
│   └── codex.config.toml     # Codex-only keys (approval_policy, sandbox_mode, features…)
├── workflows/*.md            # Claude workflows (Codex: no-op)
└── (clis/ loops/ scripts/)   # never compiled; tool ignores unknown dirs
```

Frontmatter convention (stolen from rulesync): shared body + optional
per-target blocks:

```yaml
---
name: planner
description: ...
targets: ["*"]        # or ["claude"], ["codex"]
claude:               # keys only Claude output sees
  model: inherit
codex: {}
---
```

## 4. Output matrix

| Source | Claude output | Codex output | Mode |
|---|---|---|---|
| rules/*.md | `.claude/rules/<n>.md` (native rules dir, `paths:` globs pass through) | `.codex/rules/` — format unverified, v1 skips Codex side (TODO) | symlink |
| (identity) | `AGENTS.md`/`CLAUDE.md` hand-authored — NOT compiled | same | out of scope |
| agents/*.md | `.claude/agents/<n>.md` (md+YAML) | `.codex/agents/<n>.toml` (`developer_instructions` triple-quoted) | generate |
| commands/*.md | `.claude/commands/<n>.md` | — (global-only, skip) | symlink |
| connections/mcp.jsonc | `.mcp.json` | `[mcp_servers]` in `.codex/config.toml` | generate |
| env/env.jsonc | `env` block in `.claude/settings.json` | `[shell_environment_policy]` | generate |
| hooks/hooks.jsonc | `hooks` block in `.claude/settings.json` (PascalCase events) | `.codex/hooks.json` (corrected in v0.3; `[hooks]`-in-toml was wrong) | generate |
| plugins/plugins.jsonc | `enabledPlugins` in `.claude/settings.json` | — | generate |
| settings/claude.settings.jsonc | remaining keys of `.claude/settings.json` | — | generate |
| settings/codex.config.toml | — | remaining keys of `.codex/config.toml` | generate |
| workflows/*.md | `.claude/workflows/<n>.md` | — | symlink |

Mode vocabulary (stolen from agentsync): `symlink` when bytes are identical
(commands, workflows), `generate` when encoding differs. Symlinks are
relative, survive clone.

**Shared-file assembly:** `.claude/settings.json` and `.codex/config.toml`
are each assembled from multiple fragments (env + hooks + plugins + settings
/ mcp + hooks + settings). Deterministic deep-merge, key-sorted output.
Fragment collision on the same key = hard error at generate time, not
last-wins.

## 5. Ownership & drift (the contract)

Stolen from agent_sync + rulesync, combined:

- **Manifest** `.meta-harness/.manifest.json`: every generated path + SHA-256,
  committed. Outputs ARE committed (jung-os stance — differs from rulesync).
- `generate`: refuses if any managed output was hand-edited since manifest
  (three-state: untouched → rewrite; deleted → rewrite; edited → abort,
  list paths, `--force` to discard). Prunes orphans it owns (source renamed
  → old output deleted). Never touches files it didn't generate.
- **Declared-key ownership** for shared files: meta-harness owns only the
  keys its fragments produce inside `.claude/settings.json` /
  `.codex/config.toml`; foreign keys (e.g. rulesync's permissions block,
  hand-added keys) are preserved verbatim; writing over a foreign key warns.
- `check`: `generate --dry-run` + exit 1 on drift. The CI/hook gate that
  makes ".claude/.codex are outputs" enforced.

## 6. CLI surface

```
meta-harness generate [--check|--force|--dry-run] [--only <category,...>]
meta-harness status          # manifest vs disk vs source, human + --json
meta-harness init            # scaffold source dir + config (idempotent)
```

Nothing else in v1. No import, no watch, no doctor.

## 7. Implementation

- **Stack:** TypeScript, Node ≥22, ESM. Deps (minimal, all boring):
  `commander` (CLI), `gray-matter` (frontmatter), `smol-toml` (TOML
  emit/parse), `jsonc-parser` (JSONC). No effect/zod/valibot — hand-rolled
  validation with plain checks; schema rigor when it earns it.
- **Shape:** `src/categories/<name>.ts` each exporting
  `{ discover(src), emit(target, model), owns(path|keys) }`. Target registry
  `src/targets/{claude,codex}.ts`. Engine: discover → canonical model →
  emit → manifest. ~10 files, target <1.5k LOC.
- **Home:** `~/jung-os-2/projects/meta-harness/` (own package, own git repo
  later if extracted). Installed into jung-os-2 via `npm link` / `npx`.
- **Tests:** golden-file: example source tree in `tests/fixtures/`, snapshot
  the full output tree. One fixture per category + one merged-settings
  fixture + drift-abort test. No unit-test ceremony beyond that.

## 8. Phases

- **P1 — engine + settings path (the novel part):** config load, manifest,
  generate/check/status skeleton, shared-file assembly with declared-key
  ownership, settings/ + env/ + plugins/ fragments → both runtime files.
  This alone replaces nothing rulesync does — it's the gap rulesync can't
  cover, so it goes first.
- **P2 — the rulesync-parity categories:** agents dual-encoding, rules →
  AGENTS.md/CLAUDE.md, connections (mcp.jsonc → .mcp.json + TOML), hooks
  (event-name mapping), commands + workflows symlinks.
- **P3 — hardening:** golden tests complete, `init`, jung-os-2 cutover
  (`sourceDir: ".harness"`), retire any interim hand-copies, dated BRAIN
  decision.

## 9. Ratified decisions (2026-07-26)

1. Source dir default `.meta-harness/`; jung-os-2 config sets
   `sourceDir: ".harness"`. npm name `meta-harness` (free; verified).
2. rules/ → native rules dirs. `.claude/rules/` confirmed in official docs
   (recursive, `paths:` frontmatter globs, symlinks OK). Codex `.codex/rules/`
   format unverified — skipped in v1. AGENTS.md/CLAUDE.md stay hand-authored.
3. Permissions absorbed: they're ordinary keys in
   `settings/claude.settings.jsonc` (`permissions` block) and
   `settings/codex.config.toml` (`approval_policy`, `sandbox_mode`,
   `permissions.*` profiles). No unified permissions format, no translator —
   each dialect written natively. rulesync dropped entirely.
4. Publishable npm CLI from day 1. Implementation note: plain ESM JavaScript,
   no build step — publishable as-is, `npx @jungsek/meta-harness` works immediately.
