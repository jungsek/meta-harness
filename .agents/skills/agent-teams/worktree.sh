#!/bin/bash
# Worktree lifecycle for agent-teams single-writer isolation.
#
# A fresh `git worktree` checkout contains tracked files ONLY, so every
# gitignored harness link a project got from 01-HARNESS/link-project-harness.sh
# is missing and the worker runs unwired. This script creates the checkout under
# the fixed 05-PROJECTS/.worktrees/<repo>/<name> path and re-applies that wiring.
# Skills DO need wiring: they do not arrive by directory walk-up — discovery is
# bounded by the enclosing git repo, and a worktree is its own checkout.
#
# Usage:
#   worktree.sh create <repo> <name> [base-ref]   # -> prints worktree path
#   worktree.sh remove <repo> <name>
#   worktree.sh list [repo]
#
# Branch is always team/<name>. Herdr pairing (lead runs this, then):
#   herdr worktree open --workspace <id> --path <path> --label <repo>:<name>
#   herdr agent start <name> --kind claude --pane <pane-id>
set -euo pipefail

ROOT="${JUNGOS_ROOT:-/Users/jungsek/jung-os-2}"
PROJECTS="$ROOT/05-PROJECTS"
TREES="$PROJECTS/.worktrees"

die() { echo "worktree: $*" >&2; exit 1; }

# Link one harness entry into the checkout. If the project TRACKS a directory of
# that name, the checkout already has it as a real dir — `ln -sfn` would nest a
# link inside it (.claude/agents/agents) and the worker would still find nothing,
# so merge root's entries in per-entry instead, keeping the project's own.
link_entry() {
  local src="$1" dest="$2" entry name
  if [ -d "$dest" ] && [ ! -L "$dest" ]; then
    for entry in "$src"/*; do
      [ -e "$entry" ] || continue
      name="$(basename "$entry")"
      if [ -e "$dest/$name" ] || [ -L "$dest/$name" ]; then continue; fi
      ln -sfn "$src/$name" "$dest/$name"
    done
  else
    ln -sfn "$src" "$dest"
  fi
}

wire() {  # re-apply the harness wiring that the checkout dropped
  local wt="$1"
  mkdir -p "$wt/.claude" "$wt/.agents" "$wt/.codex"
  # Absolute targets: a worktree sits at a different depth than a project, and
  # this wiring must not care. settings.json is a LINK, never a copy — a copy is
  # a snapshot that silently drifts behind the harness.
  ln -sfn "$ROOT/.claude/settings.json" "$wt/.claude/settings.json"
  link_entry "$ROOT/.claude/agents" "$wt/.claude/agents"
  link_entry "$ROOT/.claude/skills" "$wt/.claude/skills"
  link_entry "$ROOT/.agents/skills" "$wt/.agents/skills"
  link_entry "$ROOT/.codex/agents"  "$wt/.codex/agents"
  # The wiring is untracked, so without this every worktree reads dirty and
  # `git worktree remove` refuses — forcing -f, which would also discard real work.
  local ex; ex="$(git -C "$wt" rev-parse --git-path info/exclude)"
  local d
  for d in '.claude/' '.agents/' '.codex/'; do
    grep -qxF "$d" "$ex" 2>/dev/null || echo "$d" >> "$ex"
  done
}

case "${1:-}" in
  create)
    repo="${2:?repo required}"; name="${3:?name required}"; base="${4:-HEAD}"
    src="$PROJECTS/$repo"
    [ -d "$src/.git" ] || die "no git repo at $src"
    wt="$TREES/$repo/$name"
    if [ -e "$wt" ]; then die "already exists: $wt"; fi
    mkdir -p "$TREES/$repo"
    git -C "$src" worktree add -b "team/$name" "$wt" "$base" >&2
    wire "$wt"
    echo "$wt"
    ;;
  remove)
    repo="${2:?repo required}"; name="${3:?name required}"
    src="$PROJECTS/$repo"
    if [ "${4:-}" = "-f" ]; then
      git -C "$src" worktree remove --force "$TREES/$repo/$name"
    else
      git -C "$src" worktree remove "$TREES/$repo/$name"
    fi
    git -C "$src" worktree prune
    # ponytail: branch team/<name> left behind on purpose — unmerged work is
    # the lead's to resolve, not this script's to delete.
    ;;
  list)
    if [ -n "${2:-}" ]; then git -C "$PROJECTS/$2" worktree list; else
      for d in "$PROJECTS"/*/; do
        [ -d "$d/.git" ] && git -C "$d" worktree list | tail -n +2
      done
    fi
    ;;
  *) die "usage: worktree.sh create|remove|list <repo> [name] [base-ref]" ;;
esac
