# Guided harness interview

For users who want to be walked through it. Conversational, not a form — ask
in batches, accept "I don't know," and default anything they don't care about.
A harness that exists beats a harness that was fully specified.

Six questions. Stop early the moment you have enough to build something real.

## 1. Which tools?

"Which coding agents do you actually use here — Claude Code, Codex, Cursor,
OpenCode?"

Default `["claude", "codex"]`. Only add targets for tools they really run;
unused targets are files nobody reads.

## 2. What should agents never do?

The highest-value question — ask it early. Prompts for protected domains
(auth, payments, migrations, CI config, deletions), secrets, and git limits.
Becomes `rules/safety.md`, plus `permissions` deny entries in
`settings/claude.settings.jsonc` where a rule can be mechanically enforced.

A rule states intent; a permission enforces it. Do both when the thing matters.

## 3. What should an agent know on day one?

Project shape, stack, conventions, where things live, what "done" means.
Becomes `rules/`, one file per concept — not one giant rule. Split by what a
reader would look up separately.

## 4. Any specialists worth having?

"Is there a job you'd want a dedicated subagent for — planning, reviewing,
research?" Becomes `agents/`. Skip if nothing comes to mind; subagents nobody
invokes are dead weight.

## 5. Anything to automate on every session?

Logging, context injection, guards on dangerous tools. Becomes `hooks/`.
Warn them Codex requires a one-time interactive trust before its hooks run.

## 6. Any MCP servers or env vars?

Becomes `connections/mcp.jsonc` and `env/env.jsonc`. Fine to leave empty.

## After the interview

Build it, run `generate`, then write `HARNESS.md` per
`references/harness-format.md`. Show them what changed in their own words, and
name the one or two things you'd add next — don't dump the whole gap list.
