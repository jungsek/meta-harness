---
name: herdr-desktop-app
description: "Control or inspect an already-running local Herdr session from Codex Desktop or another trusted process that is outside Herdr. Use whenever the user asks the Desktop app to read, monitor, prompt, or control Claude, Codex, or ordinary terminal panes running in Herdr. This is the external-controller companion to the in-pane herdr skill; it does not require HERDR_ENV=1."
compatibility: "Requires a local Herdr CLI with socket API support and filesystem access to the same user's Herdr sockets."
---

# Herdr Desktop App

Use Herdr's local CLI and socket API as an external controller. The caller does
not need to run in a Herdr pane. `HERDR_ENV=1` identifies a Herdr-managed pane;
it is not authentication and is not required for external socket clients.

This skill exists because an external controller has no legitimate caller-pane
identity. Compensate by selecting the session deliberately and targeting every
operation by an explicit pane ID or a freshly verified unique agent name.

Do not set or spoof `HERDR_ENV`, `HERDR_PANE_ID`, `HERDR_TAB_ID`, or
`HERDR_WORKSPACE_ID`.

## Choose this skill or the in-pane skill

- Use this skill when Codex Desktop or another trusted local process is outside
  Herdr and the user wants access to an already-running Herdr session.
- Use the regular `herdr` skill when the caller is genuinely running inside a
  Herdr-managed pane with valid Herdr context variables.
- Use Codex task messaging only to communicate with a Codex task. It does not
  preserve the task's original Herdr process environment and is not the
  transport for pane control.

## Safety model

External control is safe when all three authorities are explicit:

1. **User authority** — the user's request authorizes the read or mutation.
2. **Session authority** — one running Herdr session is selected deliberately.
3. **Target authority** — the live pane ID or unique agent name is resolved in
   that selected session.

Never treat Herdr's currently focused pane as authority. Focus is mutable UI
state shared with the human and other clients.

Read-only discovery is allowed when needed to resolve the user's target.
Reading through the CLI does not mark an agent as seen. Focus and attach
operations do change shared UI or terminal ownership and are not discovery.

## Learn the installed CLI without attaching

The installed binary is the syntax authority:

```bash
herdr --version
herdr --help
herdr session
herdr api
herdr pane
herdr agent
```

Do not run bare `herdr`; it launches or attaches the full TUI.

## Select exactly one session

Start with the read-only session inventory:

```bash
herdr session list --json
```

Resolve the session as follows:

- If the user names a session, use that exact running session.
- If only one session is running and the user's wording clearly refers to it,
  select it and state its name.
- If several sessions are running and the requested target is ambiguous, show
  the concise candidates and ask the user to choose. Do not inspect every
  session's pane contents merely to guess.
- Treat the default session as the literal selection `default`. The CLI targets
  it by omitting `--session`; this is still an explicit decision, not an
  implicit focus choice.

For a named session, place the global selector before the command:

```bash
herdr --session <session-name> <command> ...
```

For the selected default session:

```bash
herdr <command> ...
```

`HERDR_SOCKET_PATH` is a low-level override. Prefer the named-session selector
or the deliberately selected default session. Use a socket override only when
the user supplied it or normal session resolution cannot reach the intended
server.

Do not create a new session while attempting to reach an existing one. A failed
connection is a blocker, not permission to launch or attach a replacement.

## Resolve the live target

Inspect only the selected session:

```bash
herdr [--session <name>] api snapshot
herdr [--session <name>] workspace list
herdr [--session <name>] pane list
herdr [--session <name>] agent list
```

The bracketed selector above means: include `--session <name>` for a named
session and omit it only for the deliberately selected default session. Do not
copy the brackets literally.

Use public IDs returned by Herdr:

- workspace: `w1`
- tab: `w1:t1`
- pane: `w1:p1`

Prefer a pane ID for control. A unique live agent name is acceptable after
`agent get` or `agent list` verifies that it resolves to the intended pane in
the selected session.

Do not use:

- `--current`
- `pane current`
- omitted pane targets
- directional focus as target discovery
- sidebar position or an ID predicted from examples

Before any write, refresh the exact target:

```bash
herdr [--session <name>] pane get <pane-id>
```

When targeting a recognized agent, also verify its current identity:

```bash
herdr [--session <name>] agent get <pane-id>
```

Confirm the returned pane still hosts the intended process or agent. An
ordinary terminal need not resolve through `agent get`. A pane may have exited,
changed occupants, or moved since discovery.

## Read and monitor panes

Read a rendered screen when the user wants to see the current UI:

```bash
herdr [--session <name>] pane read <pane-id> \
  --source visible --lines 80
```

Read recent unwrapped output for logs and agent transcripts:

```bash
herdr [--session <name>] pane read <pane-id> \
  --source recent-unwrapped --lines 120
```

When Herdr recognizes the pane's agent, the agent surface can resolve its
terminal and semantic state:

```bash
herdr [--session <name>] agent get <pane-id>
herdr [--session <name>] agent read <pane-id> \
  --source recent-unwrapped --lines 120
herdr [--session <name>] agent wait <pane-id> --timeout 120000
```

Use `visible` for interactive Claude or Codex screens. Use
`recent-unwrapped` for completed prose and command output. Preserve ANSI only
when styling is evidence.

Waiting is event-driven. A settled state can be `idle`, `done`, or `blocked`;
after any wake, read the agent before claiming success. `blocked` usually means
the agent needs a decision or approval. `unknown` is not completion.

## Prompt or control a running agent

Use the semantic agent surface for ordinary Claude or Codex work:

```bash
herdr [--session <name>] agent prompt <pane-id> \
  "Continue with the requested task." --wait --timeout 120000
```

The user's request can supply the prompt and authorize the send in one step.
Ask before sending when the target or intended message is ambiguous.

After prompting:

1. Wait for the first settled state.
2. Read the exact target.
3. Report `blocked`, failure, or success from the observed output rather than
   from the wait exit alone.

Use raw pane input only when the user asked to control a terminal rather than
prompt a recognized agent:

```bash
herdr [--session <name>] pane send-text <pane-id> "text without Enter"
herdr [--session <name>] pane send-keys <pane-id> enter
herdr [--session <name>] pane run <pane-id> "command submitted with Enter"
```

Avoid secrets in prompt or command arguments because command-line arguments may
be observable by other local processes or logs.

## Shared-state and destructive operations

Do not use these merely to inspect or communicate:

- `pane focus`, `agent focus`
- `agent attach`, `terminal attach`, `--takeover`
- workspace, tab, or pane creation
- pane move, split, resize, swap, zoom, rename, or close
- session attach, stop, or delete
- `server stop`

They change shared UI, terminal ownership, layout, or process lifetime. Use one
only when the user explicitly requests that class of change. Resolve the exact
session and exact target again immediately before executing it.

Closing a pane, tab, workspace, or session can terminate live processes.
Before such an action, show the resolved target and current occupant and obtain
specific confirmation unless the user's immediately preceding instruction
already names that exact target and destructive action.

Never broadcast input across multiple panes unless the user explicitly names
the set and requests a broadcast.

## Report the operation

For every Desktop-originated Herdr operation, keep the handoff auditable:

- selected session
- resolved pane ID and agent identity, if present
- read-only or mutating action performed
- observed result or blocker

Do not claim that Codex Desktop is running inside Herdr. Say that it connected
to the Herdr server as an external local controller.
