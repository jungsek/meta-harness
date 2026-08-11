# Clean UI Specs — distilled reference

Concrete numbers for clean product UI, distilled from rico's (@_heyrico)
cheatsheet posts (captured 2026-08-11; raw bundle:
`06-REFERENCE/clean-ui-cheatsheets-heyrico/`). Two spec sets — pick per
surface, don't mix within one surface.

## Shared doctrine (both sets)

- Tiny type scale: 4 sizes max per surface.
- Gray-only text hierarchy, one accent color.
- Soft-gray fills for active/selected states, generous whitespace.
- Pill or rounded geometry; ONE dark pill CTA per surface.
- "Simple systems make polished products." / "Strong states make settings easier to scan."

## Set A — desktop web app (chat/agent product chrome)

| Token | Spec |
|---|---|
| Font | SF Pro, Regular + Medium only, -0.15px letter spacing |
| Type scale | 12 / 13 / 14 / 24px |
| Text hierarchy | #292929 primary → #5D5D5D secondary → #9E9E9E tertiary |
| Icons | 14px navigation · 20px cards |
| Radii | 8px navigation · 16px cards · pill CTAs |

Applied in mockups as: browser-chrome frame, tabbed top nav, grouped left
sidebar (soft-gray active row, red "New" pill badge), centered pane with dark
pill CTA and a three-row benefits card.

## Set B — settings / data surfaces

| Token | Spec |
|---|---|
| Font | Inter |
| Titles | 16/20px Medium |
| Labels | 13/16px Medium |
| Body | 14px Regular |
| Buttons | 32px height, 10px radius |
| Rows | 40px data rows · 44px store/entity rows |
| Badge | 20px height, 6px radius, #CAFACE fill, #15B042 text |
| Switch | 24×14px, 10px thumb, #0077E6 track |
| Text | #333333 default · #777777 subtle |

Applied in mockups as: app sidebar with ⌘K quick actions, integration detail
page — breadcrumb, green "Connected" badge, data rows with underlined counts,
expandable permission rows with green check states.

## How to use

- Operate-mode surfaces (app UI, dashboards, settings): start from these
  numbers, adjust to the project's DESIGN.md tokens — DESIGN.md wins on
  conflict; these are defaults for greenfield.
- Persuade-mode surfaces (landing/marketing): doctrine section applies
  (restraint, one CTA), the pixel specs don't.
- Font substitution: SF Pro is Apple-system only — on web use
  `-apple-system` stack or Inter with equivalent tracking.
