# Harness spec

Describe the harness you want in plain language. This file is **never
compiled** — it's the human-readable intent behind the files next to it.

Hand it to an agent ("build my harness") and it will write the category files
below and run `meta-harness generate`. Or ignore it entirely and edit those
files yourself.

Replace everything below with your own.

---

Targets: claude, codex.

Rules the agents must follow:
- `.meta-harness/` is the only source of truth; never edit generated config.
- Conventional commits, branch per change, never force-push shared branches.
- Stop for human review before touching auth, payments, migrations, or CI.

Subagents I want:
- **planner** — breaks work into verifiable steps, writes no code.
- **reviewer** — reviews diffs, one line per finding, no praise.

Connections: wire the deepwiki MCP server.

Hooks: log a timestamp on every session start.

Settings: Claude should deny reading `.env`.
