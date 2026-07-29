# Product

## Register

product

## Platform

web

## Users

Developers who run more than one coding agent (Claude Code and Codex today;
Cursor / OpenCode / Hermes tomorrow) on the same repo, and who have adopted
meta-harness so that one `.meta-harness/` source directory drives every
agent's native config.

Their context when they open this surface is almost always one of three
moments, and all three are *inspection*, not authoring:

1. **"Did that land?"** — they just ran `sync` or `generate` and want to see,
   at a glance, which target files are now managed, clean, or drifted.
2. **"Why is my agent not doing the thing?"** — a hook or permission is
   generated but inert because a trust gate was never accepted; a rule is in
   the source but the target does not support it.
3. **"What is even in here?"** — onboarding a repo they did not set up, or
   handing it to a teammate, and needing the whole configuration legible in
   one place instead of across eight file formats.

They read this beside an editor and a terminal, in normal working light. They
are fluent in `git status`, `git diff`, and code review UIs. The job to be
done is **read the true state fast and trust it** — the dashboard never
becomes the place they *edit* config; the source directory stays the source.

## Product Purpose

meta-harness's promise is "one setup, every coding agent". The CLI proves that
promise one command at a time; nothing shows the *whole* system at once. This
dashboard is that view: source model, target matrix, sync state, and drift,
live, in one surface.

Success is a user answering "is my harness correct right now, and if not,
what exactly is wrong and where?" in under ten seconds, without running a
command — and being able to hand the same URL to a teammate as the
explanation of how this repo's agents are configured.

Explicit non-goal: this is not a config editor. It reads, explains, and points
at the command to run. Writes stay in the CLI, where they are transactional
and reviewable.

## Brand Personality

**Precise · candid · unhurried.**

The voice of a good code-review UI. It states what is true, shows both sides
of a disagreement rather than picking one, and never congratulates itself. No
exclamation marks, no "All good!" — a clean harness simply looks calm. When
something is wrong, the interface is specific about *which* file, *which*
target, and *which* command fixes it.

Density is respected, not feared: these users read tables for a living. But
density is earned by hierarchy, never by cramming.

## Anti-references

- **The SaaS status dashboard.** Big gradient hero metric, three KPI cards,
  a sparkline, "98% healthy". This surface has no vanity numbers.
- **Green-tick theatre.** Large celebratory success states that make a clean
  harness feel like an achievement and a dirty one feel like a failure. Drift
  is normal and expected; the UI must be neutral about it.
- **Terminal cosplay.** Dark background, monospace everything, ASCII borders,
  fake prompt carets. The CLI already exists and is better at being a CLI.
  This is the surface you open *because* the terminal is not the right shape
  for comparing a 40-row output.
- **Config-editor ambition.** Inline forms, save buttons, optimistic writes.
  Wrong product.
- **Opaque badges.** A colored dot with no label, no tooltip, and no legend.
  Every state here is named in words as well as colored.

## Design Principles

1. **Practice what it preaches.** meta-harness is about one source of truth
   feeding many outputs; the dashboard's own information architecture is
   source-first — you always see where a thing came from before you see what
   it turned into.
2. **Show both sides of a conflict.** Never resolve on the user's behalf,
   never hide the losing side. A conflict is a diff, and a diff has two
   columns.
3. **State is named, not just colored.** Color accelerates recognition; the
   word and the glyph carry the meaning. Works in greyscale, works with any
   color vision.
4. **Every problem carries its remedy.** A warning that does not name the
   command that clears it is an unfinished warning.
5. **Calm at rest, specific under load.** A clean harness should be quiet and
   almost boring. The interface only raises its voice for conflicts, drift,
   and inert trust gates.

## Accessibility & Inclusion

- **WCAG 2.2 AA** is the floor and is enforced by computation, not judgement:
  `dashboard/scripts/validate-palette.mjs` gates every text/surface pair and
  every status pair before shipping.
- **Color is never the sole channel** (1.4.1). Every status carries a word and
  a distinct glyph; the palette is additionally verified for protanopia,
  deuteranopia, and tritanopia separation in OKLab.
- **Full keyboard operation.** Tabs, disclosure rows, dialogs, and the filter
  controls are all reachable and operable without a pointer, with visible
  focus. ARIA interaction patterns come from the registry, not hand-rolled.
- **Reduced motion is respected** — every transition has a
  `prefers-reduced-motion: reduce` alternative.
- Live-updating regions announce politely; the poll must not spam a screen
  reader on every tick.
