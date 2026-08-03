---
name: commit-push-pr
description: Commit current changes, push the branch, and open a GitHub PR in one flow. Use when the user says /commit-push-pr or asks to ship current work as a PR.
---

# Commit, push, open PR

Port of anthropics/claude-code `commit-commands` plugin `/commit-push-pr` command (Apache-2.0), adapted to skill form with rebase-first and a sensitive-file guard.

## Gather context first

Run these yourself before acting:

```bash
git status
git diff HEAD
git branch --show-current
```

## Sensitive-file guard

Before staging, check the diff for files that must never be committed: `.env` and variants, credentials, tokens, private keys, `*.pem`. If any appear, stop and tell the user which files were excluded and why. Never stage them.

## Your task

Based on the changes:

1. Create a new branch if currently on main.
2. Rebase-first: `git fetch origin && git rebase origin/main` (or the repo's default branch) so the PR lands on current history; stop and report on conflicts.
3. Create a single commit with an appropriate message matching the repo's commit style.
4. Push the branch to origin.
5. Create a pull request using `gh pr create`.
6. Do all of the above with tool calls only — no other text or tools. STOP at the open PR; do not merge.
