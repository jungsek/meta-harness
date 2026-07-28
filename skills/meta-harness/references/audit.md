# Audit / maintenance flow

Read-only diagnosis first, mutation only with the user's go-ahead. Never runs
`meta-harness sync` without `--dry-run` shown first — the plan report IS the
confirmation step.

## Flow

1. **`meta-harness sync --dry-run --json`.** This is the whole data feed —
   don't hand-diff `.claude/` against `.meta-harness/` yourself, the CLI
   already does the three-way classify (manifest = merge base). The payload's
   keys are exactly the §3 output names — no renaming, nothing else to parse:

   | JSON key | meaning | what the report must do |
   |---|---|---|
   | `imported` | native config not yet in source — added, changed, or deleted natively | report EACH item |
   | `conflicts` | same item changed on both sides since the last sync (some `fatal`: two natives disagree, `--prefer` can't pick) | report BOTH sides of each |
   | `unsupported` | can't be backward-translated (inventory-only target), or `fatal` (would be lost if imported) | flag it — say it will not be handled automatically |
   | `clean` | already in sync | no action |
   | `generated` | what applying would (re)write | preview only, not a finding |

   **Hard rule: never report "in sync" or "config in sync" while `imported`
   or `conflicts` is non-empty.** Either one non-empty means pending drift —
   say so, item by item, using the table above. Only when BOTH are empty is
   "in sync" a true statement; an all-empty dry-run is a valid, good report.
2. **Report**: what drifted, why it matters ("Codex has a hook Claude
   doesn't — one team member added it by hand"), and exactly what fixing it
   would change. No invented findings beyond what the JSON actually says.
3. **Offer three actions**, let the user pick:
   - **Apply** — run `meta-harness sync` (no `--dry-run`) to fold everything
     the plan showed. For conflicts, this needs `--prefer native|source`.
   - **Selective** — user names which items to fold; edit the named source
     file(s) yourself with the native value, then `meta-harness generate` (not
     `sync`, since you're hand-applying just that piece).
   - **Record a deliberate exception** — the asymmetry is intentional (e.g. a
     target-only debug hook). Note it in a `rules/` file or a comment near the
     relevant source entry so the next audit doesn't re-flag it as an
     oversight.
4. **Quality pass.** Once config is in sync, check it against this skill's
   own checklists: `references/review.md` (coverage + smells) and
   `references/agents-md.md` (prose discipline for anything the sync folded
   into `rules/`) — both live beside this file in the skill's references
   directory; read them directly. **Do not search the filesystem for them** —
   no `find`, no glob, no home-directory scan. If one is genuinely missing,
   say so and continue the audit without it. Report only genuine gaps.

## Notes

- `sync --dry-run` is pure read (SYNC-PLAN §1) — safe to run as often as
  asked, no need to warn the user before the dry-run itself.
- Bootstrap mode (no source dir yet) surfaces as a dry-run plan too — treat
  it the same way, just note the headline: this repo has no source dir, and
  applying builds one from every detected target's native config.
- Exit code 1 from a dry-run means conflicts, not failure — read the
  conflict list, don't retry the command.
