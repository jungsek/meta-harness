---
name: mh-audit
description: >-
  Full meta-harness maintenance audit: drift diagnosis, cross-tool asymmetry
  ("claude has X, codex doesn't"), conflict surfacing, and a guided fix
  (apply / selective / record-as-deliberate), plus a quality pass over the
  harness content. Use when the user explicitly invokes mh-audit, asks to
  audit their harness, or wants drift explained and resolved rather than
  just applied.
---

# mh-audit

Entry point only. The entire flow — dry-run JSON interpretation table, the
hard rule against reporting "in sync" while imports or conflicts are
non-empty, the three fix paths, and the quality checklists — lives in the
sibling skill's reference:

`../meta-harness/references/audit.md`

Read that file directly (installed together; never search the filesystem for
it) and follow it end to end. Diagnosis is read-only; never run a mutating
`meta-harness sync` without showing the `--dry-run` plan first.
