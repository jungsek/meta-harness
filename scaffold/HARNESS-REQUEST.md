# Harness request

**Input, not a record.** Describe the harness you want in plain language, then
ask a coding agent to *"build my harness"*. It reads this, writes the category
files next to it, and runs `meta-harness generate`.

Once built, this file has done its job — the source files are the truth, and
`meta-harness show` prints what the harness actually contains. Delete it, or
keep it as a scratchpad for the next round of changes. It is never compiled,
and nothing reads it but you and your agent.

You don't need this file at all if you'd rather just tell the agent what you
want, or have it interview you.

Replace everything below.

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
