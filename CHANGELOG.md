# Changelog

## 0.3.0 — 2026-07-26

- Standalone product: all external-tool references removed from docs, code,
  and output paths. Hermes subagent specs moved
  `.hermes/rulesync/subagents/` → `.hermes/meta-harness/subagents/`
  (regenerate with `meta-harness generate --force` if you had the old path).
- CLI polish: color output (tty-aware, `NO_COLOR` respected), ✔/✘ summaries,
  `status` failure hint, `targets` marks enabled ones, `init` prints next
  steps, help examples, missing-source-dir error suggests `init`.
- SPEC rewritten standalone (v0.4); language-choice analysis recorded
  (JS over Rust: full 6-target generate ≈ 100 ms, startup-dominated).

## 0.2.0 — 2026-07-26

- First published release: `@jungsek/meta-harness` on npm.
- Six targets: claude, codex, agents, cursor, opencode, hermes.
- Owned-key drift for shared files, fragment assembly with hard-error
  collisions, symlink mode, per-target hook event whitelists, MCP dialect
  translation, scaffolding `init`, JSON schema, agent skill.
