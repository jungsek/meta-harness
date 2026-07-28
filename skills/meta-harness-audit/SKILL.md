---
name: meta-harness-audit
description: >-
  Maintain an existing meta-harness install — check for drift between native
  agent config and the source dir, surface unmanaged config one tool has that
  another doesn't, and fold or reject it. Use this whenever someone asks to
  audit their harness, wonders why "claude and codex are out of sync", asks
  what changed in their agent config, wants a maintenance/health check, or
  mentions drift, stale config, or hand-edited settings files. This is the
  maintenance half of the meta-harness pair — for building or changing a
  harness from scratch, use the sibling `meta-harness` skill instead.
---

# meta-harness-audit

Read-only diagnosis first, mutation only with the user's go-ahead. Never runs
`meta-harness sync` without `--dry-run` shown first — the plan report IS the
confirmation step.

## Flow

1. **`meta-harness sync --dry-run --json`.** This is the whole data feed —
   don't hand-diff `.claude/` against `.meta-harness/` yourself, the CLI
   already does the three-way classify (manifest = merge base).
2. **Interpret the plan in user terms**, not the JSON shape:
   - `imports` — native config that drifted or was added by hand and isn't
     in the source yet. This is the asymmetry story: something works in one
     tool, not the others, until it's folded in.
   - `conflicts` — same item edited on both sides since the last sync. Needs
     a human call; state both values plainly.
   - `unsupported` — found in a target meta-harness can't backward-translate
     yet (cursor/opencode/hermes). Report it, don't imply it'll be handled.
   - `clean` / `generates` — no action needed / what a sync would (re)write.
3. **Report**: what drifted, why it matters ("Codex has a hook Claude
   doesn't — one team member added it by hand"), and exactly what fixing it
   would change. No invented findings — an empty dry-run is a valid, good
   report.
4. **Offer three actions**, let the user pick:
   - **Apply** — run `meta-harness sync` (no `--dry-run`) to fold everything
     the plan showed. For conflicts, this needs `--prefer native|source`.
   - **Selective** — user names which items to fold; edit the named source
     file(s) yourself with the native value, then `meta-harness generate` (not
     `sync`, since you're hand-applying just that piece).
   - **Record a deliberate exception** — the asymmetry is intentional (e.g. a
     target-only debug hook). Note it in a `rules/` file or a comment near the
     relevant source entry so the next audit doesn't re-flag it as an
     oversight.
5. **Quality pass.** Once config is in sync, check it against the sibling
   skill's checklists — `../meta-harness/references/review.md` (coverage +
   smells) and `../meta-harness/references/agents-md.md` (prose discipline
   for anything the sync folded into `rules/`). Report only genuine gaps.

## Notes

- `sync --dry-run` is pure read (SYNC-PLAN §1) — safe to run as often as
  asked, no need to warn the user before the dry-run itself.
- Bootstrap mode (no source dir yet) surfaces as a dry-run plan too — treat
  it the same way, just note the headline: this repo has no source dir, and
  applying builds one from every detected target's native config.
- Exit code 1 from a dry-run means conflicts, not failure — read the
  conflict list, don't retry the command.
