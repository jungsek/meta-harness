# meta-harness

**One setup, every coding agent.**

You spent months teaching Claude Code how you work: the rules, the hooks that
stop it before the risky thing, the permissions you tuned after it did the
risky thing. Then a better model ships inside somebody else's CLI. Teaching it
all again by hand loses most of it, so you never switch. meta-harness moves
your setup for you.

```
npx @jungsek/meta-harness sync
```

That one command reads the `.claude/` folder you already have, builds a source
of truth from it, and writes a working `.codex/`. It works in the other
direction too: if you live in Codex and have no `.claude/`, the same command
gives you one. Keep editing whichever tool you prefer. Run `sync` again and
both sides come back together. Nothing is lost quietly; if the same thing
changed in both places, the run stops and shows you both versions instead of
guessing.

The promise for V1 is exact: Claude Code and Codex, both directions, the whole
setup, one source of truth.

Why now? Every lab ships its own coding agent, and the best model changes
every few months. The setup you built is the part worth keeping. The agent is
the part you should be able to swap in one command.

Think of it as dotfiles for coding agents.

## Install

```
npm install -g @jungsek/meta-harness
```

Or skip the install and run it once with `npx @jungsek/meta-harness sync`
(in CI, prefer npx).

## Your first run

```
$ npx @jungsek/meta-harness sync

importing your claude setup → building .meta-harness/ → emitting claude, codex
.meta-harness/ becomes the source of truth; every target is generated from it.

sync plan
  ← import
    claude   connections  + deepwiki
             settings     + model
             hooks        + PreToolUse
             commands     + ship
  → generate
    claude   .claude/agents/planner.md  .claude/commands/ship.md
    codex    .codex/config.toml  .codex/hooks.json  .codex/rules/meta-harness.rules
    shared   .mcp.json  AGENTS.md  CLAUDE.md
✔ synced — 10 files written

next:
  claude  open claude here, accept the folder-trust prompt
  codex   open codex here, accept the directory-trust prompt
          then run /hooks and accept
```

The command never asks you questions. If you want to see what it would do
first, add `--dry-run` and it prints the plan without writing anything.

After the first run, your project has exactly two new things of its own: a
`.meta-harness/` folder holding your setup, and a small `meta-harness.jsonc`
config file. Everything under `.claude/` and `.codex/` is generated from
those. There is no local `node_modules` and no `package.json`.

## Commands

```
meta-harness sync         import, reconcile, and write everything (start here)
meta-harness status       is everything still in sync?
meta-harness init         start from scratch instead of importing
meta-harness generate     write native config from the source, without importing
meta-harness show         list what your harness contains
meta-harness explain      describe a source format or a target
meta-harness uninstall    remove every trace
```

Every command takes `--help`. `sync`, `generate`, and `status` take `--json`
when a script or CI needs to read the result.

## How it stays in sync

Your setup lives in `.meta-harness/`. The native config files are generated
from it. When you hand-edit a generated file, the next `sync` folds that edit
back into the source and regenerates the other tool, so your change reaches
both. When the same item changed on both sides, `sync` stops, prints the two
versions, and lets you settle it with `--prefer native` or `--prefer source`.

That is the whole model. The finer points (what counts as a conflict, how
shared files are assembled, what gets pruned) live in the docs below.

## Learn more

- [How it works](docs/how-it-works.md): the ideas behind the tool, in plain
  terms.
- [Reference](docs/reference.md): source file formats, the output matrix,
  frontmatter, the ownership contract, trust gates, and CI setup.
- [SPEC.md](SPEC.md): the full design and every ratified decision.
