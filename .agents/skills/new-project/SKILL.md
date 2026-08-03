---
name: new-project
description: Scaffold a new project under 05-PROJECTS/<name> as its own git repo wired into the jung-os-2 harness. Use when the user says /new-project or asks to start a new project in jung-os.
---

# New project scaffold

Only `CLAUDE.md` reaches a project by directory walk-up. Skills, agents, and
settings do NOT — each project is its own git repo, and that bounds discovery.
Everything else is wired in by symlink, so projects track the harness live
instead of drifting behind a copy.

Run from the jung-os-2 root:

```bash
mkdir -p 05-PROJECTS/<name>
cd 05-PROJECTS/<name>
git init
cd ../.. && bash 01-HARNESS/link-project-harness.sh
```

`link-project-harness.sh` wires `.claude/agents`, `.claude/skills`,
`.claude/settings.json`, `.agents/skills`, and `.codex/agents` for every project
under `05-PROJECTS/`. It is idempotent — re-run it any time, and
`--check` reports drift without touching anything.

Then:

1. Write a minimal `CLAUDE.md` — project one-liner + stack. Harness rules arrive
   by walk-up; do not repeat them.
2. Write the project's `AGENTS.md` — Codex reads it instead of `CLAUDE.md` and
   does not walk up past the project's git root, so it must carry the harness
   pointer or Codex runs doctrine-less there (`link-project-harness.sh --check`
   fails without it). Open with:

   ```markdown
   # <name>

   **First, read `/Users/jungsek/jung-os-2/AGENTS.md` — the harness contract
   that binds you (working style, git flow, hard floors, security handoffs).**
   ```

   Then the project one-liner. Point `CLAUDE.md` at it (`See @AGENTS.md.`) so
   both runtimes read one project file.
3. Add the harness block to the project's `.gitignore` — the symlinks are
   machine-local and must never be committed:

   ```
   # agent-harness: symlinks into the jung-os-2 root harness, wired by
   # 01-HARNESS/link-project-harness.sh. Machine-local, never committed.
   .claude/
   .agents/
   .codex/
   ```

   A project that keeps harness content of its own cannot simply negate a path
   inside that block: git will not re-include anything under an excluded
   directory, so `!.agents/skills/<own-skill>/` never takes effect. Unignore
   each parent on the way down, then re-exclude the linked entries:

   ```
   .claude/
   .agents/
   .codex/
   !.agents/
   !.agents/skills/
   .agents/skills/*
   !.agents/skills/<its-own-skill>/
   ```
4. First commit on `main`, then normal flow: `/commit-push-pr` + `/merge-pr`
   once a remote exists.

Per-project settings overrides go in `.claude/settings.local.json`, which merges
over the linked root `settings.json` and survives a re-run. Never replace the
`settings.json` symlink with a copy — a copy is a snapshot that silently falls
behind the harness, which is the exact bug this scaffold replaced.

A project may keep harness content of its own (its own skill, its own agent).
The script detects that and links the root entries in alongside, one by one,
rather than replacing the directory.
