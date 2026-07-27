# Guided harness interview

For users who want to be walked through it. Conversational, not a form —
accept "I don't know," and default anything they don't care about. A harness
that exists beats a harness that was fully specified.

Two questions. Everything else comes from the repo scan.

## 0. Scan first — mandatory, before asking anything

Most interview answers are already in the repo. Read before you ask:

- **Tools in use** → existing `.claude/` `.codex/` `.cursor/` `.opencode/`
  config, lockfiles of agent CLIs, CI workflows that invoke them. That IS the
  targets list; don't ask which tools they use.
- **Day-one knowledge** → README, CONTRIBUTING, existing AGENTS.md/CLAUDE.md
  prose, package.json scripts, directory layout. Draft `rules/` from what's
  there; show, don't interrogate.
- **Automation candidates** → format/lint/test scripts worth a PostToolUse
  hook, `.env.example` names worth `env/`, MCP servers already configured
  anywhere.
- **Existing hand config** → anything `generate` would collide with. Plan the
  adoption path (`--force` after review), never silently claim files.

State what the scan concluded in two or three lines and let them correct it.
A correction is cheaper than six questions.

## 1. What should agents never do?

The one question the repo cannot answer — it's about intent, not code.
Prompts for protected domains (auth, payments, migrations, CI config,
deletions), secrets, git limits. Becomes `rules/safety.md`, plus
`permissions/permissions.jsonc` deny entries where a rule can be mechanically
enforced.

A rule states intent; a permission enforces it. Do both when the thing
matters.

## 2. Anything the scan missed or got wrong?

Show the plan derived from the scan (targets, draft rules, hooks, env) and
ask for one round of corrections. Specialists (`agents/`) belong here — offer
one only if a clear recurring job surfaced (review, planning, research);
subagents nobody invokes are dead weight.

## After the interview

Build it, run `generate`, then `meta-harness show` so they can see what they
now have. Describe what changed in their own words, and name the one or two
things you'd add next — don't dump the whole gap list. Don't write a summary
file; `show` is the summary. Warn once about the two trust gates: Codex needs
a one-time interactive trust for hooks/exec-policy; Claude asks for folder
trust on first open.
