# V1-FOCUS — sync-first repositioning (0.21.0 target)

The offer: **One setup, every coding agent.** meta-harness imports the
coding-agent config you already have and keeps every other agent in sync
with it. V1 promise is exactly: **Claude Code ⇄ Codex, both directions,
whole setup, one source of truth.** `sync` is the front door; `init` /
`generate` take the back seat (power-user / from-scratch paths).

Pitch order (README, help text, epilogues — everywhere):
1. Sunk cost: months teaching Claude Code how you work; a better model ships
   in someone else's CLI; re-teaching by hand loses it.
2. One command: `npx @jungsek/meta-harness sync` → your setup, in the other
   agent. Works both directions. Keep editing whichever tool you live in;
   sync reconciles. Nothing silently lost.
3. Why now: every lab ships its own agent, the frontier flips quarterly.
   The harness is the durable asset; the agent is the commodity.
4. Mental model (secondary): a harness above your harnesses — dotfiles for
   coding agents.

## Product changes

1. **Default targets = `["claude", "codex"]` everywhere.** Machine/repo
   detection may PROPOSE others but never auto-enables them: a cursor/
   opencode/hermes signal becomes one dim FYI line ("also detected: hermes —
   add with --targets or meta-harness.jsonc"), not an emitted tree. Existing
   configs with explicit targets stay honored. Emitters stay in the code,
   undocumented in README (one "other targets (experimental, one-way)"
   footnote max).
2. **Non-agent files in managed dirs = skip + note, never fatal.** A
   `.claude/agents/README.md` (no frontmatter/description → not an agent
   definition) must not block sync. Report as `- skipped (not an agent
   definition): .claude/agents/README.md — left in place`. Same principle
   for any managed dir. True unresolvable data-loss items stay fatal.
3. **CLI UX around the first five minutes.** The cold-start flow IS the
   product demo. Walk every flow below as a fresh user and make each step's
   output earn its place: what do I see, what do I do next, what went wrong.
   ASCII stays tasteful (existing dim/bold palette, aligned columns, no
   banners beyond the existing bootstrap headline).
4. **README + `package.json` description rewritten** to the pitch above.
   npm description: "One setup, every coding agent — import your Claude Code
   config into Codex (and back) and keep them in sync from one source of
   truth."
5. **Skills copy aligned**: `mh-sync` described as the primary entry;
   `meta-harness` brain description leads with sync/import, building from
   scratch second. No content rework beyond descriptions + first lines.

## User flows to design against (walk each, fix what grates)

- **F1 Claude user tries Codex (THE flow):** lived-in `.claude/` repo, no
  meta-harness. `npx @jungsek/meta-harness sync` → plan → apply → "open
  codex, accept trust, /hooks accept" next-steps line. Zero questions asked.
- **F2 Codex user tries Claude:** mirror of F1.
- **F3 The loop:** user keeps editing `.claude/` by hand for weeks; runs
  `/mh-sync` (or CLI) occasionally. Drift folds back; conflict path shows
  both sides and `--prefer`, never a dead end.
- **F4 Fresh repo, nothing yet:** `sync` on empty repo must say something
  helpful (nothing to import → point at `init` / the skill), not emit an
  empty plan.
- **F5 Something's off:** `mh-status` / `mh-audit` diagnosis; `generate`
  refusal message routes to sync, not `--force`.
- **F6 Leaving:** `uninstall` leaves no trace, says what it removed.

Each flow gets a scripted or live walkthrough in verification; the fresh-eyes
UX review judges the OUTPUT TEXT of every step, not just exit codes.

## Explicitly out (roadmap, do not build)

Gemini CLI + other targets; plugin decomposition (Claude→all AND Codex→all —
bidirectional, recorded here so the roadmap wording survives); any team/org
features. Harness-templates idea is DEAD (rejected 2026-07-29).
