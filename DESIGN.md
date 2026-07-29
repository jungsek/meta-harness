# Design — v2 "the sync map"

Visual system for the meta-harness dashboard (`dashboard/`). v2 supersedes the
2026-07-29 v1 after human review rejected it: six flat table sections dumped
information and hid the product's actual shape. v1's palette/type mechanics
passed every gate and still failed the only test that matters — one glance did
not explain the system.

## The one idea

**The dashboard renders the CLI's mental model, not a database of its rows.**
meta-harness is a hub-and-spoke system: one source of truth in the middle,
native agent configs on the sides, and `sync` moving items between them. So
the UI *is* that picture:

```
┌─ CLAUDE CODE ─────┐    ┌─ META-HARNESS ══════╗    ┌─ CODEX ───────────┐
│ native files      │ ⟵  ║ source of truth     ║ ⟶  │ native files      │
│ + per-file state  │    ║ 9 categories, items ║    │ + per-file state  │
└───────────────────┘    ╚═════════════════════╝    └───────────────────┘
        imports flow IN · generates flow OUT · conflicts sit IN the lane
```

Hierarchy is structural, not stylistic: the source column is wider, elevated,
double-ruled; targets are satellites. A user who has never seen the tool reads
the topology in one glance: middle is the truth, sides are copies, arrows are
work `sync` will do.

Everything actionable states its remedy as the real CLI command
(`meta-harness sync`, `--prefer source`, `codex` + `/hooks`) in a copyable
mono chip. The GUI never invents verbs the CLI doesn't have — it is the CLI,
drawn.

## Screen anatomy (one screen, no section nav)

1. **Prompt bar** (top): `❯ meta-harness · <root>` root switcher · mode chip
   (`reconcile`/`bootstrap`) · live dot · Re-scan.
2. **Verdict line**: ONE sentence, computed. "In sync — nothing to do." or
   "2 imports, 7 files to write, 1 conflict — run `meta-harness sync`." The
   sentence is the whole point of the product; it renders `display`-size.
3. **The map** (the body): three columns as above.
   - Target column: TUI-framed panel, target name in the frame border, its
     real generated files grouped by category, each with a state glyph. A
     proposed-but-disabled target (cursor/opencode/hermes) renders as a dim
     ghost panel below with the `--targets` command to enable it.
   - Source column: category rows (`rules 3 · agents 2 · …`), each expandable
     to its items. Items carry which targets they reach (`*` or subset).
   - **Lanes**: the gutter between source and each target renders per-item
     flow arrows, colored by state: `⟵` import (blue, "target edited, folds
     back"), `⟶` generate (blue), `!` conflict (red, sits mid-lane, click
     opens the diff), dim `·` clean. Lane direction IS the information — no
     legend needed beyond the glyph key in the frame footer.
4. **Console strip** (bottom): trust gates, warnings, unsupported files —
   terminal-style lines, each with its command. Collapsed to a count chip
   when empty of actions.
5. **Detail drawer** (right overlay, Radix Dialog): click any item/file/arrow
   → frontmatter, body, or the two-column conflict diff (both sides always;
   `--prefer` commands under each side).
6. **Help popover** (`?`): the reference tables from `src/explain.js`.

Empty/bootstrap states teach: no source dir → the center column renders the
`meta-harness sync` bootstrap explainer inside the empty frame.

## Register + theme

Product register (tool UI), but the brief is explicit and personal:
**"the CLI but a GUI — a TUI but a GUI."** That licenses the terminal-native
lane v1 refused, and the scene forces dark this time: this window lives BESIDE
a terminal running the actual CLI; matching its ground makes the pair read as
one instrument. The counter-cliché guard is craft: no green-on-black cosplay,
no scanlines, no CRT glow. Think Ghostty/Warp marketing surfaces: a real
terminal palette treated with print-grade typography.

- `--bg` `oklch(0.155 0.014 278)` — near-black, ink-violet cast, hue 278
  continuity with v1's brand.
- `--panel` `oklch(0.19 0.016 278)` panels · `--raised` `oklch(0.23 0.018 278)`
  wells/hover · `--line` `oklch(0.34 0.02 278)` frames · `--line-strong`
  `oklch(0.46 0.02 278)` the source column's double rule.
- `--ink` `oklch(0.93 0.008 278)` body (≥12:1 on bg) · `--muted`
  `oklch(0.72 0.012 278)` secondary (≥4.5:1 on panel).
- `--accent` `oklch(0.78 0.11 205)` teal — prompt glyph `❯`, live dot, focus
  ring, links. On dark, one accent step can carry text AND fills; keep chroma
  ≤0.12 so it reads phosphor-calm, not neon.
- Status vocabulary (same six semantics as v1, re-tuned for dark ground,
  L 0.68–0.80, re-validated: ≥4.5:1 on `--bg` AND `--panel`, CVD pairwise
  ΔE ≥ 0.07 under all three dichromacies — `validate-palette.mjs` gates it):
  clean green `●` · pending blue `→` · new violet `+` · changed amber `~` ·
  conflict red `!` · missing gray `?`. Color + glyph + word, always.

## Typography

**Mono-forward.** Data, paths, commands, counts, target names, category
names, the verdict sentence: `"JetBrains Mono", ui-monospace, "SF Mono",
Menlo, monospace` — system-first: JetBrains Mono is picked up when installed,
the ui-monospace fallback is first-class, nothing is fetched.
Prose (descriptions, hints, drawer bodies) stays `Inter var, system-ui`.
The pairing axis is mono × humanist sans — real contrast, not two sans.

Fixed rem scale, ratio ~1.2 (no clamp):

| Step | Size / lh | Family · weight | Use |
|---|---|---|---|
| `verdict` | 1.375rem / 1.35 | mono 600 | The verdict sentence only |
| `frame` | 0.8125rem / 1 | mono 600 | Panel frame titles (in-border) |
| `body` | 0.9375rem / 1.55 | sans 400 | Prose, hints |
| `data` | 0.875rem / 1.5 | mono 400 | Items, paths, files |
| `label` | 0.8125rem / 1.4 | sans 500 | Column heads, field labels |
| `micro` | 0.75rem / 1.35 | mono 500 | Pills, counts, command chips |

Letter-spacing 0 on mono (never negative — mono is pre-spaced). `-0.011em`
max on the rare sans heading. No uppercase-tracked eyebrows; frame titles are
the TUI idiom and live IN the border, singular per panel — that is structure,
not an eyebrow.

## Structure & spacing

- Frames: 1px `--line` borders, 4px radii (sharp, terminal-adjacent; never 0
  — pure right angles render harsh at 1px on retina). Panel title sits on the
  border line (`background: --bg` behind the label text), the box-drawing
  gesture without literal `┌─` glyphs in the DOM.
- Source column: 1.35fr vs 1fr targets; `--line-strong` border + a 1px inner
  rule (the "double rule") + `--panel` fill vs targets' transparent fill.
  Elevation by structure, not shadow — shadows barely read on dark.
- Grid: `grid-template-columns: 1fr 56px 1.35fr 56px 1fr` desktop; the 56px
  gutters are the lanes. Below 1080px: columns stack vertically
  (claude / source / codex), lanes rotate to vertical arrows in a 40px row.
  Structural responsiveness, no fluid type.
- Spacing scale 4·8·12·16·24·32·48; dense inside file lists, generous around
  the verdict.
- z-scale semantic: dropdown 10 · sticky 20 · backdrop 30 · modal 40 ·
  toast 50 · tooltip 60.

## Components

Registry (Radix) for ARIA patterns: dialog (drawer, conflict diff), popover
(root switcher, help), tooltip (glyph meanings), collapsible (category
expand). Bespoke chrome: prompt bar, frames, lanes, arrows, status pill,
command chip (mono, click-to-copy, `copied` state), console line, skeleton
rows, empty states. Every interactive: default · hover · focus-visible
(2px `--accent` ring, 2px offset) · active · disabled · loading · error.

## Motion

State only, 150–200ms ease-out-quart. Lane arrows draw in once on
snapshot load (stroke-dashoffset, 250ms, staggered ≤40ms) — that single
entrance is the product explaining its own flow, then never repeats on poll.
Poll-changed counts cross-fade. Drawer slides 200ms. Reduced-motion: all of
it becomes instant/opacity. Content visible by default — nothing gated
behind a reveal.

## Preservation rules (v2)

1. The three-column topology is the product. Never flatten back into
   sectioned tables; tables live INSIDE panels and drawers.
2. The verdict is one computed sentence naming the real command. Never a
   stat-tile row (banned hero-metric template).
3. Conflicts always show both sides + both `--prefer` commands.
4. Status = color + glyph + word. Six values, CVD-gated by
   `validate-palette.mjs` (re-run after ANY status/ground change; must pass).
5. Every remedy is the real CLI string, copyable. No invented GUI verbs.
6. Mono is never tracked negative; prose is never mono.
7. No green-on-black cosplay, scanlines, glow, or CRT nostalgia. No
   gradient text, side-stripes, glass, eyebrows, numbered scaffolds.
8. Dark is the only theme in v2 (decision, not omission); tokens stay OKLCH
   custom properties so a light pass remains contained.
