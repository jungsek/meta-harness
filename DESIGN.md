# Design

Visual system for the meta-harness dashboard (`dashboard/`). Strategy,
audience, and principles live in `dashboard/PRODUCT.md`; this file is how it
looks and moves. Every color value here is produced and gated by
`node dashboard/scripts/validate-palette.mjs` — **38/38 checks passing**. Do
not hand-edit a token without re-running it.

## Theme

**Light, pure white, one neutral family with a whisper of the brand hue.**

The scene that forces it: a developer at their desk in normal daylight, this
window beside an editor and a terminal, comparing a 40-row output against a
manifest — the same physical posture as reading a pull-request diff. Diff
reading is the whole job here, and diff reading wants maximum legibility on a
neutral ground, which is why GitHub, Linear-light, and Stripe all land on
near-white for it.

The reflex we deliberately refused: *developer CLI tool → dark terminal-native
theme*. That is the first-order category guess, and the second-order one
("dev tool that isn't dark → warm cream editorial") is the AI attractor named
in the design stack. We took neither. The surface is literal `#ffffff`; all
brand feeling is carried by the ink-violet primary, the type, and the status
vocabulary — never by tinting the paper.

Dark mode: **not in v1**, and that is a decision, not an omission. Shipping one
half-tuned theme is worse than one correct theme. The tokens are already
OKLCH custom properties on `:root`, so a `[data-theme=dark]` block is a
contained follow-up; the palette validator would need a second surface pass
before it ships.

## Color

Strategy: **Restrained** — tinted neutrals plus one accent, which is the
product-register floor. The color that does real work here is the *status*
vocabulary, not the brand.

### Core tokens

| Token | OKLCH | Hex | Role |
|---|---|---|---|
| `--bg` | `oklch(1 0 0)` | `#ffffff` | Page. Literally white — no hidden warmth. |
| `--surface` | `oklch(0.976 0.006 278)` | `#f6f7fb` | Second neutral layer: side rail, top bar, panel wells. |
| `--raised` | `oklch(0.952 0.008 278)` | `#eeeff5` | Nested wells, table header, hovered row, pill grounds. |
| `--line` | `oklch(0.9 0.008 278)` | `#dcdee3` | Hairlines, table rules, dividers. |
| `--ink` | `oklch(0.19 0.016 278)` | `#12131b` | Body and headings. 18.49:1 on `--bg`. |
| `--muted` | `oklch(0.48 0.014 278)` | `#5b5d66` | Secondary text, labels, counts. 6.55:1 on `--bg`. |
| `--primary` | `oklch(0.42 0.135 278)` | `#3f4094` | Deep ink-violet. Primary actions, current selection, active tab. |
| `--accent` | `oklch(0.66 0.128 205)` | `#00a8b7` | Teal. **Fills and the focus ring only** — never small text. |
| `--accent-strong` | `oklch(0.46 0.1 205)` | `#006772` | Accent-colored **text**: links, the "source" side of a diff. 5.73:1 on `--raised`. |

`--accent` at `L 0.66` measures 2.51:1 on `--raised` — it cannot carry text on
any of our grounds, which is why the text step is a separate token. This was
caught by measuring the rendered page, not by reading the CSS; both steps are
now gated by the validator.

The neutral ramp is tinted 0.006–0.016 chroma toward the brand's own 278° hue —
never toward generic warmth. `--primary` is deliberately dark and mid-chroma:
at `L 0.42` it reads as considered ink, not as the saturated AI-purple-on-white
attractor. White text on `--primary` and on `--accent` fills
(Helmholtz-Kohlrausch: any saturated mid-luminance fill takes white text).

### Status vocabulary

The dashboard's subject *is* state, so these six are the load-bearing colors.
They were selected by constrained search maximising the worst-case OKLab
distance across all pairs under protanopia, deuteranopia, and tritanopia,
subject to ≥4.5:1 on both `--bg` and `--raised` and a chroma floor of 0.11 so
each still reads as its own hue. Worst pair across all three dichromacies:
**ΔE 0.09**.

| State | Token | OKLCH | Hex | Glyph | Means |
|---|---|---|---|---|---|
| clean | `--status-clean` | `oklch(0.52 0.15 140)` | `#307c1b` | `●` | matches the manifest |
| pending | `--status-pending` | `oklch(0.54 0.19 260)` | `#2067da` | `→` | will be written on next generate |
| new | `--status-new` | `oklch(0.34 0.17 288)` | `#3a1688` | `+` | imported into the source |
| changed | `--status-changed` | `oklch(0.44 0.13 62)` | `#833c00` | `~` | EDITED natively, differs from source |
| conflict | `--status-conflict` | `oklch(0.36 0.13 22)` | `#72111b` | `!` | both sides changed — needs a decision |
| missing | `--status-missing` | `oklch(0.5 0.008 278)` | `#626368` | `?` | managed file is absent |

Rendering rule: a status pill is an **opaque ground of its own hue at 10%,
carrying the status color as text plus its glyph plus its word**. Never a
saturated fill, never a bare dot. Color is an accelerator; the glyph and the
word carry the meaning, so the surface survives greyscale, CVD, and a
screenshot in a bug report (WCAG 1.4.1).

The ground is **opaque, not an alpha**, and that is load-bearing: as an alpha
it composited over whatever row it happened to sit on — an expanded row carries
`bg-raised/60` — and measured 4.21:1 on the rendered page, failing AA in a way
no static scan catches. Opaque makes a pill's contrast identical everywhere.
The mix is `color-mix(in oklab, …)`, and the validator models oklab
interpolation specifically; modelling it as linear-sRGB over-predicts contrast
by ~0.3 and was itself a bug caught on the rendered page.

`link` from `status --json` renders as `clean` with a `↳` glyph and the word
"link" — it is a healthy state, not a lesser one.

## Typography

One family. Product UI does not need a display/body pair, and a display face in
a data table is a product ban.

- **UI / body:** `Inter var`, falling back to `system-ui, -apple-system,
  "Segoe UI", sans-serif`. Self-hosted, `font-display: swap`, no CDN.
- **Data / paths / diffs:** `ui-monospace, "SF Mono", "JetBrains Mono",
  Menlo, monospace`. Every file path, target name, command, and diff line is
  monospace. Prose never is.

Fixed rem scale at ratio ~1.15 — **no `clamp()` on product UI**; users read at
consistent DPI and a heading that shrinks inside a panel looks worse, not
better.

| Step | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 1.75rem / 1.2 | 600 | Page title only |
| `h2` | 1.25rem / 1.3 | 600 | Section headings |
| `h3` | 1.0rem / 1.4 | 600 | Panel and card titles |
| `body` | 0.9375rem / 1.55 | 400 | Prose, descriptions |
| `data` | 0.875rem / 1.5 | 400 mono | Table cells, paths |
| `label` | 0.8125rem / 1.4 | 500 | Field labels, column heads |
| `micro` | 0.75rem / 1.35 | 500 | Pills, counts, timestamps |

Letter-spacing: `-0.011em` on `display`, `-0.006em` on `h2`/`h3`, `0` below.
Never tighter than `-0.02em` — crushed tracking is the failure this project's
design stack explicitly hunts. **No uppercase tracked eyebrows** above
sections; section identity comes from the heading itself.

Prose caps at 72ch. Tables and diffs are exempt and may run full width.

## Layout

App shell, not a page:

```
┌────────────────────────────────────────────────────────────┐
│ top bar · root switcher · mode · live dot · re-scan        │
├──────────────┬─────────────────────────────────────────────┤
│  side rail   │  section view                               │
│  (sections + │                                             │
│   live       │                                             │
│   counts)    │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

- Rail `--surface`, 232px, collapses to a horizontal tab strip below 900px.
  Responsive behaviour is **structural** (collapse, reflow, stack), never
  fluid type.
- Content max-width 1280px, gutter 24px (16px below 640px).
- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32 · 48. Vary it for rhythm — dense
  inside a table row, generous between sections.
- Radii: 6px controls and pills, 10px panels, 0 on table rows.
- **Cards are not the default.** The source model, the output matrix, and the
  sync state are all *tables* — that is the right affordance for scanning and
  comparing. Cards appear only where an item genuinely has no peers to line up
  against. Nested cards never.
- Elevation: one hairline `--line` border plus, at most,
  `0 1px 2px oklch(0.19 0.016 278 / 0.06)`. No decorative shadow stacks.
- z-index scale is semantic: `--z-dropdown: 10`, `--z-sticky: 20`,
  `--z-backdrop: 30`, `--z-modal: 40`, `--z-toast: 50`, `--z-tooltip: 60`.
  Never `999`.

### Sections (rail order)

1. **Overview** — mode, enabled targets, the counts that matter, and the
   warnings that need action. First-run empty state teaches `meta-harness init`.
2. **Source** — the model: rules, agents, commands, connections, hooks, env,
   plugins, permissions, settings. Grouped table, row expands to the item's
   frontmatter, targets, and body.
3. **Targets** — the output matrix: enabled vs proposed vs unsupported, and
   what each target generates. Category × target grid.
4. **Sync** — per-item plan rows (imports / generates / clean) and per-file
   status. This is the "did that land?" screen.
5. **Drift & Conflicts** — the two-column diff. Both sides always shown.
6. **Reference** — `CATEGORIES` / `TARGETS` from `src/explain.js`, so the docs
   cannot drift from the code.

## Components

Sourced by **interaction complexity**, not by taste:

- **Registry (shadcn / Radix) — required**, because these are ARIA interaction
  patterns where hand-rolling ships defects axe cannot see: `tabs` (rail and
  in-panel), `dialog` (conflict detail), `tooltip` (glyph and gate
  explanations), `collapsible`/`accordion` (expandable rows),
  `scroll-area`, `popover` (root switcher).
- **Bespoke — correct**, minimal-code ladder wins: top bar, side rail, status
  pill, count chip, key-value list, table shell, diff pane, empty state,
  skeleton row.

Every interactive component ships **default · hover · focus-visible · active ·
disabled · loading · error**. Focus is a 2px `--accent` ring at 2px offset,
visible on every focusable element, never removed.

Loading is a **skeleton row** matching the real row's metrics — no spinner
parked in the middle of content. Empty states teach the next command
(`meta-harness init`, `meta-harness sync`) rather than saying "nothing here".

## Motion

- 150–200ms on state transitions, `cubic-bezier(0.22, 1, 0.36, 1)`
  (ease-out-quart). No bounce, no elastic, no page-load choreography — the user
  arrives mid-task.
- Motion conveys **state only**: row expand/collapse, pill state change on a
  re-scan, the live-poll dot, dialog enter/exit.
- Numbers that change on a poll cross-fade over 200ms rather than snapping, so
  a changed count is noticed without being animated at.
- Never animate layout properties; transform and opacity, plus `grid-template-
  rows: 0fr → 1fr` for the one disclosure case.
- `@media (prefers-reduced-motion: reduce)`: every transition becomes an
  instant state change or a plain opacity cross-fade. Not optional.
- Content is **visible by default**; nothing is gated behind a reveal
  transition, which would ship blank in a headless screenshot.

## Preservation rules

Things a later pass must not "improve":

1. `--bg` is literally `#ffffff`. Any warm tint reintroduces the cream
   attractor this design explicitly refused.
2. The six status values are computed output. Change one → re-run
   `validate-palette.mjs` → it must stay 38/38 and CVD ΔE ≥ 0.07.
3. Status is always **color + glyph + word**. Removing the word for compactness
   breaks WCAG 1.4.1 and the greyscale-screenshot case.
4. No `clamp()` typography. No uppercase tracked eyebrows. No numbered section
   markers. No gradient text, side-stripe borders, or glass.
5. Conflicts always show both sides. Never collapse to the winner.
6. Tables stay tables. Turning the sync view into a card grid is the failure
   mode this file exists to prevent.
