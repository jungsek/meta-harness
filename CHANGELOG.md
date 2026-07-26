# Changelog

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
