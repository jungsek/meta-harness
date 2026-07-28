# SYNC-PLAN — "sync your Claude to your Codex" (v0.19 target)

Contract for the build team. Headline value prop: **your agent setup, in
every agent.** `meta-harness sync` reconciles lived-in native config with the
source dir and re-emits to every target. Audit/maintenance is an agent skill
on top of the same engine.

## 1. `meta-harness sync` — CLI semantics

```
meta-harness sync [--dry-run] [--json] [--prefer native|source] [--targets a,b]
```

Two modes, decided by presence of `meta-harness.jsonc` + source dir:

**Bootstrap (no source dir):** the killer first-run. Detect lived-in targets
(same signals as `init`: `.claude/`, `.codex/`, `.mcp.json`, …), import their
native config into a fresh source dir + `meta-harness.jsonc`, then generate to
ALL detected/enabled targets. `npx @jungsek/meta-harness sync` in a
`.claude/`-only repo must end with a working `.codex/` and no questions asked
(zero-prompt; `--dry-run` previews).

**Reconcile (source dir exists):** three-way per item, manifest = merge base:

| native vs manifest | source vs manifest | action |
|---|---|---|
| same | changed/same | normal generate path (source wins forward) |
| changed | same | **fold native → source** (backward translate), then generate |
| changed | changed (same item) | **conflict** — list, exit 1; `--prefer native\|source` resolves |
| unmanaged (not in manifest) | — | import → source, then generate (this is the asymmetry heal: item reaches every target) |

End state invariant: source == manifest == every target's owned surface.
`sync` supersedes the drift *refusal* story: drift is pending-sync input, not
an error. `generate` keeps its refusal contract unchanged (CI guard).

## 2. Backward translators (import direction)

v1 scope: **claude + codex** full fidelity; cursor/opencode/hermes =
inventory + report only ("found, not yet importable" — no silent skip).

| native | source destination |
|---|---|
| `.mcp.json` mcpServers | `connections/mcp.jsonc` |
| `.claude/settings.json` hooks / env / enabledPlugins / permissions | `hooks/hooks.jsonc` / `env/env.jsonc` / `plugins/plugins.jsonc` / `permissions/permissions.jsonc` |
| `.claude/settings.json` remaining keys | `settings/claude.settings.jsonc` |
| `.claude/commands/*.md`, `.claude/agents/*.md` | `commands/`, `agents/` |
| hand-written `AGENTS.md` (no manifest entry) | `rules/imported.md` verbatim + provenance comment |
| non-stub `CLAUDE.md` prose | fold into `rules/imported.md`, note origin |
| `.codex/config.toml` mcp_servers / shell_environment_policy / rest | `connections/` (reverse dialect: enabled→disabled, field renames) / `env/` / `settings/codex.config.toml` |
| `.codex/hooks.json`, `.codex/agents/*.toml` | `hooks/hooks.jsonc`, `agents/` (developer_instructions → body) |

Rules of the road: same item from two targets → dedupe when equal, conflict
when not. Permissions fold into the unified `permissions/` shape (never into
settings — the double-declare error must not be import-triggerable). Skills
dirs are NEVER imported (`npx skills add` owns them); sync only repairs the
`.claude/skills` mirror symlink. Untranslatable native keys land in the
per-target `settings/` file — flagged in the report, never dropped silently.

## 3. CLI UX

Plan report before writing (and as the whole output for `--dry-run`):

```
sync plan
  ← import
    claude   connections  + linear (unmanaged)
             hooks        ~ SessionStart (edited natively)
  → generate
    codex    .codex/config.toml  .codex/hooks.json
  = clean
    claude   permissions settings
```

Legend: `+` new, `~` changed, `!` conflict. Tasteful ASCII — aligned columns,
the existing dim/bold/yellow palette, no banners. `--json` mirrors the same
structure `{imported, generated, clean, conflicts, unsupported}` — this JSON
is the audit skill's data feed. Exit codes: 0 synced/clean, 1 conflicts or
error.

## 4. Skills — the ecosystem split

- **`meta-harness`** (existing): creation + evolution — no-intent menu,
  interview, baseline, authoring guidance. Gains one line routing maintenance
  questions to the sister skill.
- **`meta-harness-audit`** (new, `skills/meta-harness-audit/`): maintenance.
  Flow: `meta-harness sync --dry-run --json` → interpret (drift, unmanaged,
  asymmetries, unsupported) → report in user terms → offer: apply sync /
  selective import / record deliberate per-target exception. Then quality
  pass against the sibling skill's `references/review.md` + `agents-md.md`
  (reference by sibling path; both ship in the same package). Never runs
  `sync` mutating without showing the dry-run plan first.
- `init` installs BOTH skills (second `--skill meta-harness-audit` install;
  same symlink guarantee for `.claude/skills/`).

## 5. TEST matrix — `~/jung-os-2/TEST/`

Scripted fixtures (`setup.sh` per scenario, assertions runnable headless):

| dir | scenario | pass = |
|---|---|---|
| t1-fresh | init → skill no-intent menu (3 options) | menu correct in Claude AND Codex |
| t2-claude-only | hand `.claude/` + `.mcp.json` + AGENTS.md → `sync` | `.codex/` works: MCP + hooks + rules live in real codex session |
| t3-codex-only | reverse of t2 | `.claude/` works in real claude session |
| t4-drift | generate → hand-edit `.claude/settings.json` → `sync` | edit folded to source, propagated to codex, manifest clean |
| t5-conflict | edit source AND native same key → `sync` | exit 1 + both sides shown; `--prefer native` converges |
| t6-audit | real agent runs audit skill in t4-state repo | correct findings, offers sync, applies on yes |
| t7-unit | `npm test` | green, sync engine covered |

Live verification via herdr panes (claude + codex agents in TEST dirs).
Trust prompts: codex sessions need directory trust accepted — part of the
test script's herdr driving, and the report must note it.

## 6. Team layout (single-writer)

- **w1 sync-engine**: `src/sync.js` (scan/classify/translate/apply),
  `tests/sync.test.js`. Exports: `syncPlan(root, opts)` → plan object,
  `syncApply(root, plan, opts)`. No bin/ edits.
- **w2 cli-skills**: `bin/meta-harness.js` sync command + report rendering,
  `skills/meta-harness-audit/`, `skills/meta-harness/SKILL.md` routing line,
  README repositioning (sync = headline). Consumes w1's exports.
- **w3 fixtures**: `~/jung-os-2/TEST/` scenario dirs + `run-checks.sh`
  headless assertions. No meta-harness repo edits.

Lead merges w1 → w2 locally (one branch, `feat/sync`), runs unit + headless
checks, reports `DONE: <summary>` when t7 + t2/t4/t5 headless pass. Live
agentic passes (t1/t2/t3/t6 in real sessions) stay with the orchestrator.

## 7. Acceptance (orchestrator-owned)

1. All seven scenarios pass, live ones in real herdr Claude/Codex sessions.
2. `npx @jungsek/meta-harness sync` cold in a `.claude/`-only repo: zero
   prompts, working codex, readable plan output.
3. No data loss path: every destructive write preceded by refusal or
   explicit `--prefer`/`--force`; unparseable native files abort cleanly.
4. Second review (infra) on the engine. Ship 0.19.0, tag-publish, verify.
