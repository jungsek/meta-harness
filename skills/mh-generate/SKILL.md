---
name: mh-generate
description: >-
  Run a meta-harness generate: compile the source dir into every target's
  native config. Use when the user explicitly invokes mh-generate, or asks to
  regenerate/rebuild/recompile their agent config after editing source files.
  For pulling native edits back in, use mh-sync instead.
---

# mh-generate

Entry point only.

1. `meta-harness generate --dry-run --json` first if the user seems unsure
   what will change; otherwise `meta-harness generate` directly.
2. **Refusal handling:** "refusing to overwrite hand-edited outputs" means
   native files changed since last generate — do NOT reach for `--force`.
   Offer `mh-sync` (folds the edits back, nothing lost) and only use
   `generate --force` when the user explicitly wants the hand edits
   discarded.
3. Then `meta-harness status`; relay `warn:` lines (Codex trust gates) and
   report what was written in user terms.
