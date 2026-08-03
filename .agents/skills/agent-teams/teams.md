# Teams — the roster

A team is **a lead agent, some worker agents, and a target project**. That is all
it is. There is no preset file, no `loadout.json`, no separate capability
manifest to keep in sync.

**`.claude/agents/*.md` is the single source of truth for every agent's
capability** — its skills, its workflow, its gates, its boundaries. A herdr
worker pane boots that exact definition with `--agent <name>`. The Codex port
lives at `.codex/agents/*.toml` and is generated, never hand-written (see
`01-HARNESS/claude-codex-port/AGENT-PORTING.md`).

Superseded 2026-07-31: `presets/development/` and `presets/design/` are deleted.
They duplicated the agent definitions and had drifted from them — contradicting
rulings on `taste-skill`, referencing a `README.md`, slash commands, personas,
and skills that do not exist in v2. Their surviving content (the git chain, the
P1/P2/P3 verify gates, the DESIGN.md authority, the component-sourcing line, the
human gates) was folded into `.claude/agents/development.md` and
`.claude/agents/frontend.md`, where the agent that must obey it actually reads it.

## The nine agents

| Agent | Class | Model | Owns |
|---|---|---|---|
| `development` | builder | sonnet | backend, db, integrations, API, migrations, perf |
| `frontend` | builder | sonnet | UI, components, pages, animation, design systems |
| `code-review` | judge | **opus** | correctness of diffs and PRs |
| `security` | judge | **opus** | vulnerabilities; may BLOCK on P0 |
| `web-qa` | judge | sonnet | rendered UI — WIG, WCAG 2.2, lighthouse |
| `shopify` | operator | sonnet | store management, theme/app dev, commerce data |
| `browser` | operator | sonnet | interactive authed browser sessions |
| `marketing` | operator | sonnet | CRO, SEO, copy, social, launches |
| `obsidian` | operator | sonnet | vault notes, bases, canvases |

No specialist fits → run at main-session level. Judges never review work built by
their own runtime instance.

**The `Model` column is the worker tier, and it lives in `.claude/agents/*.md`,
not in a spawn command.** It wins over the CLI default for a `--agent` pane, so
workers launch with no `--model` flag at all. Opus goes to the two judges whose
miss costs most — correctness and P0 security. The lead is the one role that
overrides (`--model opus`): N=1, owns decomposition. Escalate one hard worker
lane if needed, never a whole wave.

## Standing teams

Five are ratified. Everything else is improvised per the shape below.

A block is four lines — lead, workers, routing, gates. It states NO capability:
that lives in `.claude/agents/*.md` and nowhere else. This is what killed
`presets/` — a block that restates a loadout drifts from it. A block that names
a shape cannot.

### development

```
lead     development
workers  development ×N (partitioned by file/dir — single writer per path)
         code-review   (mandatory on non-trivial work)
         security      (mandatory when the diff touches auth, secrets, public
                        endpoints, payments, destructive writes, PII, deps,
                        infra, or data-at-scale)
routing  Codex-primary for backend coding and the adversarial review pass;
         Claude for Claude-only skills. Human instruction always wins.
gates    plan approval · migration apply · merge/deploy
```

### design

```
lead     frontend
workers  frontend ×N (partitioned by surface)
         web-qa        (mandatory pre-merge on every frontend PR)
         code-review   (adversarial pass)
routing  Claude-primary. Codex for the adversarial review pass.
gates    design direction (once, at init/shape) · merge/deploy
```

### content

```
lead     marketing
workers  marketing ×N (partitioned by asset — never two workers on one piece)
         browser       (competitor research, live-page teardowns, authed checks)
routing  Claude-primary — copy quality is the deliverable. Human instruction wins.
gates    EVERY outward send or publish, no exceptions (jung-os-2 confirm-first floor)
```

### commerce

```
lead     shopify
workers  shopify ×N (partitioned by surface: theme mechanics / data / app)
         frontend      (storefront look + feel — make it beautiful; PDP, PLP,
                        landing, theme UI. Owns design; shopify owns Liquid)
         web-qa        (mandatory on every storefront-visible change)
         security      (mandatory when the diff touches payments, tokens, or
                        customer PII)
routing  Claude-primary for frontend + theme; Codex for data and app work.
gates    live-store write · HARD DENY: bulk customer/order deletion
```

The `frontend`/`shopify` seam is the one to get right: `frontend` decides how the
storefront looks and behaves, `shopify` owns Liquid, sections, metafields, and
the Admin API. Same file touched by both = you partitioned it wrong.

### audit

```
lead     security
workers  code-review · web-qa   (judges only — this team writes no source)
routing  mix freely; a judge never reviews work its own runtime instance built
gates    none to cross — the output is a verdict. Fixes route to a builder team.
```

A mixed team is normal: a `frontend` lead with a `development` worker for the API
the UI needs is one team, not two.

## Improvised teams

Novel work does not need a new file. The orchestrator picks a lead agent, picks
worker agents, and states the gates in the kickoff prompt. If the same
improvised shape recurs three times, it earns a block in this file — not before.
Subtractive minimalism: a team earns its place by need.

A new *agent* (as opposed to a new team) is a different matter: it needs a new
`.claude/agents/<name>.md`, a re-run of the Codex port, and a row in the table
above.

## Spawning — the one-liner that matters

Workers are real herdr panes, and every pane boots with permissions bypassed
(the pane is the sandbox; Jung watches it):

```bash
# Claude worker running the `development` agent definition as its root persona
herdr agent start dev1 --kind claude --pane "$p1" -- \
  --agent development --dangerously-skip-permissions

# Codex worker
herdr agent start dev2 --kind codex --pane "$p2" -- \
  --dangerously-bypass-approvals-and-sandbox
```

`claude --agent <name>` loads `.claude/agents/<name>.md` as the session's root
agent — the pane *is* that agent, with its tools, its model, its preloaded
skills, and its full workflow. Codex has no `--agent` flag; a Codex worker
receives its persona through the kickoff prompt instead (see
`01-HARNESS/claude-codex-port/AGENT-PORTING.md` §4).

Full spawn procedure, layout, worktrees, and reporting: `team-leads.md`.
Dispatch flow and teardown: `orchestrator.md`.

## Targets

`projects.json` — slug, name, path, port. Team × target project is a matrix, not
a hierarchy: the development team can target any project today and another
tomorrow, and several teams may run in parallel with their own leads and their
own workspaces.
