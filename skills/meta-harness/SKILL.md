---
name: meta-harness
description: >-
  Build, change, and audit a project's coding-agent harness — the rules,
  subagents, slash commands, MCP servers, hooks, and permissions that configure
  Claude Code, Codex CLI, Cursor, OpenCode, and Hermes — from one
  source directory that compiles to all of them. Use this skill whenever
  someone wants to set up or change how agents behave in a repo — "build my
  harness", adding or editing rules/subagents/commands/hooks/MCP servers,
  making agents stop before risky operations, keeping .claude and .codex in
  sync, reviewing whether their agent config is any good, or fixing config
  drift — even if they never say "meta-harness" and even if they only name one
  tool ("add a Claude subagent", "set up Codex for this repo").
---

# meta-harness

meta-harness compiles one source directory into every coding agent's native
config. You write the source; the CLI writes every output.

- **`<sourceDir>/`** (default `.meta-harness/`, set by `sourceDir` in `meta-harness.jsonc`) — the source of truth. Yours to edit.
- **`.claude/ .codex/ .cursor/ .opencode/ .hermes/ .mcp.json opencode.json`** — compiled outputs. Editing these by hand is what the tool exists to prevent: `generate` refuses to overwrite hand edits, so a change made there blocks the next build instead of surviving it. Put the change in the source and it reaches every tool at once.
- **`HARNESS-INIT.md`** in the source root — the user's plain-language request. Input only, never compiled.

Three commands answer most questions, so ask the tool rather than guessing:
`meta-harness --help` (the CLI surface), `meta-harness explain <category>`
(the exact shape of a source file), `meta-harness show` (what this harness
currently contains).

Maintaining a harness that already exists — drift, "claude and codex are out
of sync", auditing config health, deciding what to fold back or reject —
follow `references/audit.md` (the sync dry-run is the data feed; never
mutate before showing its plan).

## Building or changing a harness

Users arrive three ways. All converge on the same middle.

1. **They wrote a request** — `HARNESS-INIT.md` exists *and they edited it*. `init` scaffolds that file with an example request below "Replace everything below." (targets claude+codex, planner/reviewer subagents, the deepwiki MCP server, a session-start timestamp hook). If that example is still what the file says, the user wrote nothing — building from it produces a harness nobody asked for. Treat it as case 3.
2. **They just asked** — "build my harness, claude and codex, agents stop before payments." Build from what they said, defaulting anything they clearly don't care about. A harness that exists beats one that was perfectly specified.
3. **They gave no intent** — offer three paths and let them pick: a guided interview (`references/interview.md`); the recommended baseline (`references/baseline.md`) merged with anything they have said; or they write the request themselves in `<sourceDir>/HARNESS-INIT.md` (replacing the example) and call you back to build from it.

Then, every time:

1. **Run `meta-harness show` and read the existing source files.** Projects are rarely empty, and overwriting a rule someone wrote is worse than adding nothing.
2. **Write or update the category files.** `meta-harness explain <category>` prints the file location, frontmatter keys, an example, and where it compiles to — check it rather than guessing at frontmatter, since a wrong key fails silently at a target you may not be testing.
3. **`meta-harness generate --dry-run --json`.** Read the plan back before committing to it. This is cheap and catches a misplaced file before it lands in six directories.
4. **`meta-harness generate`, then `meta-harness status`.**
5. **Audit against `references/review.md`** and mention what's genuinely missing. Report real gaps only — invented findings train the user to ignore you.
6. **Report in their terms.** "Agents now stop before touching payments, on both Claude and Codex" tells them something; a list of eighteen file paths does not. Point at `meta-harness show` for the full picture.

Resist writing a file that summarizes the harness, however tempting. It
duplicates state and goes stale the first time anyone edits a rule, whereas
`show` derives the same view at read time and cannot be wrong. If
`HARNESS-INIT.md` was used, say it has done its job and offer to delete it
— but leave the user's prose alone unless they agree.

## Worked example

**User:** "our agents keep running migrations without asking, make that stop"

A good response writes `rules/safety.md` (stating the boundary in prose, which
is what the agent actually reads) *and* a deny entry in
`permissions/permissions.jsonc` (which enforces it even when the agent skims
the rules), then runs `generate`. Rules persuade; permissions enforce. For
anything that genuinely matters, do both — a rule alone is a suggestion.

Permissions are declared once and compile to every runtime that can enforce
them: Claude's `permissions` block and Codex's Starlark exec policy. Don't
hand-write either dialect into `settings/`; declaring the same thing twice is
a hard error at generate time, by design.

Then: "Migrations now need your approval — Claude will refuse the command
outright, and both Claude and Codex have the rule in their instructions."

## Working across the boundary

Deterministic work belongs to the CLI. When a command produces something, run
it instead of hand-producing its output — hand-written output is exactly what
`generate` treats as drift.

Some things sit outside the compiler and are yours to handle directly:

- **`AGENTS.md` and `CLAUDE.md`** — fully generated from `rules/`. `AGENTS.md` is the single prose channel (every runtime reads it natively except Claude, which gets a generated `CLAUDE.md` stub importing `@AGENTS.md`). Never edit either output — project prose is just another rules file (e.g. `rules/project.md` with `root: true` so it leads the file). When writing any `rules/` file, follow `references/agents-md.md`: every line must earn its place, and bloat measurably hurts.
- **Skills** — `npx skills add <package>` owns skill directories and `skills-lock.json`.
- **Codex directory trust** — project hooks *and* exec policies (`.codex/rules/`) load only after the user opens `codex` once and accepts the trust prompt. Until then a `deny` permission silently does not stop anything, verified against codex 0.145. Tell them; you cannot do it for them.
- **Anything in `~/`** — global config is deliberately out of scope.

Two portability traps worth knowing: `$CLAUDE_PROJECT_DIR` exists only in
Claude hooks, so give other targets a per-target override with cwd-relative
paths; and shared files (`.claude/settings.json`, `.codex/config.toml`,
`opencode.json`, `.cursor/mcp.json`) may hold keys meta-harness does not own,
which are preserved and never count as drift — leave them alone.

## When generate refuses

"refusing to overwrite hand-edited outputs" means someone edited a compiled
file directly. Diff it first to see what they were trying to achieve, port
that into the source, then `generate --force`. Forcing without reading the
diff discards their work silently, which is the one failure this tool was
built to prevent.

## Reference

- `references/interview.md` — guided path: mandatory repo scan, then two questions
- `references/baseline.md` — recommended floor when the user gives no intent; merge, never copy
- `references/agents-md.md` — how to write AGENTS.md/CLAUDE.md prose and `rules/`: what earns a line, length discipline, phrasing, monorepo nesting, maintenance
- `references/audit.md` — maintenance flow: sync dry-run interpretation, drift report, apply/selective/exception
- `references/review.md` — gap and best-practice checklist for audits
