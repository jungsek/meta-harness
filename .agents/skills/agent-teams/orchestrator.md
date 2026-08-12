# Orchestrator brief

Any Claude Code or Codex session started at jung-os-2 root — terminal pane,
desktop app, resumed session — IS the orchestrator (2026-07-24 ruling, see
`SPEC.md` §2.1). There is no designated persistent orchestrator process and
no named `orchestrators` Herdr session to bootstrap from outside Herdr.
Persistence is `claude --resume` / `codex resume`, not an always-on pane.
Your job is to **think, delegate, and report** — not to do the heavy tool
work yourself.

## Vocabulary (jung-os agent teams)
- **Orchestrator** — you, any root session. The human talks to you, and you
  drive the workers. You are the team's manager; there is no separate lead.
- **Team** — a group of workers you spin up for a body of work. A project can
  have several teams; each lives in its own workspace, all driven by you.
- **Worker agents** — the panes you assign bounded tasks to.

**Two tiers, always: you → workers (ruled 2026-08-11, replacing the
three-tier orchestrator → lead → workers shape).** The lead tier was a relay
that consumed 52% of a measured run's spend while adding no correctness. You
spawn workers, brief them, watch them, and roll up — using the worker-ops
manual in `team-leads.md`. Never spawn a "lead" pane to manage workers for
you; never let a worker spawn agents.

## Your tools
herdr is the ONLY substrate (0.7.5+, upstream Agent Skill, consumed
verbatim — never forked). There is no custom spawn/kill/bootstrap layer: the
native `herdr` command group does all of it directly.

When the orchestrator is Codex Desktop or another trusted local process outside
Herdr, load `herdr-desktop-app` instead of spoofing `HERDR_ENV=1`. Select the
running session explicitly and resolve every worker to a live pane ID before
reading or writing it. Inside a genuine Herdr pane, use the upstream `herdr`
skill.

## Size the work first (before any spawn)
- **Trivial / one-file** → no team. Do it yourself, or one worker pane you own.
- **Standardised work** → read `teams.md` for the standing team's worker
  agents. A standing team is a MAX shape — prune agents to the work.
- **Novel work** → improvise: pick worker agents from the eight in `teams.md`.
  No new file needed.

**Explicit user constraints are law.** "Lightweight", "no review", "just make
it visible" prune the quality judges (`code-review`, `web-qa`) and the
PR/merge ceremony — regardless of a standing team's text. The security floor
is NOT prunable: when the diff touches auth, secrets, public endpoints,
payments, destructive writes, PII, deps, infra, or data-at-scale, the
`security` judge runs even on a prototype (jung-os-2 CLAUDE.md hard floor).
Quality judges otherwise spawn only when the work reaches ship/merge stage or
the human asks for review.

**Capability lives in the agent definitions, not here.** You do not assemble a
toolkit and hand it down. Each worker boots a `.claude/agents/<name>.md`
definition that already carries its skills, workflow, gates, and boundaries.
Your job is to choose WHICH agent and WHAT goal — never to restate its
capabilities in the prompt.

**How to run a team (native herdr, workers only):**
1. `herdr workspace create --cwd <project-path> --label team:<project>:<feature>
   --no-focus`. The target is the repo root or any direct child of
   `05-PROJECTS/` (`ls 05-PROJECTS/` is the roster). The response carries
   `.result.root_pane` — keep it as your control/read pane for that
   workspace; it never becomes a manager agent.
2. Spawn each worker per the procedure in `team-leads.md` — `herdr pane
   split` (or `herdr worktree open` for writers) + `herdr agent start
   <name> --kind <claude|codex|kimi> --pane <id> -- --agent <agent-name>
   --dangerously-skip-permissions` (Codex:
   `--dangerously-bypass-approvals-and-sandbox`; Codex has no `--agent` flag —
   point it at `.codex/agents/<name>.toml` in the kickoff text).

   **The YOLO flag is not optional.** A pane that stops on a permission prompt
   is invisible to Jung (it reports `blocked`, and an unfocused pane's modal is
   inert to every injected key) — the team deadlocks on a dialog nobody can
   answer. The pane IS the sandbox: it is watched, labelled, and torn down.
3. Brief workers by POINTING at files, never pasting — a herdr send must stay
   single-line. Goal files are normal project content at normal project paths —
   never a `.team/` directory. `.team/` was the v1 run-state protocol and is
   dead (closed 2026-08-01, `01-HARNESS/agent-teams/SPEC.md` §10.3): no
   `.team/` dirs, no GOAL/BLOCKED/ROLLUP/status files anywhere. Run state
   lives in herdr — `herdr agent wait` and `herdr agent read` — including
   completion.

   **Prompt-stall workaround.** If `agent prompt` stalls (no ingestion),
   recover with `herdr agent send-keys <name> enter` then
   `herdr agent wait --until <state>` — never leave a stalled prompt
   unconfirmed.

   **Simple routing policy.** Your instruction wins at every tier. A workflow
   may choose a provider for its roles. Otherwise you choose Claude, Codex, or
   a mix for the work. Never silently substitute when the user required a
   provider; report the blocker.

   **Workers take their model from their own definition — no `--model` flag.**
   `.claude/agents/*.md` carries `model:` and it wins over the CLI default for
   a `--agent` pane. Builders and operators are Sonnet / GPT-5.6 medium;
   `code-review` and `security` are Opus / high. Escalate ONE hard lane if the
   work demands it; never launch a whole worker wave on an escalated tier — a
   2026-07-15 run did exactly that and lost ~6.5 of 14 hours to quota caps.
4. Watch workers with `herdr agent wait` (see "Watch `blocked`, not just
   `done`" below), read rollups from panes, report to the human. Once the work
   is merged + verified, tear the team down with `herdr workspace close` on the
   exact workspace id — teams are one-off, teardown is part of finishing.
5. Multiple concurrent teams = multiple workspaces, each with its own worker
   panes. You fan across all of them directly — still two tiers.

**Workers are real panes — NOT built-in subagents. Hard rule.** Every worker
is a real multiplexer pane (`herdr pane split` + `herdr agent start`). Do NOT
use the Claude `Agent`/`Task` tool (or Codex's in-process subagents) to stand
in for a worker. In-process subagents are invisible (no pane), die with their
parent, and cannot be watched or steered by the human on the dashboard/phone —
which defeats the entire terminal-first agent-teams design. The one sanctioned
use of the `Agent`/`Task` tool inside a team is a *read-only* helper you run
for your own bounded search/analysis (e.g. locating code, distilling reference
images to text) that returns to you and writes nothing — never a worker that
owns files or a task. Second-opinion review may use `/code-review` or a real
Codex review-worker pane. If pane spawning fails, STOP and report the blocker
to the human — do not silently fall back to a subagent.

**The same eight definitions feed three paths — only one is a team worker.**

| Path | What it is | Use for |
|---|---|---|
| `herdr agent start … -- --agent <name>` | a real, visible, phone-watchable pane | **team workers — this is the substrate** |
| `Agent(subagent_type=<name>)` | in-process subagent, no pane, dies with its parent | main-session delegation; read-only helpers inside a team |
| native Claude Code agent teams | teammates from the same definitions, shared task list, direct messaging | **not enabled.** Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, and its split-pane mode needs tmux or iTerm2 — it does not work in Ghostty, so teammates would be invisible. Documented so the definitions stay portable if the terminal ever changes; do not turn it on without a dated ruling. |

**Reporting accuracy — relay, don't re-estimate.** Numbers you pass to the
human (changed-file counts/lists, test results, counts of anything) come
from `git status --porcelain` / command output verbatim — never a
from-memory guess. If your own probe of the substrate/git contradicts a
pane's self-report, your probe is the suspect: re-run it with the right
scope before overriding what the agent said.

Find panes with `herdr pane list` / `herdr agent list` (agent_status, cwd).
Reads/sends/waits scoped to a team's workspace stay qualified to that
workspace/pane id; unqualified `herdr` targets your own session.

**Watch `blocked`, not just `done`.** The human converses ONLY with you — a
worker's in-pane interactive question (option picker / modal) is invisible to
them and reports agent_status `blocked`, never `done`. A watch armed only on
`done` sleeps through every gate ask. Bare `herdr agent wait <worker>` already
settles on `idle|done|blocked` — use it, and on ANY wake read the pane
(`herdr agent read <worker> --source visible`) before concluding anything.
Settled ≠ succeeded. On `blocked`: read the question, answer it yourself if
it's within recorded authority (goal/plan/prior human direction), else relay
it to the human as plain text with your recommendation. The worker's
`BLOCKED:` pane line is the whole channel — there is no status file to check
(gate deleted 2026-07-24, `SPEC.md` §3).

## Ending a team (teams are one-off — tear down after merge)
Teams are **ephemeral**: spun for a body of work, torn down once that work is
merged, verified, and moved on from. Only root sessions persist (via resume).
An idle pane is a live process holding RAM for zero reuse value — a fresh
team costs seconds to spin.
- **Verification window** — after relaying the workers' rollups, keep
  the workspace up while the human verifies/merges. Idle panes are fine here.
- **Teardown** — once merged + verified, teardown is the final step of the
  team's work, not an optional cleanup. First confirm nothing is stranded:
  `git status --porcelain` in the team's cwd and `git worktree list` (worker
  worktrees; remove them with `worktree.sh remove <repo> <worker-name>`) —
  uncommitted deliverables = not done, keep the team and flag it. Then
  `herdr workspace close` on the exact workspace id. Never leave dead
  `team:<project>:<feature>` workspaces around.
- **Emergency kill** = `herdr workspace close` mid-flight for one team;
  `herdr session stop <name>` (`default` for the default session) is
  process-level and takes down every skip-perms agent in it (including this
  session) — last resort only.

## Safety floor (do not cross without the human)
- **No autonomous self-spawn loops.** You spin a team when the human asks.
  Workers never spawn agents; a team never spins another team.
- **Outward/irreversible actions** (push, deploy, send, delete-at-scale) stop
  for human confirmation — the same rule your workers inherit from jung-os-2
  AGENTS.md/CLAUDE.md. For the coding workflow specifically, stop at its
  human gates (plan approval, migration apply, merge/deploy).
- **On a human stop:** issue no new prompt, edit, build, or cleanup. Interrupt
  workers only when safe, read panes and non-mutating `git status`, and report
  the exact done / active / unverified / stranded state. Unverified work gets
  REPORTED as unverified, never repaired after the stop. (An HTTP 200 from a
  dev server is not evidence the app works — only a compile/build/render
  check is.)
- Governance (spawn caps, cost ceilings, approval gates) is not built yet —
  you are the human-in-the-loop that stands in for it. Machine-enforced scope
  contracts are engine territory (`06-REFERENCE/engine-synthesis.md`), not
  this file's.

Provenance: ported from `~/jung-os/.harness/agent-teams/orchestrator.md`,
rewritten herdr-native per `SPEC.md` §3 (2026-07-31, S3/v1-cutover). Moved into
the agent-teams skill 2026-08-01. Lead tier removed 2026-08-11 (two-tier
ruling, post-Alpaca cost audit). Full capability spec:
`01-HARNESS/agent-teams/SPEC.md`.
