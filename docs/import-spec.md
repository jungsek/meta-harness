# `meta-harness import` — spec (draft, 2026-07-27)

Status: **proposed, not implemented.** Written for review before code.

## The problem

Every adoption path today assumes an empty project. A repo that already has
`.claude/`, `.codex/`, `.cursor/` config has no way in — you hand-copy each
file into the source dir and hope you got the frontmatter right. This is what
blocks pointing meta-harness at jung-os v1, which is exactly the repo it was
built for.

`import` reverses the compiler: read native config, write source files.

## The acceptance test that defines correctness

**Import then generate must be a no-op.**

```
meta-harness import          # native config → source dir
meta-harness generate --check  # must exit 0
```

If `--check` reports anything stale, the import lost or altered information.
This is mechanically verifiable, so it becomes the test suite: for each target,
build a fixture project, import it, generate, assert clean. Anything that
cannot round-trip must be *reported*, never silently dropped.

This single criterion settles most design questions below.

## Command surface

```
meta-harness import [-t <targets>] [--only <categories>] [--dry-run] [--json]
```

Defaults to the targets in `meta-harness.jsonc`. `--dry-run` prints what would
be written without touching disk — the same contract `generate` already has.

## Refusing to clobber

Importing into a populated source dir is the dangerous case: it would overwrite
hand-written rules with reverse-engineered ones.

- **Source dir empty or absent** → import freely.
- **Source dir has content** → refuse, listing what exists, unless `--force`.
- Never merge silently. A half-imported source dir is worse than neither.

This mirrors the drift contract: the tool does not overwrite human work without
being told twice.

## What maps back, per category

| Category | Read from | Notes |
|---|---|---|
| rules | `.claude/rules/*.md` | direct copy; already the source format |
| | `.cursor/rules/*.mdc` | parse hand-rolled frontmatter, `globs:` → `globs` array |
| | `.agents/memories/`, `.opencode/memories/` | body only; no frontmatter to recover |
| agents | `.claude/agents/*.md` | direct; per-target keys stay under `claude:` |
| | `.codex/agents/*.toml` | `developer_instructions` → body, rest → frontmatter |
| commands | `.claude/commands/*.md`, `.cursor/commands/`, `.opencode/commands/` | direct |
| workflows | `.claude/workflows/*.md` | direct |
| connections | `.mcp.json`, `.codex/config.toml [mcp_servers]` | Codex→canonical is the inverse field map (`enabled_tools`→`enabledTools`, `enabled = false`→`disabled`) |
| hooks | `.claude/settings.json` `hooks`, `.codex/hooks.json` | already canonical PascalCase |
| env | `.claude/settings.json` `env` | |
| plugins | `.claude/settings.json` `enabledPlugins` | |
| permissions | `.claude/settings.json` `permissions` | unwrap `Bash(git status)` → `bash: {"git status": "allow"}` |
| settings | whatever keys remain | the residue after every category above claims its keys |

**Settings is the catch-all and must run last.** Any key not claimed by a
category is copied verbatim into `settings/claude.settings.jsonc` or
`settings/codex.config.toml`. This is what makes the round-trip hold for
config we don't model.

## Deliberately not imported

- **Symlinked outputs** — `.claude/rules/foo.md` as a symlink already points
  into a source dir. Follow it and you would import a file into itself.
  Detect and skip.
- **The `AGENTS.md` managed block** — generated content. Import the prose
  *outside* the markers as nothing (it stays where it is); import the block as
  nothing (rules come from the rules dirs).
- **`.codex/rules/*.rules`** — Starlark. Parsing arbitrary Starlark back into
  permissions is lossy and pointless: if we generated it, the same information
  is in `.claude/settings.json` `permissions`; if a human wrote it, guessing
  their intent is worse than leaving it. Skip, and report it as unimported so
  they know.
- **Generated plugin code** (`.opencode/plugins/meta-harness-hooks.js`) —
  reconstructed from hooks, never parsed back.

## Conflicts across targets

The same rule may exist in `.claude/rules/git.md` *and* `.cursor/rules/git.mdc`
with different wording. Three cases:

1. **Byte-identical after normalisation** → one source file, `targets: ["*"]`.
2. **Present in some targets only** → one source file with an explicit
   `targets: ["claude"]` list.
3. **Genuinely different content, same name** → cannot be merged. Write both
   as `git.md` and `git.cursor.md`, warn, and let the human reconcile. Picking
   a winner silently would lose someone's edit.

## Reporting

Import must end by naming what it could not bring over — skipped Starlark,
conflicting duplicates, config keys it did not recognise. An import that
claims success while silently dropping a hook is the worst possible outcome,
since the user will believe they are protected when they are not.

Suggested output shape, matching `generate`:

```
  imported   rules/git.md            (from .claude/rules/git.md)
  imported   agents/planner.md       (merged: .claude, .codex)
  conflict   rules/style.md          (.cursor version differs — wrote rules/style.cursor.md)
  skipped    .codex/rules/policy.rules  (Starlark; re-declare in permissions/)
✔ 14 imported · 1 conflict · 1 skipped
  next: meta-harness generate --check   (should be clean)
```

## Open questions for review

1. **Should import write `meta-harness.jsonc`?** It can infer targets from
   which native dirs exist. Convenient, but it means running `import` in a
   repo with `.cursor/` silently enables cursor. Proposal: infer, print what
   it inferred, and let `--targets` override.
2. **Naming collisions with scaffold examples.** If the user ran `init` first,
   `rules/example-rule.md` exists and import refuses. Proposal: treat files
   byte-identical to the scaffold as absent, since they're placeholders.
3. **Is `--force` merge or replace?** Proposal: replace per-file (import wins
   for files it produces, leaves everything else), never a three-way merge.
4. **jung-os v1 specifically** has `.claude/rules/` symlinked into `.harness/`
   already. Import there is close to a no-op by design — worth confirming that
   is the expected outcome rather than a bug.

## Implementation sketch

Mirror of the emit registry: each target module gains an optional
`ingest(root)` returning partial model fragments. `src/import.js` merges them,
resolves conflicts per the rules above, and writes source files. Targets
without an `ingest` are simply not importable, which keeps the change additive
— no existing target has to be touched to ship the first one.

Estimated size: ~250 lines plus per-target ingest functions, and the round-trip
fixtures double as the test suite.
