// Target detection for init: repo signals (the project already uses the tool)
// union machine signals (its binary is on PATH). Deterministic — no prompts;
// the CLI never gets an interactive wizard, flags override detection.

import fs from 'node:fs'
import path from 'node:path'
import { KNOWN_TARGETS } from './model.js'

// Config artifacts that mean "this repo is set up for that tool". AGENTS.md is
// deliberately not a signal — half the targets read it, it discriminates nothing.
const REPO_SIGNALS = {
  claude: ['.claude'],
  codex: ['.codex'],
  cursor: ['.cursor'],
  opencode: ['opencode.json', '.opencode'],
  hermes: ['.hermes'],
}

const BINARIES = {
  claude: ['claude'],
  codex: ['codex'],
  cursor: ['cursor-agent', 'cursor'],
  opencode: ['opencode'],
  hermes: ['hermes'],
}

function whichAny(names) {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  for (const n of names)
    for (const d of dirs) {
      try {
        fs.accessSync(path.join(d, n), fs.constants.X_OK)
        return n
      } catch {}
    }
  return null
}

// → [{target, repo: [paths found], bin: name|null}] for every known target.
export function detectTargets(root) {
  return KNOWN_TARGETS.map((target) => ({
    target,
    repo: (REPO_SIGNALS[target] ?? []).filter((rel) => fs.existsSync(path.join(root, rel))),
    bin: whichAny(BINARIES[target] ?? []),
  }))
}

export const detectedNames = (rows) => rows.filter((r) => r.repo.length || r.bin).map((r) => r.target)

// V1-FOCUS §1: claude/codex are the only targets detection may auto-enable.
// A cursor/opencode/hermes signal is real but becomes a proposal, never an
// enabled target — callers print it as one dim FYI line, nothing more.
export const PAIR_TARGETS = ['claude', 'codex']

// → { enabled, proposed } from detectTargets() rows.
export function splitDetected(rows) {
  const hits = detectedNames(rows)
  return {
    enabled: hits.filter((t) => PAIR_TARGETS.includes(t)),
    proposed: hits.filter((t) => !PAIR_TARGETS.includes(t)),
  }
}
