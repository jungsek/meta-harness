---
name: commit
description: Create a single well-formed git commit from the current changes. Use when the user says /commit or asks to commit current work.
---

# Commit

Port of anthropics/claude-code `commit-commands` plugin `/commit` command (Apache-2.0), adapted to skill form with a sensitive-file guard.

## Gather context first

Slash-command dynamic injection is not available in skills — run these yourself before acting:

```bash
git status
git diff HEAD
git branch --show-current
git log --oneline -10
```

## Sensitive-file guard

Before staging, check the diff for files that must never be committed: `.env` and variants, credentials, tokens, private keys, `*.pem`, cloud config with secrets. If any appear, stop and tell the user which files were excluded and why. Never stage them.

## Your task

Based on the changes, create a single git commit:

1. Stage the relevant files (never blanket `git add -A` when the diff contains unrelated or sensitive files).
2. Write a commit message that matches the repository's existing commit style (check the recent commits above).
3. Stage and commit using tool calls in a single message. Do not use any other tools or send any other text besides these tool calls.
