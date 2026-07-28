---
# This is an example rule — replace or delete it. Every `.md` in rules/
# compiles into the fully generated AGENTS.md, which codex, cursor, opencode,
# hermes, and `.agents` runtimes read natively; Claude Code reads it through a
# generated CLAUDE.md `@AGENTS.md` stub. Never edit the outputs — project
# prose is just another rules file (root: true leads the file).
#
# targets: ["*"]            # decides inclusion only — AGENTS.md is shared, every enabled runtime reads it
# description: One-line summary of the rule
# root: true                # identity rule — leads the generated AGENTS.md
---

Prefer small, focused changes. When a task is ambiguous, state the
interpretation you chose before writing code.
