---
name: meta-harness
description: Compile a single source-of-truth directory into native project config for Claude Code, Codex CLI, Cursor, OpenCode, Hermes Agent, and the .agents standard. Use when the user asks to sync, propagate, or regenerate agent/harness config, edit rules/agents/commands/hooks/MCP in one place, or check config drift.
---

# meta-harness

One-way config compiler. Source of truth lives in one directory (default
`.meta-harness/`, configurable via `sourceDir` in `meta-harness.jsonc`);
`generate` compiles it to native config for each enabled target.

## Commands

```
meta-harness init               # scaffold source dir + config
meta-harness generate           # compile all enabled targets
meta-harness generate --check   # drift gate: exit 1 if stale or hand-edited
meta-harness generate --force   # discard hand edits to generated outputs
meta-harness generate -t cursor --only rules,agents   # partial run (no pruning)
meta-harness status [--json]    # per-output: clean / EDITED / MISSING / link
meta-harness targets            # list supported targets
```

Not installed globally? Prefix with `npx @jungsek/meta-harness` (avoids adding
package.json/node_modules to the project).

## Operating rules for agents

1. **Edit the source, never the outputs.** `.claude/`, `.codex/`, `.cursor/`,
   `.opencode/`, `.agents/`, `.hermes/`, `.mcp.json`, `opencode.json` files it
   generates are outputs — change `.meta-harness/` (or the configured
   `sourceDir`) and run `generate`.
2. `generate` aborting with "hand-edited outputs" means someone changed an
   output directly. Diff it, port the change into the source, then
   `generate --force`.
3. Shared files (`.claude/settings.json`, `.codex/config.toml`,
   `opencode.json`, `.cursor/mcp.json`) may contain keys meta-harness does not
   own — leave those alone; they're preserved across generates.
4. Hook events are canonical PascalCase in Claude-shaped entries
   (`hooks/hooks.jsonc`). A warning that an event was skipped for a target is
   expected behavior, not an error.
5. Per-file `targets: ["..."]` frontmatter controls which targets receive a
   rule/agent/command. Agent files take per-target override blocks
   (`claude:`, `cursor:`, …).
6. MCP per-target overrides: same-named server replaces wholesale, `null`
   deletes it for that target.
7. Run `generate --check` in CI or before committing to catch drift.

## Source layout

rules/ agents/ commands/ workflows/ connections/mcp.jsonc env/env.jsonc
hooks/hooks.jsonc plugins/plugins.jsonc settings/{claude.settings.jsonc,
codex.config.toml} — see README.md for the full output matrix.
