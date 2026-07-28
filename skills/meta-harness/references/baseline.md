# Recommended baseline

The floor for a harness when the user gives no intent, or picks "baseline"
over the interview. This is intent to merge, not files to copy: combine it
with anything the user *has* said (their words win every conflict) and with
any source files already present (add, never clobber). Then run the normal
build flow — `explain` for shapes, `--dry-run`, `generate`, `status`.

## Targets

Only what the repo and machine show: existing `.claude/` `.codex/` `.cursor/`
`.opencode/` config, agent CLIs actually installed, CI that invokes one.
Never add a target on spec — an unused target is dead output plus trust
chores the user never asked for.

## Rules

Three files, compiled into the generated `AGENTS.md`:

- `rules/source-of-truth.md` — the source directory is the only source of
  truth; never edit generated config; put changes in the source and rerun
  `meta-harness generate`.
- `rules/git-workflow.md` — conventional commits; branch per change; never
  force-push shared branches.
- `rules/safety.md` — stop for human review before touching auth, payments,
  database migrations, or CI config; never read or print `.env` values.

## Permissions

The deny entries that mechanically enforce the safety rule, in
`permissions/permissions.jsonc`:

- read of `.env` and `.env.*` — deny
- `git push --force` and `git push -f` — deny
- `rm -rf *` — deny

Rules persuade; permissions enforce. The baseline always ships both halves.

## Deliberately absent

Subagents, MCP servers, hooks, commands, env. These are per-project choices;
a default here would be dead weight — a hook nobody wanted, an MCP server
nobody uses, a subagent nobody invokes. Add them only when the user asks or
the repo scan shows a clear recurring need.
