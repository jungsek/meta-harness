---
# This is an example rule — replace or delete it. Every `.md` in rules/
# compiles into one managed block in AGENTS.md, which codex, cursor, opencode,
# hermes, and `.agents` runtimes read natively; Claude Code reads it through a
# generated CLAUDE.md `@AGENTS.md` stub. Everything outside the block is yours.
#
# targets: ["*"]            # decides inclusion only — AGENTS.md is shared, every enabled runtime reads it
# description: One-line summary of the rule
# root: true                # identity rule — leads the AGENTS.md block
---

Prefer small, focused changes. When a task is ambiguous, state the
interpretation you chose before writing code.
