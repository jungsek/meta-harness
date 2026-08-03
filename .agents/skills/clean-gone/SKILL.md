---
name: clean-gone
description: Delete local git branches marked [gone] (removed on remote), including their worktrees. Use when the user says /clean-gone or asks to clean up stale branches.
---

# Clean [gone] branches

Port of anthropics/claude-code `commit-commands` plugin `/clean_gone` command (Apache-2.0), skill form.

## Your task

Execute these commands to clean up stale local branches deleted from the remote.

1. **List branches to identify any with [gone] status**

   ```bash
   git branch -v
   ```

   Branches with a `+` prefix have associated worktrees and must have their worktrees removed before deletion.

2. **Identify worktrees that need to be removed for [gone] branches**

   ```bash
   git worktree list
   ```

3. **Remove worktrees and delete [gone] branches (handles both regular and worktree branches)**

   ```bash
   git branch -v | grep '\[gone\]' | sed 's/^[+* ]//' | awk '{print $1}' | while read branch; do
     echo "Processing branch: $branch"
     worktree=$(git worktree list | grep "\\[$branch\\]" | awk '{print $1}')
     if [ ! -z "$worktree" ] && [ "$worktree" != "$(git rev-parse --show-toplevel)" ]; then
       echo "  Removing worktree: $worktree"
       git worktree remove --force "$worktree"
     fi
     echo "  Deleting branch: $branch"
     git branch -D "$branch"
   done
   ```

Report which worktrees and branches were removed. If no branches are marked [gone], report that no cleanup was needed.
