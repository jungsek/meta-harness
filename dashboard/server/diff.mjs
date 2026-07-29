// Read-only content diff for one managed output file: expected bytes
// (recomputed from source via the CLI's own engine) vs what is on disk.
// Never writes — discover/mergeShared only read (verified in engine.js).

import fs from 'node:fs'
import path from 'node:path'
import { discover, loadConfig, loadManifest, mergeShared } from '../../src/engine.js'

const splitLines = (s) => {
  if (s === '') return []
  const lines = s.split('\n')
  if (lines[lines.length - 1] === '') lines.pop() // trailing newline, not an extra empty line
  return lines
}

// A managed output should never be near this; a file that is means someone
// pointed the diff at something else — refuse rather than burn CPU/RAM.
const MAX_DIFF_BYTES = 2 * 1024 * 1024
const MAX_DIFF_LINES = 20_000

// Classic LCS DP — config files are small, O(n*m) is fine under the caps.
// ponytail: quadratic diff, swap in Myers if the caps ever chafe.
function lineDiff(aLines, bLines) {
  const n = aLines.length
  const m = bLines.length
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = aLines[i] === bLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const rows = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      rows.push({ type: 'ctx', a: i + 1, b: j + 1, text: aLines[i] })
      i++, j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ type: 'del', a: i + 1, b: null, text: aLines[i] })
      i++
    } else {
      rows.push({ type: 'add', a: null, b: j + 1, text: bLines[j] })
      j++
    }
  }
  while (i < n) rows.push({ type: 'del', a: i + 1, b: null, text: aLines[i++] })
  while (j < m) rows.push({ type: 'add', a: null, b: j + 1, text: bLines[j++] })
  return rows
}

// Collapse runs of >6 unchanged lines to {type:'skip', count}, keeping 3
// context lines on each side of the gap.
function collapse(rows) {
  const out = []
  let run = []
  const flush = () => {
    if (run.length > 6) {
      out.push(...run.slice(0, 3))
      out.push({ type: 'skip', count: run.length - 6 })
      out.push(...run.slice(run.length - 3))
    } else {
      out.push(...run)
    }
    run = []
  }
  for (const r of rows) {
    if (r.type === 'ctx') run.push(r)
    else {
      flush()
      out.push(r)
    }
  }
  flush()
  return out
}

// Returns the FileDiff wire shape (dashboard/src/types.ts), or
// {error:'not managed'} when relPath is not an expected output of this root.
// Strictly read-only.
export function computeDiff(root, relPath) {
  const cfg = loadConfig(root)
  const { files } = discover(root, cfg, { only: null, targetNames: cfg.targets })
  const entry = files.find((f) => f.path === relPath)
  if (!entry) return { error: 'not managed', detail: `${relPath} is not a managed output of this root` }

  const abs = path.join(root, relPath)
  const base = { path: relPath, expectedLabel: 'generated from source', actualLabel: 'on disk' }

  if (entry.symlinkTo) {
    const expectedTarget = path.relative(path.dirname(abs), entry.symlinkTo)
    let actualTarget = null
    try {
      actualTarget = fs.readlinkSync(abs)
    } catch {
      actualTarget = null // missing or not a link
    }
    return { ...base, kind: 'symlink', identical: actualTarget === expectedTarget, rows: [], target: expectedTarget }
  }

  // Expected bytes, computed exactly as generate() would write them: plain
  // entries carry content; shared entries go through the engine's own
  // mergeShared (same serialization, foreign keys preserved).
  let expected
  if (entry.shared) {
    const prev = loadManifest(root, cfg).files[relPath]
    expected = mergeShared(root, entry, prev?.ownedKeys, [], false).content
  } else {
    expected = entry.content
  }

  let actual = ''
  let kind = 'text'
  try {
    // A managed REGULAR file that has been replaced by a symlink would let
    // readFileSync follow the link anywhere on disk. Refuse unless the
    // resolved path stays inside the root.
    const real = fs.realpathSync(abs)
    if (path.relative(fs.realpathSync(root), real).startsWith('..')) {
      return { ...base, kind: 'binary', identical: false, rows: [], detail: 'resolves outside the root — not shown' }
    }
    if (fs.statSync(real).size > MAX_DIFF_BYTES) {
      return { ...base, kind: 'binary', identical: false, rows: [], detail: 'too large to diff' }
    }
    actual = fs.readFileSync(real, 'utf8')
  } catch {
    kind = 'missing'
  }
  if (kind === 'text' && actual.includes('\u0000')) return { ...base, kind: 'binary', identical: false, rows: [] }

  const identical = expected === actual
  const aLines = splitLines(expected)
  const bLines = splitLines(actual)
  if (aLines.length > MAX_DIFF_LINES || bLines.length > MAX_DIFF_LINES) {
    return { ...base, kind: 'binary', identical, rows: [], detail: 'too many lines to diff' }
  }
  const rows = collapse(lineDiff(aLines, bLines))
  return { ...base, kind, identical, rows }
}
