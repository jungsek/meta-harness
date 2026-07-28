---
name: mh-sync
description: >-
  Run a meta-harness sync: reconcile native agent config (.claude/, .codex/,
  .mcp.json…) with the source dir and re-emit every target. Use when the user
  explicitly invokes mh-sync, or asks to sync their agent config, pull native
  edits back into source, or make one tool's setup match another right now.
  For diagnosis-first maintenance use mh-audit; for building a harness from
  scratch use the meta-harness skill.
---

# mh-sync

Entry point only — the CLI does the work, the plan is the confirmation.

1. `meta-harness sync --dry-run` — show the user the plan verbatim
   (`← import / → generate / = clean`). Exit 1 = conflicts, not failure.
2. No changes pending → say so, done. Changes pending → confirm, then
   `meta-harness sync`. Conflicts → show both sides of each, let the user
   pick a side, rerun with `--prefer native|source`.
3. Relay every `warn:` line (trust gates especially) in user terms.

Interpretation rules and the deeper maintenance flow live in the sibling
skill: `../meta-harness/references/audit.md` (installed together; read it
directly, never search for it).
