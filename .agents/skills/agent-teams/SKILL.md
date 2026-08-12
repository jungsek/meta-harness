---
name: agent-teams
description: Launch and drive visible JungOS agent teams in Herdr. Use whenever the user asks Codex or Claude to spin up a team, Claude or Codex workers, a mixed-provider agent team, or its own Herdr-hosted coding session.
---

# Agent teams

Any root Claude/Codex session at jung-os-2 is the orchestrator (no separate
named session to bootstrap) — read `.agents/skills/agent-teams/orchestrator.md`
first. herdr is the ONLY substrate; use the native `herdr` command group
directly. A genuine Herdr pane uses the upstream `herdr` skill. Codex Desktop
or another external local controller uses `herdr-desktop-app` and must select
the session plus every target explicitly. Never weaken or edit the upstream
Herdr skill.

## Read first

1. `.agents/skills/agent-teams/orchestrator.md` — the two-tier dispatch flow
   (orchestrator → workers, no lead tier; ruled 2026-08-11), sizing, native
   herdr commands.
2. `.agents/skills/agent-teams/workers.md` — the worker-ops manual the
   orchestrator follows: spawn, brief, watch, collect, image discipline.
3. `.agents/skills/agent-teams/teams.md` — the roster: eight agents, five
   standing teams, and the spawn one-liner. Capability lives in `.claude/agents/*.md`,
   never in a preset (presets deleted 2026-07-31).
4. Full capability spec (background/ratified decisions): `01-HARNESS/agent-teams/SPEC.md`.

## Launch a team

1. Size first (see `orchestrator.md`): trivial work gets no team; standing
   teams are MAX shapes to prune; explicit user constraints prune quality
   judges; the security floor never prunes.
2. `herdr workspace create --cwd <path> --label team:<project>:<feature>
   --no-focus`. The target is the repo root or any direct child of
   `05-PROJECTS/` — the directory name IS the slug, no registry to consult.
   Its `.result.root_pane` stays a plain control/read shell — workers split
   off it.
3. Spawn each worker per `workers.md` with permissions bypassed and its
   agent definition loaded:

   ```bash
   herdr agent start <worker-name> --kind claude --pane <id> -- \
     --agent <agent-name> --dangerously-skip-permissions
   herdr agent start <worker-name> --kind codex --pane <id> -- \
     --dangerously-bypass-approvals-and-sandbox
   ```

   The YOLO flag is mandatory on every pane — a worker stopped on a permission
   prompt reports `blocked` and wedges, since an unfocused pane's modal ignores
   every injected key. `--agent <name>` loads `.claude/agents/<name>.md` as the
   pane's root persona, so never restate its capabilities in the prompt. Codex
   has no `--agent` flag; point it at `.codex/agents/<name>.toml` in the kickoff
   text instead. Workers never pass `--model` — `.claude/agents/*.md` carries
   `model:` and it wins for a `--agent` pane.
4. Kick off by POINTING at files, not pasting: `herdr agent prompt
   <worker-name> "read /abs/path/brief.md and do the work" --wait`. Sends must
   stay single-line. If the prompt stalls, recover with `herdr agent send-keys
   <worker-name> enter` then `herdr agent wait --until <state>`.

## Drive and finish

- You drive the workers directly (native `--kind kimi` for a bounded Kimi K3
  worker — reads `KIMI_API_KEY` or Keychain service `jung-os-kimi-code`, fails
  closed without a credential).
- Completion authority is herdr itself: bare `herdr agent wait <name>` settles
  on `idle|done|blocked`, then `herdr agent read <name> --source visible` to
  see what actually happened. Agents never write status/result files (gate
  deleted 2026-07-24, `SPEC.md` §3).
- Keep the workspace through human verification. Then check for stranded work
  (`git status --porcelain`, `git worktree list`) and close the exact
  workspace id with `herdr workspace close`.
- Two tiers only: orchestrator → workers. Workers never spawn agents; no lead
  panes, no recursive teams.
- Native Claude Code agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) are
  NOT enabled: their split-pane mode needs tmux or iTerm2 and does not work in
  Ghostty, so teammates would be invisible. herdr panes stay the substrate.

## Safety

Label and create panes without focus. Do not write to panes you do not own.
Preserve project safety rules and human gates. A failed provider launch stops
the flow; never silently substitute another provider.

Custom JungOS skill; herdr-native since the v1→v2 cutover, 2026-07-31. Every
file an agent reads at runtime lives in this directory; the dated decision
record stays at `01-HARNESS/agent-teams/SPEC.md` (moved 2026-08-01).
