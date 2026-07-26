---
# targets: ["*"]            # or a subset: ["claude", "cursor"]
# description: Shown to targets that support rule descriptions (cursor .mdc)
# paths: ["**/*.ts"]        # claude rules `paths:` globs; cursor uses them as globs too
---

Delete this file after reading. Every `.md` here becomes a rule for each
enabled target: `.claude/rules/` (symlink), `.cursor/rules/*.mdc`,
`.opencode/memories/` (+ registered in opencode.json), `.agents/memories/`.
