---
name: mh-status
description: >-
  Quick meta-harness health check: are the generated configs clean, drifted,
  or missing, and is anything pending a sync. Use when the user explicitly
  invokes mh-status or asks "is my harness clean / in sync / healthy" and
  wants a readout, not a fix.
---

# mh-status

Read-only. Two commands, one paragraph.

1. `meta-harness status` — per-file clean/EDITED/MISSING.
2. `meta-harness sync --dry-run --json` — pending imports, conflicts,
   unsupported items. Non-empty `imported` or `conflicts` = NOT in sync,
   even if `status` alone looks clean.
3. Summarize in plain terms: what's clean, what drifted and where, what a
   sync would do. Offer mh-sync / mh-audit as the follow-up; change nothing
   yourself.
