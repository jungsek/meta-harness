# Changelog

## 0.17.2 — 2026-07-28

- **Behavioral layer is now plug-in, not paraphrase.** `references/
  agents-md.md` ships the tested one-command fetch that pulls the upstream
  Karpathy-guidelines CLAUDE.md verbatim into `rules/behavioral-guidelines.md`
  with a provenance comment (source URL + fetch date), so the layer stays
  diffable against its source; refresh = re-fetch + diff, localize = fork
  below the comment. Also documents the `/doctor` import caveat: whether it
  follows `@AGENTS.md` from a stub CLAUDE.md is undocumented — symlink
  sidesteps it, otherwise verify before trusting a "healthy" report.

## 0.17.1 — 2026-07-28

- **`references/agents-md.md` gains three practitioner findings**: judgment
  over absolutes (Anthropic's ~80% system-prompt cut with zero regression —
  absolute rules collide and burn effort; "match surrounding style" outlives
  a NEVER-list; onboard a senior, not an intern); the one earned exception
  to no-generic-prose — a small behavioral layer against observed LLM
  failure modes (Karpathy-guidelines shape: assumptions/simplicity/surgical
  diffs/verifiable goals) with observable "working if" criteria and
  model-progress re-pruning; and `/doctor` + delete-don't-add as
  maintenance mechanics.

## 0.17.0 — 2026-07-28

- **New skill reference: `references/agents-md.md`** — how to write and
  maintain AGENTS.md/CLAUDE.md prose and `rules/` files. Distilled from
  vendor guidance (Anthropic, Codex, agents.md spec) and measured practice
  (GitHub's 2,500-repo study, ETH Zurich's context-file evaluation): the
  would-removing-this-cause-a-mistake test, 30–50 lines to start and
  under-200 sweet spot, failure-driven rules over anticipatory ones,
  prose-persuades-permissions-enforce division of labor, root-as-router
  monorepo nesting, and the add-on-second-mistake / prune-what's-followed
  maintenance loop. The skill points to it wherever prose or rules get
  written.

## 0.16.1 — 2026-07-28

- **An untouched `HARNESS-INIT.md` no longer builds a phantom harness.** The
  scaffold ships the file with an example request; an agent reading it could
  not tell placeholder from intent and would build the example verbatim
  (deepwiki server, timestamp hook, subagents nobody asked for — observed
  live on a fresh init). The skill now names the placeholder and treats it
  as "no intent": offer a guided interview or the new recommended baseline
  (`references/baseline.md` — source-of-truth + git + safety rules with
  their enforcing denies, targets only as detected, merged with anything
  the user did say, never copied). The scaffold states the same contract
  for agents that read it without the skill.

## 0.16.0 — 2026-07-27

- **The `agents` target is gone.** The `.agents/` layout's only verified
  content is `.agents/skills/` — owned by `npx skills add`, and Codex reads
  only `skills/` and `plugins/marketplace.json` from that tree (measured).
  The `.agents/commands|subagents` files the target emitted had no confirmed
  reader anywhere; speculative output deleted. Five targets remain. Existing
  `.agents` outputs prune automatically on the next generate; a config or
  frontmatter still naming `agents` gets a clear unknown-target error. This
  also removes the `explain agents` category/target name collision.
- **`init` now guarantees Claude can see the installed skill.** `npx skills
  add` mirrors into `.claude/skills/` only when it detects a *Claude* agent
  driving the terminal — run from Codex, a plain shell, or CI it writes
  `.agents/skills/` alone, which Claude Code does not read, so `/meta-harness`
  silently didn't exist. init now creates the
  `.claude/skills/meta-harness → .agents/skills/meta-harness` symlink itself
  (idempotent; uninstall already removes it). Verified live: fresh init →
  both a real Claude session (`/meta-harness` from `.claude/skills/`) and a
  real Codex session report the skill available.

## 0.15.0 — 2026-07-27

- **`uninstall` now removes every trace by default** (the 0.14.0 `--purge`
  split is gone): outputs via the kind-aware prune, then the source dir,
  `meta-harness.jsonc`, the installed skill at `.agents/skills/meta-harness`,
  the `.claude/skills/meta-harness` symlink `npx skills add` creates
  (dangling-link aware), and the package's own entry in `skills-lock.json`
  (other skills' entries untouched; file deleted only when empty). Emptied
  parent dirs are tidied. User prose, foreign keys, and other skills survive;
  hand-edited outputs still refuse without `--force`; the sourceDir
  root-escape guard stays. Verified: a real init+generate tree uninstalls to
  a completely empty directory.

## 0.14.0 — 2026-07-27

- **`init` auto-detects targets.** Repo signals (`.claude/`, `.codex/`,
  `.cursor/`, `opencode.json`/`.opencode/`, `.hermes/`, `.agents/`
  layout dirs) union machine signals (the tool's binary on PATH), evidence
  printed per target. Deterministic — no prompts (the agent stays the
  wizard); `init --targets a,b` overrides, nothing detected falls back to
  `["claude","codex"]`, and an existing `meta-harness.jsonc` is never
  rewritten. `AGENTS.md` is deliberately not a signal — half the targets
  read it, it discriminates nothing.
- **`meta-harness uninstall`** — teardown for testing and clean exits. Every
  manifest-tracked output is removed the kind-aware way (marker files lose
  only the managed block, shared files lose only owned keys, plain files
  deleted with empty parent dirs tidied), then the manifest. Hand-edited
  outputs refuse without `--force` — same contract as generate. `--purge`
  also removes the source dir, `meta-harness.jsonc`, and the installed agent
  skill; `--check` dry-runs.

## 0.13.2 — 2026-07-27

Live-enforcement verification round: hooks, permissions, env, and MCP were
exercised inside real Claude Code and Codex sessions (including the Codex
directory-trust and hooks-trust dialogs, driven interactively).

- **Critical: `enabledPlugins` was emitted as an array, and Claude rejects
  the entire settings file over it.** Claude expects a record
  (`{"name@marketplace": true}`); given the scaffold's `[]`, Claude reported
  "Expected record, but received array" and **skipped `.claude/settings.json`
  wholesale — silently killing hooks, env, permissions, and settings** for
  every adopter with a plugins file. The source stays a list; the Claude
  emitter now compiles it to a record, and an empty list emits nothing.
- Verified live after the fix, per runtime:
  - Claude: SessionStart hook fires; `deny` blocks the exact command
    ("Permission … has been denied"); env vars reach Bash; `.mcp.json`
    servers load (needs folder trust, as designed).
  - Codex: after directory + hooks trust, hooks fire, `.codex/rules` exec
    policy blocks the exact forbidden command, `[shell_environment_policy]`
    applies.

## 0.13.1 — 2026-07-27

Three real defects from an independent Codex adversarial audit (a fourth
finding was disproven against the running CLI):

- **First generate no longer overwrites an unparseable pre-existing shared
  file.** A hand-written but malformed `.codex/config.toml` (or any shared
  output) used to be replaced wholesale at exit 0 with only a warning — the
  one gap left in the 0.10.2 adoption guard. Unparseable + unmanaged now gets
  the same refusal as any other pre-existing path; `--force` remains the
  opt-in.
- **`--only`/`-t` partial runs no longer delete shared-file keys owned by
  unselected categories.** `generate --only env` used to strip
  `[mcp_servers]` out of `.codex/config.toml` and drop its ownership from the
  manifest — a destructive act from a run advertised as non-pruning. Partial
  runs now preserve previously-owned keys and record the ownership union.
- **A stray unpaired marker no longer causes permanent self-drift.** A
  pre-existing lone `<!-- meta-harness:start -->` made every regenerate pair
  it against the appended block's end and refuse forever. Now: refused
  up-front as unmanaged; `--force` strips the stray marker lines and
  converges to a clean, stable state.

## 0.13.0 — 2026-07-27

Findings from a full end-to-end pass over the published package: fresh
install, adoption, 0.10-tree migration, and live rules-pickup verification
inside both Claude Code and Codex sessions (both runtimes quoted a sentinel
rule back — the AGENTS.md block and the CLAUDE.md stub import are confirmed
working in production, not just in tests).

- **Fixes `init`'s skill install, broken for every adopter.** `SKILL.md`'s
  unquoted frontmatter description contained `repo: "build my harness"` —
  invalid YAML, so `npx skills add` rejected the skill and every `init`
  printed a warning. Description is now a block scalar, and a test parses the
  frontmatter so this class of break can't ship again.
- **Empty MCP config compiles to nothing.** The scaffold's commented-out
  `mcp.jsonc` used to emit a pointless `.mcp.json` `{}`, an empty
  `[mcp_servers]` table, and their cursor/opencode equivalents. No servers →
  no connection outputs; existing empty files prune on the next generate.
- **The scaffold example rule is now a real rule.** Its old body was
  scaffold meta-chatter ("Delete this file after reading…") which, post-0.11,
  landed inside AGENTS.md where every runtime read it as an actual
  instruction. Guidance moved to frontmatter comments.
- **Codex trust warnings fire once, not every run** — on first write of
  `.codex/rules/` or `.codex/hooks.json` rather than on every generate, and
  hooks now get their own warning (entries silently don't fire until trusted).

## 0.12.0 — 2026-07-27

- **`meta-harness explain <target>`** — per-target manual alongside the
  category shapes: managed surfaces, measured nuances (each target carrying
  the version it was verified against, claimed only where actually measured —
  codex-cli 0.145.0 today), vendor docs by link. `explain` with no argument
  lists both. `agents` names both a category and a target; the category wins.

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
