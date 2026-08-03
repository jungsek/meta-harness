---
name: merge-pr
description: Merge an open GitHub PR once checks pass, delete the branch, and sync local main. Use when the user says /merge-pr or asks to merge or land an open PR.
---

# Merge PR

Companion to `commit-push-pr` (which stops at the open PR). This skill lands it.

## Identify the PR

Use the PR number/URL given as argument; otherwise the PR for the current branch:

```bash
gh pr view --json number,title,url,mergeable,reviewDecision,statusCheckRollup
```

## Merge gate

All must hold, else stop and report exactly what failed:

- checks green (`gh pr checks` passes, or repo has no checks configured)
- `reviewDecision` is not `CHANGES_REQUESTED`
- `mergeable` is not `CONFLICTING`

## Merge

```bash
gh pr merge <number> --squash --delete-branch
git checkout main && git pull
```

Confirm the squash commit is on local main (`git log -1`), then report the merged PR URL and landed SHA.
