---
# targets: ["*"]            # decides inclusion only — AGENTS.md is shared, every enabled runtime reads it
# description: One-line summary of the rule
# root: true                # identity rule — leads the AGENTS.md block
---

Delete this file after reading. Every `.md` here becomes part of one managed
block in `AGENTS.md`, which codex, cursor, opencode, hermes, and `.agents`
runtimes read natively; Claude Code reads it through a generated `CLAUDE.md`
`@AGENTS.md` stub. Everything outside the block stays yours.
