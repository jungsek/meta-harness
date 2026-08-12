# Worker-ops manual (formerly the team-lead brief)

How to spawn, brief, watch, and collect worker agents. Since the two-tier
ruling (2026-08-11) there is no lead pane: **the orchestrator itself follows
this manual** when it runs a team. "You" below is the orchestrator. Project
specifics layer on top — this baseline stays lean. The roster of agents and
standing teams is `teams.md`.

Provenance: `.agents/skills/agent-teams/` (source). Sibling of `orchestrator.md`.

## Who you are
You are the **orchestrator driving one or more teams**. The human talks to
you; you drive your worker agents directly. You spin only workers, sized to
the work (minimum one); workers never spawn agents.

Working dir for a team: its project root (`herdr workspace create --cwd`).
The team's marker is `team <feature>` — it must appear in every agent you
launch.

## Spawn workers as real PANES — hard rule
Every worker is a **real herdr pane**, spawned natively (`HERDR_ENV=1`).
herdr is the ONLY substrate. Do **not** use the Claude `Agent`/`Task` tool
(or Codex in-process subagents) to stand in for a worker: in-process
subagents are invisible (no pane), die with you, and can't be watched or
steered by the human on the dashboard/phone — which defeats the whole point
of terminal-first agent teams. (The `Agent`/`Task` tool is fine for a
*read-only* search/analysis helper you run for yourself that writes nothing.)

Spawn one worker per call — call it as many times as the work needs. Give every
worker a unique herdr agent name; that name is the only handle you need to
prompt it, wait on it, and read its result.

```bash
# Pick claude or codex for every worker. User request wins; then workflow;
# otherwise choose the best fit or mix both. Never silently replace a requested
# provider. Do NOT pass --model: the agent definition already carries the
# worker tier. Pass it only to escalate ONE hard lane.

# split off a worker pane inside the TEAM workspace — target its root pane
# explicitly (you live in your own workspace, so never --current here);
# --direction is required, output is JSON
p1=$(herdr pane split --pane <team-root-pane-id> --direction right \
     --cwd <project-path> --no-focus \
     | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['pane']['pane_id'])")

# Claude worker — --agent loads .claude/agents/<name>.md as its root persona
herdr agent start w1 --kind claude --pane "$p1" -- \
  --agent development --dangerously-skip-permissions

# Codex worker — same split call for its own pane ($p2); no --agent flag
# exists, so the persona rides in the kickoff text
herdr agent start w2 --kind codex --pane "$p2" -- \
  --dangerously-bypass-approvals-and-sandbox

herdr agent prompt w1 "read /abs/path/brief.md and do the work" --wait
```

**The YOLO flag is mandatory on every worker.** Claude:
`--dangerously-skip-permissions`. Codex:
`--dangerously-bypass-approvals-and-sandbox`. Kimi takes the Claude flag. A
worker that stops on a permission prompt reports `blocked` and wedges: an
unfocused pane's modal is inert to every key you can inject (see Herdr pane-I/O
limits below), so only a human at the keyboard can clear it. The pane is the
sandbox — labelled, watched, torn down.

**`--agent <name>` is how a worker gets its capabilities.** The definition in
`.claude/agents/<name>.md` carries its skills, its whole workflow, its gates,
and its boundaries.

> **`--agent` resolves against the pane's CWD** (verified 2026-07-31). Launch a
> worker with a cwd OUTSIDE jung-os-2 and it dies immediately with
> `--agent 'x' not found. Available agents: claude, Explore, general-purpose,
> Plan, statusline-setup`. Always pass `--cwd` inside jung-os-2, or use
> `worktree.sh`, which symlinks `.claude/agents` into the checkout for exactly
> this reason.
>
> **A freshly split pane is not immediately startable.** `herdr agent start` on
> a just-created pane returns `agent_pane_busy: not an available shell` while
> the shell is still coming up. A brand-new workspace's root pane behaves the
> same way — splitting off it right after `workspace create` can return
> `pane_not_found` (verified 2026-08-01). Retry; do not treat the first failure
> as a blocker.
>
> **`herdr agent read` returns raw terminal text, not JSON** — do not pipe it
> through a JSON parser. Claude panes run on the alternate screen, so
> `--source visible` is the reliable read; `recent-unwrapped` can come back
> empty.

Do NOT restate a worker's capabilities in the brief — say what to DO, not what
the agent is. Pick from the nine in `teams.md`. Codex workers have no `--agent`
flag: point them at `.codex/agents/<name>.toml` in the kickoff prompt instead
(`01-HARNESS/claude-codex-port/AGENT-PORTING.md` §4).

**Routing policy:** The human's requested provider wins at every tier. Next
follow the standing team's routing in `teams.md`. If neither chooses, select Claude, Codex, or a
mix for the work. If a required provider cannot launch, report the blocker; do
not substitute.

**Model: the definition decides, you don't.** Every `.claude/agents/*.md` now
carries a `model:` field and it wins over the CLI default for a `--agent` pane
(verified 2026-08-01: `--agent development` boots Sonnet inside an Opus
session). So spawn workers with NO `--model` flag. Builders and operators are
Sonnet / GPT-5.6 medium; `code-review` and `security` are Opus / high because a
missed correctness or P0 call costs more than the tokens.

Pass `--model opus` (Claude) or a high-reasoning Codex worker ONLY to escalate
a single hard lane, never a whole wave. This is the expensive lesson: a
2026-07-15 team run put every role on the premium model and spent ~6.5 of 14
hours stalled on quota caps. Workers are where N multiplies — that is exactly
where cheap belongs.

**Kimi worker:** a bounded Kimi K3 worker is `herdr agent start <name> --kind
kimi --pane <id> -- <args>` — native `--kind kimi`, no separate launcher or
profile file. It reads `KIMI_API_KEY` or macOS Keychain service
`jung-os-kimi-code`, isolates provider variables to that child, and fails
closed when no credential exists. This is an explicit route, never automatic
failover.

**Skill imperatives in every brief.** Use the worker's native mechanism for
every named skill: Claude emits `Skill(skill=<name>)`; Codex explicitly
invokes `$<name>`. Passive skill lists do not count. Skills are
model-discretionary and get silently skipped under load. The agent definition
a worker boots with `--agent` already states its skills imperatively, phase by
phase — your brief adds the GOAL, never a restatement of its capabilities.

**Deterministic lever.** When a worker is idle, explicitly invoke the skill in
its own syntax instead of hoping it self-invokes. `agent prompt` submits text
and Enter atomically — `send-keys` takes KEYS ONLY and rejects a text argument
(`invalid_key: unsupported key /impeccable`, verified 2026-08-01):
```bash
herdr agent prompt <claude-worker> '/impeccable' --wait
herdr agent prompt <codex-worker>  '$impeccable' --wait
```
Then read the pane for the result (`herdr agent read <name> --source visible`).

Passive skill lists do not invoke anything. Write briefs imperatively and keep
the provider-native injection lever as the deterministic backstop.

Enforcement is the imperative brief + this lever — never an invocation
artifact you make the worker write. The worker reports which skills it invoked
in its pane. If a lane's design/review quality matters, fire the skill into the
pane via the lever and read the result — that is your proof.

For everything else herdr — reading panes, `herdr agent wait` — use the
installed **`herdr` skill** (the native upstream one; it activates only inside
herdr panes). Do not hand-roll herdr command sequences the skill already
documents.

### Worktrees — one command, never by hand
A worker that writes gets its own worktree. Do NOT call `git worktree add` or
`herdr worktree create` directly: a raw checkout carries tracked files only, so
the gitignored harness wiring (`.claude/settings.json`, `.claude/agents`,
`.claude/skills`, `.agents/skills`, `.codex/agents`) is missing and the worker
runs without the harness settings, plugins, permission floors and skills. Use:

```bash
WT=$(bash .agents/skills/agent-teams/worktree.sh create <repo> <worker-name>)
herdr worktree open --workspace <ws-id> --path "$WT" --label <repo>:<worker-name> --no-focus
herdr agent start <worker-name> --kind claude --pane <pane-id> -- \
  --agent <agent-name> --dangerously-skip-permissions
```

The script fixes the path at `05-PROJECTS/.worktrees/<repo>/<worker-name>`
(worktrees are infrastructure, never beside the real repos), branches
`team/<worker-name>`, re-applies the wiring, and marks it ignored so the
checkout still reads clean. Skills DO need wiring and the script does it —
they never arrive by directory walk-up. Only `CLAUDE.md` walks up; skill,
agent and settings discovery is bounded by the enclosing git repo, and a
worktree is its own checkout. A worker that "can't find" a skill is an
unwired checkout, not a missing skill.

Teardown is `worktree.sh remove <repo> <worker-name>`. It refuses while real
uncommitted work is present; `-f` overrides and discards it, so read the pane
before reaching for it. The `team/<name>` branch is deliberately left behind.

### Layout convention — control pane LEFT, up to a 2×2 worker grid on the RIGHT
The house layout inside a team workspace: **the workspace's root pane stays a
plain control/read shell on the left; workers tile into a 2×2 grid on the
right half.** Build this with `herdr pane split` calls when spawning each
worker. Four right panes is the viewability target (readable on a
dashboard/phone) — NOT a fixed worker count. Run **as many or as few workers
as the task needs**; 4 is just the most panes that stay legible at once.

Fewer workers → stop early (1 = right half; 2 = two right columns; 3 = drop
the fourth). **More than 4 workers → run them in waves:** wait out the wave,
read each worker's rollup from its pane, close all worker panes (`herdr pane
close <id>`), then spawn the next wave. `/clear` does not free a tile. Never
keep more than 4 live workers, or the grid stops being readable. Keep the
pane/agent refs — you need them to send text to / read each worker's pane
anyway.

## Image + visual verification discipline (ruled 2026-08-11)
The Alpaca audit found ~15MB of image blocks across five contexts and a
32-screenshot verify loop — images in a long-lived context get re-read every
turn, so this is the biggest silent cost multiplier.
- **Each reference image enters ONE context.** Solo build: the builder reads
  its references itself, once. Multi-worker: you (or a read-only helper that
  returns text) look at the references once, put the shared facts — layout,
  hex values, typography, spacing — in a text brief, and give each worker at
  most its OWN surface's image. Workers never browse the image directory.
- **One visual owner per surface.** The builder that owns a screen does its
  visual iteration; you do not re-screenshot its work, and a judge screenshots
  only when a judge is in scope.
- **Screenshot when it will inform an edit; stop after a clean pass.** In
  practice ~3–6 per screen for pixel-faithful work, one final shot for a
  rough prototype. Unbounded pixel-nudging loops are the named anti-pattern.
  Use DOM checks (`getComputedStyle`, text reads) for values and structure —
  pixels are for composition, clipping, and rendering.

## Drive + collect
- Send work/nudges — `herdr agent prompt <name> "<text>" --wait`. That is the
  only way to send TEXT: `send-keys` takes keys (`enter`, `esc`, `ctrl+c`) and
  rejects anything else with `invalid_key`. Raw fallback is `herdr pane
  send-text <pane-id> "<text>"` then `herdr pane send-keys <pane-id> enter`.
  Keep sends single-line; point workers at files for anything multi-line.

  **Prompt-stall workaround.** If `agent prompt` stalls, recover with `herdr
  agent send-keys <name> enter` then `herdr agent wait <name>` — never leave a
  stalled prompt unconfirmed.
- **Completion gate = herdr agent state, read back from the pane.** Workers do
  NOT write status/result files — that gate was deleted 2026-07-24 (`SPEC.md`
  §3) and herdr is the substrate for this too. A worker is done when `herdr
  agent wait` settles it and its pane shows the finished work:

  ```bash
  herdr agent prompt <worker> "<task>" --wait --timeout 600000   # ingestion + first settle
  herdr agent wait   <worker> --timeout 600000                   # settles on idle|done|blocked
  herdr agent read   <worker> --source visible --lines 40
  ```

  Bare `agent wait` already arms the settled set — do not re-pass those three
  with `--until`. Arm `--until` only for a state-specific watch. `idle` and
  `done` are the SAME settled state (`done` just means the tab hadn't been
  seen focused), so waiting bare is focus-independent; that is why a bare wait
  is a gate and `--until done` alone is not.

  > **A settled wait is only a gate AFTER the turn actually started** (verified
  > 2026-08-01). Wait on a worker that never ingested your prompt — or that
  > herdr hasn't yet flipped to `working` — and it returns `idle` instantly and
  > you will read a half-empty pane and call it done. Order matters: `agent
  > prompt --wait` FIRST (it fails loudly with `agent_prompt_stalled` instead
  > of pretending), then the bare wait. After the stall workaround, one bare
  > wait can still return the stale `idle`; if the pane shows the turn running,
  > wait again.

  Then READ the pane — settled is not the same as succeeded. `blocked` means a
  question is waiting; `unknown` means herdr can't classify the pane (a crashed
  agent reports `unknown`, never `done`) — inspect, never assume done. Wait out
  a whole wave, then read each worker, rather than gating one worker at a time.
  A worker's own `DONE:` line in the pane is what you roll up.
- **Single-writer discipline:** one worker per file/dir/branch. Partition the
  work so no two workers write the same path. Shared/aggregate files (indexes,
  logs) are owned by YOU — workers report deltas, you centralize.
- **Herdr pane-I/O limits:** (a) a Claude modal/dialog in an UNFOCUSED pane is
  inert to every injected key — down/escape/digits/enter all no-op; a
  modal-wedged pane can only be closed + relaunched; (b) an unsupported key
  (e.g. ctrl-c) is rejected — you cannot interrupt a wedged pane that way;
  (c) reading a pane gives you the visible viewport, not scrollback history —
  a "truncated" text may just be scrolled off.
- **Never block on an interactive modal.** Because of (a), any state where you
  or a worker would wait on an in-pane interactive question is a deadlock for
  everyone but a focused human. Put the same instruction in every worker brief.
- **Gate asks travel as plain pane text, never as a picker.** The human never
  watches worker panes — they talk to you. Put this instruction in every
  worker brief: print any question needing input as plain text — `BLOCKED:
  <question> | options | recommendation` — so your `herdr agent read` picks it
  up on the `blocked` wake. An interactive option dialog in a worker pane is a
  deadlock (unfocused modals ignore injected keys); text FIRST, always. No
  side-channel file: the pane IS the channel.

## Done means torn down (by you, after human verification)
Teams are one-off. When the team's work is complete, roll it up to the human:
what changed (counts/lists from real command output — `git status
--porcelain`, test output — never a from-memory guess), the review verdict if
one was required, and any blocker. Keep the workspace up through the human's
verification window; once the work is merged + verified, leave nothing
stranded (commit/hand off deliverables, `worktree.sh remove <repo>
<worker-name>` for worker worktrees) and close the exact workspace id with
`herdr workspace close`.

## Safety floor
No autonomous self-spawn loops; you spin workers only for the assigned goal.
Workers never spawn further agents. Enforce the project's stated safety rules
in the work itself. Human gates (plan approval, migration apply, merge/deploy)
and outward/irreversible actions (push, deploy, send, delete-at-scale) stop
for the human. Infrastructure and data-at-scale changes get a second review
(`/code-review` or a real Codex review-worker pane) before you report done.
