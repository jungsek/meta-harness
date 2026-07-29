---
name: mh-sync
description: >-
  The primary meta-harness entry point: import the coding-agent setup this repo
  already has (.claude/, .codex/, .mcp.json…) into one source of truth and emit
  it to every other agent — both directions, drift folded back. Use when the
  user invokes mh-sync, or asks to get their Claude Code setup into Codex (or
  the reverse), sync their agent config, pull native edits back into source, or
  make one tool's setup match another right now. For diagnosis-first
  maintenance use mh-audit; to build a harness from nothing use the
  meta-harness skill.
---

# mh-sync

Entry point only — the CLI does the work, the plan is the confirmation. This
is the front door: sync imports what exists and reconciles both ways, so reach
for it before generate.

1. `meta-harness sync --dry-run` — show the user the plan verbatim
   (`← import / → generate / = clean`). Exit 1 = conflicts, not failure.
2. No changes pending → say so, done. Changes pending → confirm, then
   `meta-harness sync`. Conflicts → show both sides of each, let the user
   pick a side, rerun with `--prefer native|source`.
3. Relay every `warn:` line (trust gates especially) in user terms.

Interpretation rules and the deeper maintenance flow live in the sibling
skill: `../meta-harness/references/audit.md` (installed together; read it
directly, never search for it).
