# Changelog

## 0.11.0 — 2026-07-27

- **One prose channel: rules compile only into the managed `AGENTS.md` block.**
  All per-target rules outputs are gone — `.claude/rules/` symlinks,
  `.cursor/rules/*.mdc`, `.opencode/memories/` (+ `instructions[]`),
  `.agents/memories/`. They duplicated the same prose into every runtime, and
  Claude received it twice (rules dir + `@AGENTS.md` import). Codex, Cursor,
  OpenCode, Hermes, and `.agents` runtimes read `AGENTS.md` natively; upgrade
  is automatic — the next `generate` prunes the old outputs.
- **Claude reads rules through a generated `CLAUDE.md` stub.** A managed
  marker block containing `@AGENTS.md` — a real file, never a symlink (Claude
  refuses to write through a symlinked `CLAUDE.md`). A `CLAUDE.md` that
  already imports `AGENTS.md` is left untouched, and prose outside the block
  stays yours.
- **`paths:`/`globs:` on a rule is now a hard error** (was: skipped with a
  warning for the block, honored by Claude/Cursor). `AGENTS.md` loads
  unconditionally, so there is no conditional-load channel left; scope by
  prose instead.
- A rule that narrows `targets:` still lands in the shared block when any
  listed target is enabled, with a warning that every runtime will read it.
- Prune now removes directories its deletions leave empty.

## 0.10.2 — 2026-07-27

- **Fixes silent data loss on first adoption.** `detectDrift` only ever
  iterated manifest entries, so an empty manifest meant zero checks — and the
  first `generate` in a repo that already had `.claude/` config destroyed
  hand-written files with no warning. That is the run every adopter performs.
  Any output path that exists on disk but is absent from the manifest is now
  treated as unmanaged: `generate` refuses and names the paths, and `--force`
  is the explicit adoption opt-in. Shared files and the `AGENTS.md` block are
  exempt — they merge rather than replace, so existing content already
  survives on its own terms.

## 0.10.1 — 2026-07-27

- **Reverts the 0.10.0 Codex rules mechanism, which did not work.**
  `project_doc_fallback_filenames` is a true fallback: measured against codex
  0.145, a registered project doc is ignored whenever `AGENTS.md` exists, so
  0.10.0 stopped delivering rules to Codex in any repo that has one. The
  managed `AGENTS.md` block is restored — it is the only additive
  project-scope prose channel. Measured precedence, for the record:
  `AGENTS.override.md` > `AGENTS.md` > `.codex/AGENTS.md`, none concatenating.
- Kept from 0.10.0: path-scoped rules are skipped for the AGENTS.md block and
  warned about, since it loads unconditionally and would silently promote a
  conditional rule to always-on.

## 0.10.0 — 2026-07-27

- **Rules reach Codex without touching `AGENTS.md`.** Verified against codex
  0.145: files listed in `project_doc_fallback_filenames` load *in addition
  to* `AGENTS.md`, so meta-harness writes `.codex/harness-rules.md` and
  registers it in `.codex/config.toml`. Your `AGENTS.md` and `CLAUDE.md` are
  never written again.
  - Supersedes the 0.8.0 managed-block approach. The marker machinery is
    deleted: one fewer output kind, one fewer drift model.
  - Measured precedence for the record: `AGENTS.override.md` replaces
    `AGENTS.md` replaces `.codex/AGENTS.md` — none of those concatenate, which
    is why a registered project doc is the only additive channel.
  - **Path-scoped rules are skipped for Codex** and warned about. Codex loads
    project docs unconditionally, so copying one there would silently promote a
    conditional rule to always-on.
- **`workflows` dropped.** `.claude/workflows/` holds `.js` orchestration
  scripts, not markdown; the category emitted the wrong format and had no users.
- **`permissions.jsonc` absorbs the native knobs** — `codex.approval_policy`,
  `codex.sandbox_mode`, `claude.defaultMode` now live beside the permissions
  they modify instead of in `settings/`.
- `HARNESS-REQUEST.md` → `HARNESS-INIT.md`.

## 0.9.1 — 2026-07-27

- `root: true` on a rule makes it lead the `AGENTS.md` block. Identity only
  does its job when read before the rules it frames, and filename ordering is
  too implicit to depend on. Answers "where does identity live?" without a
  separate file or category — it is a rule that leads.

## 0.9.0 — 2026-07-27

- **Unified permissions** (`permissions/permissions.jsonc`) — `allow`/`deny`/
  `ask` declared once, compiled to Claude's `permissions` block *and* Codex's
  Starlark exec policy (`.codex/rules/meta-harness.rules`). This reverses a
  ratified decision: Codex previously had no per-command enforcement at all,
  only coarse `approval_policy`/`sandbox_mode`.
  - Verified end to end against codex 0.145 — a `deny` yields
    `decision = "forbidden"` and Codex refuses to run the command.
  - **Codex loads project exec policies only in a trusted directory.**
    Untrusted, a deny silently does not stop anything, so `generate` warns.
  - Declaring permissions in both `permissions/` and `settings/` is a hard
    error rather than a silent winner.
- Fragment collisions now name both colliding sources instead of saying
  "two sources".

## 0.8.0 — 2026-07-27

- **Rules now reach Codex and Hermes.** Verified against the shipped Codex
  binary: `.codex/rules/*.rules` is Starlark exec policy parsed by
  `codex_execpolicy` (`prefix_rule`, `decision="allow"`), not instructions —
  prose loads only through `core/src/agents_md.rs`, the `AGENTS.md` family.
  Previously every rule silently missed both targets. meta-harness now owns a
  marker-delimited block inside `AGENTS.md`:
  - Everything outside `<!-- meta-harness:start -->…<!-- meta-harness:end -->`
    is preserved verbatim and never counts as drift — the same ownership model
    already used for keys in `.claude/settings.json`.
  - Editing inside the block is drift and blocks `generate`, as with any output.
  - Dropping the Codex/Hermes targets strips the block and keeps your prose.
- Replaces the 0.7.0 warning, which could only tell you to duplicate rule
  content by hand — the staleness smell the tool's own review checklist flags.

## 0.7.0 — 2026-07-27

- `generate` now warns when `codex` is an enabled target, rules exist, and
  there is no `AGENTS.md` at the project root. Codex reads rules only from
  that file, so without it every rule silently misses the target — nothing
  previously revealed that.
- `status` distinguishes its advice: `MISSING` outputs just need a rebuild,
  where only `EDITED` ones need `--force`. It previously told you to force in
  both cases, which risks discarding work that was never at stake.
- Skill rewritten against skill-authoring best practices: broader triggering
  description, reasoning instead of bare prohibitions, and a worked example
  covering the rule-plus-permission pattern.

## 0.6.0 — 2026-07-27

- `meta-harness show` — what the harness contains, derived from the source
  files at read time. Replaces the idea of a checked-in summary document,
  which would go stale the moment a rule changed.
- `HARNESS.md` renamed `HARNESS-REQUEST.md` and reframed as **input only**:
  a plain-language request an agent builds from, never a record of what
  exists, never compiled. The skill is now explicit that agents must not
  write any file summarizing the harness — `show` is that view.
- Dropped `references/harness-format.md` (it specified the record format that
  no longer exists).

## 0.5.0 — 2026-07-27

- `meta-harness explain [category]` — prints the source file shape, frontmatter
  keys, an example, and where it compiles to. The schema now lives in code, so
  the skill points at it instead of restating it.
- Skill restructured for the agent-authoring flow: short `SKILL.md` plus
  `references/harness-format.md` (HARNESS.md format), `references/interview.md`
  (guided path), `references/review.md` (gap + best-practice checklist).
- `init` now presents all four agent entry points: plain ask, ask with inline
  requirements, spec-first via HARNESS.md, or guided interview.

## 0.4.0 — 2026-07-27

- `init` now installs the agent skill by default via `npx skills add
  jungsek/meta-harness` — the `skills` CLI owns skill directories and
  `skills-lock.json`, so meta-harness delegates instead of writing them.
  `--no-skill` opts out (offline / CI).
- `HARNESS.md` convention: describe your harness in plain language in the
  source root; it is never compiled. `init` scaffolds a template and the
  skill teaches agents to author category files from it.
- `init` now presents both paths explicitly: by hand, or by agent.
- SPEC §6a records the CLI / agent / skill layering (and why there is no
  interactive init wizard).

## 0.3.1 — 2026-07-26

- `init` detects a local npm install and prints the global-install tip
  (local `npm i` is what creates package.json/node_modules bloat — the tool
  itself never does).

## 0.3.0 — 2026-07-26

- Standalone product: all external-tool references removed from docs, code,
  and output paths. Hermes subagent specs moved
  `.hermes/rulesync/subagents/` → `.hermes/meta-harness/subagents/`
  (regenerate with `meta-harness generate --force` if you had the old path).
- CLI polish: color output (tty-aware, `NO_COLOR` respected), ✔/✘ summaries,
  `status` failure hint, `targets` marks enabled ones, `init` prints next
  steps, help examples, missing-source-dir error suggests `init`.
- SPEC rewritten standalone (v0.4); language-choice analysis recorded
  (JS over Rust: full 6-target generate ≈ 100 ms, startup-dominated).

## 0.2.0 — 2026-07-26

- First published release: `@jungsek/meta-harness` on npm.
- Six targets: claude, codex, agents, cursor, opencode, hermes.
- Owned-key drift for shared files, fragment assembly with hard-error
  collisions, symlink mode, per-target hook event whitelists, MCP dialect
  translation, scaffolding `init`, JSON schema, agent skill.
