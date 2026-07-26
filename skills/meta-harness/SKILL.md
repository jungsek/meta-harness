---
name: meta-harness
description: Build, sync, and audit a coding-agent harness from one source directory — compiles to Claude Code, Codex CLI, Cursor, OpenCode, Hermes Agent, and the .agents standard. Use when the user asks to build/define/change their harness, sync or propagate agent config, edit rules/subagents/commands/hooks/MCP in one place, or check config drift.
---

# meta-harness

One source directory compiles to every runtime's native config. You author the
**source**; the CLI writes every **output**.

- `<sourceDir>/` (default `.meta-harness/`) — the source of truth. Yours to write.
- `.claude/ .codex/ .cursor/ .opencode/ .agents/ .hermes/ .mcp.json opencode.json` — outputs. **Never hand-write these.** `generate` is the only thing that may; it refuses to overwrite hand edits, so it will catch you.
- `HARNESS-REQUEST.md` in the source root — the user's plain-language *request*. Input only, never compiled, never a record of what exists.

Run `meta-harness --help` for the CLI surface, `meta-harness explain
<category>` for a file shape, and `meta-harness show` for what the harness
currently contains. Don't guess at any of them — ask the tool.

## "Build my harness"

Three ways users start. All converge on the same middle.

1. **Request file** — they wrote `HARNESS-REQUEST.md`; read it and build.
2. **Straight ask** — "build my harness, targets claude and codex, agents stop before payments." Build from what they said; ask only what you can't reasonably default.
3. **Interview** — they want guidance. Walk `references/interview.md`.

Then, always:

1. Run `meta-harness show` and read the existing source files. Never assume an empty project.
2. Write or update the category files. `meta-harness explain <category>` gives you the exact shape.
3. `meta-harness generate --dry-run --json` — read the plan back. Confirm it matches intent *before* writing.
4. `meta-harness generate`, then `meta-harness status`.
5. Audit against `references/review.md` and tell the user about real gaps. Don't invent work.
6. Report in their terms — "agents now stop before payments" — not as a list of file paths. `meta-harness show` is the shared view; point them at it rather than writing your own summary file.

**Never write a file that summarizes the harness.** It would duplicate state
and go stale the first time someone edits a rule. `show` derives the same view
at read time and cannot be wrong. If `HARNESS-REQUEST.md` was used, say it has
served its purpose and offer to delete it — never delete the user's prose
unasked.

## Boundaries

- Deterministic work belongs to the CLI. If a command can do it, run the command — never hand-produce its output.
- Outside the compiler, and yours to handle: `AGENTS.md`/`CLAUDE.md` prose (hand-authored, read natively by every runtime), skills (`npx skills add <pkg>`), and telling the user to trust Codex hooks once interactively (new `.codex/hooks.json` entries silently do not run until they do).
- `$CLAUDE_PROJECT_DIR` exists only in Claude hooks. Give other targets a per-target override with cwd-relative paths.
- Shared files (`.claude/settings.json`, `.codex/config.toml`, `opencode.json`, `.cursor/mcp.json`) may hold keys meta-harness doesn't own. Leave them; they're preserved and never count as drift.

## When generate refuses

"refusing to overwrite hand-edited outputs" means an output was edited
directly. Diff it, port the change into the source, then `generate --force`.
Never `--force` without reading the diff first — you'd discard the user's work.

## Reference

- `references/interview.md` — questions for the guided path
- `references/review.md` — gap and best-practice checklist
