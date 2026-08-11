---
name: ui-sources
description: Jung's curated map of UI component sources — where to get components, blocks, effects, and AI-app UI for the Next.js/React/Tailwind/shadcn stack. Use when sourcing any UI piece beyond hand-writing it — a hero, animated background, chat/agent UI, glowing border, loading state, marketing block — or when deciding which registry, npm package, or copy-paste site to pull from. Also holds the official distilled UI reference specs (clean-UI cheatsheets).
---

# UI Sources

Curated sourcing map for frontend work. The stack is pinned: **Next.js + React + Tailwind + shadcn/ui**. Everything below is vetted against that stack.

## Routing order — always in this sequence

1. **Already installed?** Check `package.json` and existing components first. Reuse beats any install.
2. **`Skill(skill=pick-ui-library)` first** — Emil Kowalski's curated library list (base-ui, cmdk, Sonner, motion, NumberFlow, recharts, zustand, clsx/cva…). It owns *library-shaped* needs: primitives, animation engines, state, styling utilities, charts. If it has an answer, take it.
3. **This skill's source map** — for what pick-ui-library doesn't cover: pre-built blocks, showpiece effects, AI-app surfaces, marketing components.
4. **Not covered anywhere** → say so explicitly, recommend from general knowledge, flag that you left the curated set.

## Source map

### AI-app surfaces (chat, agents, reasoning, citations)

| Source | What | Install |
|---|---|---|
| **AI Elements** (Vercel) — elements.ai-sdk.dev | DEFAULT for AI UI. ~47 shadcn-convention components: Message, Conversation, Prompt Input, Reasoning, Chain of Thought, Sources, Inline Citation, Model Selector, Tool, Code Block, Terminal, File Tree, Web Preview, workflow canvas. Deep AI SDK (useChat/streaming) integration. | `npx ai-elements@latest` (shadcn registry) |
| **thinking-orbs** (Antalik) — orbs.jakubantalik.com | 9 animated "thinking" states for AI loading (working, searching, composing…). Canvas-based, SSR-safe, zero deps. Use instead of a spinner in agent UIs. | `npm install thinking-orbs` |
| **AIcss** — aicss.dev | 14 one-off copy-paste agent-UI blocks (thinking state, file diff, streaming text, comparison table). Grab a single block; anything systematic → AI Elements. | copy-paste |

Never hand-build message lists, reasoning accordions, or citation chips — AI Elements is shadcn, extended.

### Showpiece visuals and motion (marketing pages, heroes)

| Source | What | Install |
|---|---|---|
| **Canvas UI** — canvasui.dev | 33 GPU-accelerated canvas/WebGL effects (Liquid, Glass, Particle Reveal, Ripple, Clouds…). Respects `prefers-reduced-motion`, mounts only when visible. For hero moments, not structural UI. | `npx shadcn@latest add @canvas-ui/<name>-react` |
| **React Bits** — reactbits.dev | 110+ animated components: split/blur/decrypt text, Aurora/Hyperspeed backgrounds, interactive pieces. Tailwind + TS variants. Go-to for flashy marketing motion over a shadcn base. | `npx shadcn@latest add "https://reactbits.dev/r/<component>"` |
| **metal-fx** (Antalik) — metal.jakubantalik.com | Liquid-metal WebGL chrome effect for a premium CTA/button accent. One effect, client component. | `npm install metal-fx` |
| **border-beam** (Antalik) — beam.jakubantalik.com | Animated glowing border (traveling or breathing) around cards/buttons/inputs. Pure CSS animation, decorative layers `pointer-events: none`. | `npm install border-beam` |

### Micro-interactions

`Skill(skill=transitions-dev)` — 27 copy-ready transition recipes (card resize, modal, tabs slide, toast, checkbox, skeleton reveal…) already local. Reach for it when polishing state changes on existing UI, before writing bespoke animation.

### Block search (when a specific pre-built section is needed)

| Source | What | Caveat |
|---|---|---|
| **21st.dev** | 12k+ community components/blocks/templates (heroes, pricing, sign-in; mirrors Aceternity + Magic UI). Search engine for "I need a fancy X". | Quality varies (community). **Free tier: 2 copies/day** — see quota rule below. |

### Constrained catalogs — flag before using

| Source | Constraint |
|---|---|
| **Originkit** — originkit.dev | ~50 animated components via MCP; needs free API key, **10 fetches/day**. Prefer React Bits / Canvas UI for the same ground. |
| **Native Bloom** — nativebloom.dev | React Native ONLY, browse/links-out catalog. Irrelevant to web work; discovery index on RN projects. |

## Rules

- **Interaction-complexity line stands:** anything with focus management, keyboard nav, or ARIA patterns comes from shadcn/base-ui via `pick-ui-library` — the sources above are decorative/compositional layers, never a substitute for accessible primitives.
- **Unattended-agent rule:** registry-native (`npx shadcn add`) and npm sources are safe for worker panes and autonomous runs. Quota-gated sources (21st free tier, Originkit) can stall an unattended agent on a cap — use them only in interactive sessions or flag to Jung.
- **No new UI dependency without justification** — the pick-ui-library gate applies to these sources too: state the task, the source chosen, and why in one line.
- Effects are client components (WebGL/canvas) — keep them out of server components and behind `prefers-reduced-motion` respect.

## Official UI reference specs

`reference/clean-ui-specs.md` — distilled concrete specs (type scales, gray hierarchies, radii, control heights) from captured cheatsheets. Consult at direction and implement time for Operate-mode surfaces (app UI, settings, dashboards).

Raw provenance (posts, full-res mockups) lives at `06-REFERENCE/clean-ui-cheatsheets-heyrico/` in the jung-os-2 monorepo — readable from any local session, NOT available on CI, cloud agents, or standalone project clones. The distilled file above is the portable copy; keep it self-sufficient.
