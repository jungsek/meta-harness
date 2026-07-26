# HARNESS.md format

Lives in the source root (`<sourceDir>/HARNESS.md`). Never compiled. Written
by the user as rough intent, rewritten by you as an accurate record once the
source files exist.

One section per source category, in this order, so a reader can map any line
to the file that implements it. **Omit sections that are genuinely empty** —
an empty section is noise; a missing one is a signal you can act on later.

```markdown
# Harness

One-line statement of what this project's agents are for.

## Targets
claude, codex

## Rules
- **identity** — agents treat `.meta-harness/` as the only source of truth.
- **safety** — stop for human review before auth, payments, migrations, CI.
- **git** — conventional commits, branch per change, never force-push shared.

## Subagents
- **planner** — breaks work into verifiable steps, writes no code.
- **reviewer** — reviews diffs, one line per finding, no praise.

## Commands
- **/harness-check** — report whether every output is clean.

## Connections
- **deepwiki** (http) — documentation lookup. Disabled for codex.

## Hooks
- **SessionStart** — append a timestamp to `.sessions.log`.

## Environment
- `PROJECT_MODE=dev`

## Settings
- Claude denies reading `.env` and `rm -rf` invocations.
- Codex runs with `approval_policy = never`, `sandbox_mode = workspace-write`.

## Out of scope
Hand-managed, deliberately not compiled: `AGENTS.md`, skills (`npx skills
add`), anything in `~/`.
```

## Rules for writing it

- **Bold name, em dash, one line of intent.** The name matches the source file
  (`rules/safety.md` → `**safety**`). A reader should be able to jump from any
  bullet to the file.
- **Say what it does, not how it's encoded.** "Stop before payments," not
  "adds a deny entry to permissions."
- **Note per-target differences inline** — "Disabled for codex" — since that's
  invisible from the section heading alone.
- **Keep the user's own words** where they were clear. This is their document;
  you're tidying it, not rewriting their voice.
- **No file paths, no frontmatter, no JSON.** Anyone who wants that reads the
  source. This file exists so a human can understand the harness in a minute.
