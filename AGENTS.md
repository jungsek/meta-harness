<!-- GENERATED from CLAUDE.md by sync-project-harness.sh — edit CLAUDE.md, then re-run the sync. -->

# jung-os-2

Jung's agent-harness monorepo — skills, agents, settings, docs that projects under `05-PROJECTS/` build on. Map: `01-HARNESS/HARNESS.md` · port doctrine: `01-HARNESS/claude-codex-port/PORT-WORKFLOW.md` · history: `01-HARNESS/MIGRATION-LOG.md` · who Jung is: `JUNG.md`.

## Working style

- Surface assumptions and tradeoffs before building. Multiple readings of a request → present them, don't pick silently.
- Surgical diffs: every changed line traces to the request; match existing style; mention unrelated dead code, don't touch it.
- Turn tasks into verifiable goals (bug → failing test → make it pass); verify before declaring done.

## Harness

- Nine agents in `.claude/agents/` — SOURCE OF TRUTH for all agent capability: builders (development, frontend), judges (code-review, web-qa, security — read+test only, never write source, never judge their own runtime's build), operators (shopify, browser, marketing, obsidian). No specialist fit → main level. `model:` in each definition sets its tier and wins over the CLI default for a `--agent` pane — opus on code-review/security, sonnet elsewhere; never spawn a worker wave on a premium tier.
- Agents are consumed three ways: Agent tool (in-process) · `claude --agent <name>` (herdr worker pane) · generated `.codex/agents/*.toml` (`python3 01-HARNESS/claude-codex-port/port-agents.py` after ANY agent edit; `--check` verifies sync). Doctrine: `01-HARNESS/claude-codex-port/AGENT-PORTING.md`. Team roster: `.agents/skills/agent-teams/teams.md` — there is no preset layer.
- Every herdr-spawned pane launches with permissions bypassed: Claude `--dangerously-skip-permissions`, Codex `--dangerously-bypass-approvals-and-sandbox`. A pane blocked on a prompt is a deadlock — an unfocused pane's modal ignores injected keys.
- Skills canonical in `.agents/skills/` (Codex reads natively); `.claude/skills/` holds relative symlinks only. New skill = dir + symlink, never a copy. New project = `/new-project`.
- Every direct child under `05-PROJECTS/` is a separate project scope and harness consumer, regardless of its current Git topology; this includes `Aston-Abode-Drive`, even while Git resolves it to the `jung-os-2` root. Root work may audit and report a project's harness drift, but edits, branches, commits, and PRs for that project are separate work and must not be folded into a root change. Projects inherit only `CLAUDE.md` by directory walk-up; everything else is COPIED in by `bash 01-HARNESS/sync-project-harness.sh` (idempotent; `--check` reports drift): `.claude/agents`, `.claude/skills`, `.claude/settings.json`, `.agents/skills`, `.codex/agents`. Copies, not symlinks (ruled 2026-08-03, reversing 2026-08-02): a project repo must keep its harness on CI, collaborator clones, and cloud agents, where a symlink into the monorepo is dead. The cost is drift between refreshes — re-run the sync after ANY root harness change and after adding a project. Each managed dir's `.harness-manifest` tracks what the sync owns; project-owned entries are never overwritten; per-project overrides go in `.claude/settings.local.json`.
- `CLAUDE.md` is canonical, `AGENTS.md` is GENERATED (ruled 2026-08-03, flipping the prior direction). Canonical doctrine lives at repo-root `CLAUDE.md`; each project's own instructions live in its `CLAUDE.md`. Codex reads only `AGENTS.md` and does NOT walk up past a project's git root (verified 2026-08-02), so `sync-project-harness.sh` generates every `AGENTS.md` as a literal copy: root = this file; own-git projects = root + project `CLAUDE.md` concatenated (doctrine physically travels — works on CI/clones); shared-git projects (Aston-Abode-Drive) = project `CLAUDE.md` only, since Codex's walk-down already prepends the root file. NEVER hand-edit an `AGENTS.md` — edit the `CLAUDE.md`, re-run the sync; `--check` flags stale copies.
- Git, jung-os-2 root: work DIRECTLY on `main` — commit and push, no feature branches, no PRs (ruled 2026-08-02). Concurrent sessions share this one working tree, so a `git checkout` in one session yanks files out from under every other; branching here is harm, not hygiene. Scope each commit tightly (stage only your files — others' in-flight work is always present).
- Git, projects under `05-PROJECTS/`: real codebases keep the branch flow — `/commit-push-pr` ships, `/merge-pr` lands once checks are green. Never force-push, anywhere. ONE exception (ruled 2026-08-03): the full harness (`AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.claude/`, `.agents/`, `.codex/`) is auto-committed and pushed straight to the project's default branch by `sync-project-harness.sh`; when the clone is parked on another branch the commit is built in a throwaway `git worktree` of main — the shared clone is never checked out sideways.
- Worktree-first in projects (ruled 2026-08-03): every project clone stays checked out on main/master permanently. Branch work — features, fixes, experiments — happens in a `git worktree`, never via `git checkout` on the shared clone (a checkout yanks files from under every other session in that repo). Interactive: EnterWorktree. Herdr worker panes: `bash .agents/skills/agent-teams/worktree.sh create <repo> <worker>` (already doctrine in agent-teams). Finding a clone parked off-main is drift to fix, not a state to work around.
- Adversarial review on non-trivial builds: `/codex:review` (Codex reviews Claude work; reverse via Codex-side native `/review`). Dev self-runs `code-review-and-quality` + `security-and-hardening` on its own diff first.
- Security agent handoff mandatory when a diff touches auth, secrets, public endpoints, payments, destructive writes, PII, deps, or infra.

## Hard floors

- Never read `.env` VALUES — key names only (`cut -d= -f1`). Secrets live in `.secrets/`, never in settings or code. AGENTMEMORY_SECRET never copied anywhere.
- Confirm-first with Jung: outward sends/publishes (marketing, email), live-store writes (shopify), destructive page actions (browser). HARD DENY: bulk customer/order deletion.

## Gotchas

- zsh: avoid `==` and bare `=word` tokens in Bash commands (expansion errors); `rm -rf` is permission-denied — use targeted `rm`.
- HARNESS.md is reformatted externally by Jung — always re-grep exact current text before editing; python line-splice over Edit-tool exact match.

# meta-harness

One setup, every coding agent — CLI + dashboard for syncing rules/hooks/skills
across Claude Code, Codex, Gemini, and other agent runtimes. Node/TypeScript CLI
(`src/`, `bin/`), Vite+React dashboard (`dashboard/`).
