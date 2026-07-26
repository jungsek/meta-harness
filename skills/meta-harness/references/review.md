# Harness review checklist

Run after building or when the user asks whether their harness is any good.
Report only what's genuinely missing for *this* project — a checklist recited
in full is noise, and a harness doesn't need every row filled.

## Coverage

| Check | Why it matters |
|---|---|
| A rule states what the source of truth is | Without it, an agent edits `.claude/` directly and trips the drift guard |
| A rule names protected domains | The single highest-value rule most harnesses lack |
| Dangerous operations are *enforced*, not just described | A `permissions` deny survives an agent that skims the rules |
| Secrets are excluded from reads | `Read(.env)` deny, and no secrets in `env/env.jsonc` — that file is committed |
| Targets match tools actually in use | Unused targets generate files nobody reads |
| Rules are split by concept | One 300-line rule file gets skimmed; four short ones get read |
| Every subagent has a description | It's how the runtime decides when to invoke it |
| Codex hooks have been trusted | New `.codex/hooks.json` entries silently do not run until they are |
| Outputs are committed | Makes `generate --check` meaningful in CI |
| `generate --check` runs in CI or a pre-commit hook | Otherwise stale output ships unnoticed |

## Smells

- **A rule that contradicts a permission.** The permission wins silently. Say so.
- **`env/env.jsonc` holding a token or key.** It's committed. Move it out.
- **Hooks using `$CLAUDE_PROJECT_DIR` without a per-target override.** Dead on every non-Claude target.
- **Prose duplicated between `AGENTS.md` and `rules/`.** Two copies, one gets stale. Rules are compiled; AGENTS.md is read natively — pick per piece of content, don't mirror.
- **A subagent whose prompt restates the project rules.** Rules already reach it; the prompt should say what makes this agent *different*.
- **Targets with nothing to receive.** Enabling `hermes` with no subagents defined produces nothing.
- **`HARNESS.md` describing something the source files don't implement.** Files win. Rewrite the doc.

## Reporting

Lead with the one thing most worth fixing and why it bites. Offer to fix it —
don't fix unasked. If the harness is genuinely fine, say that plainly instead
of manufacturing findings.
