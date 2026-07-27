# Writing AGENTS.md / CLAUDE.md

How to write and maintain the prose instruction file. Applies to `rules/`
source files (compiled into the AGENTS.md managed block) and to the user
prose outside the markers alike — it is all one file to the agent reading it.
Distilled from vendor guidance (Anthropic, OpenAI Codex, agents.md spec) and
measured practice (GitHub's 2,500-repo study, ETH Zurich's context-file
evaluation); sources listed at the end.

## The one test

For each line ask: *would removing this cause the agent to make a mistake?*
If not, cut it. Every line loads into every session before any task, and the
cost of a weak line is double: important rules drown (adherence drops as the
file grows) and agents *over-comply* — the ETH evaluation measured 20%+
extra inference cost from agents dutifully following filler, with no
accuracy gain. LLM-generated context files made agents slightly *worse*;
short hand-written ones helped. Bloat is not neutral padding, it is negative.

## What earns a line

- Commands the agent can't guess — build, test, lint, run — with exact flags.
  Listing a test command is an implicit instruction to run it.
- Deviations from defaults: style rules a linter doesn't enforce, stack
  versions that constrain suggestions ("React 18 + Vite"), env quirks.
- Architecture decisions and gotchas the code doesn't show — the non-obvious
  only. One real code snippet showing house style beats three paragraphs.
- Boundaries in three tiers: always do / ask first / never do. Explicit
  write scopes ("write to `docs/`, never modify `src/`") and destructive-
  action limits are the highest-value constraints measured.
- What "done" means and how to verify it.

## What never earns a line

- Anything the agent infers by reading code (directory listings, dependency
  lists, file-by-file descriptions).
- Generic conventions the model already knows; aspirational prose ("write
  clean code"); vague personas.
- API documentation — link it. Frequently-changing facts — they rot.
- Anything a deterministic tool can enforce. Prose is ~80% adherence;
  a linter, hook, or permission deny is 100%. In meta-harness terms: the
  rule persuades, the `permissions/` entry enforces — a safety rule without
  its deny is a suggestion.

## Length

Start at 30–50 lines. Sweet spot under 150–200; past that the 2,500-repo
study found only added cost. Hard ceiling ~300 — split instead of growing.
Codex truncates combined project docs at 32 KiB by default. Imports organize
content but do not save tokens; everything still loads.

## Phrasing

Imperative, specific, testable: "run `npm test` before committing", not
"test your changes". One sentence per constraint. Rules stick when written
against a failure that actually happened; rules written in anticipation
rarely do. Facts (layout, commands, pointers) land with zero effort; style
prose lands inconsistently. Reserve emphasis ("IMPORTANT", "YOU MUST") for
the few rules that genuinely need it — everywhere is nowhere. Two rules that
contradict get picked between arbitrarily; hunt contradictions when pruning.

## Structure and scale

Single project: one flat file, sections like commands / testing / structure
/ style / git workflow / boundaries, commands early.

Monorepo: root file as router — terse pointers to per-package files, not
inlined detail. Nested AGENTS.md per subproject; every tool that reads the
format applies nearest-file-wins. Claude Code loads ancestor files at launch
and subdirectory files lazily when it touches those paths, so nesting is
also a token optimization. Chat prompts override files; closest file wins
otherwise.

Routing rule for content that doesn't belong in the file at all: needed
every session → this file; occasional workflow or domain knowledge → a
skill or linked doc; must happen mechanically every time → a hook or
permission, not prose.

## Tool bridge

Claude Code reads `CLAUDE.md`, not `AGENTS.md` — meta-harness already
generates the `CLAUDE.md` stub importing `@AGENTS.md`; never hand-write a
second copy. Codex, Cursor, OpenCode and the rest read `AGENTS.md` natively.

## Maintenance

Treat the file like code: versioned, PR-reviewed, behavior-tested.

- Add a rule only after the same mistake happens twice; write it against
  that concrete failure, immediately, before the correction is forgotten.
- Prune on the same evidence: a rule the agent follows without being told
  is dead weight — delete it or convert it to a hook. If a present rule is
  being violated, the file is probably too long, not too weak.
- `/init`-style generated starters are drafts to cut down, never to ship.
- Test an edit by watching whether behavior actually shifts, not by
  rereading the prose.

## Sources

Anthropic best-practices + memory docs (code.claude.com/docs); agents.md
spec; OpenAI Codex AGENTS.md guide; GitHub blog 2,500-repo AGENTS.md study;
ETH Zurich "Evaluating AGENTS.md" (2026); HumanLayer "Writing a good
CLAUDE.md"; Chroma "Context Rot".
