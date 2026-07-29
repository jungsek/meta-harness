#!/usr/bin/env node
// Regenerates dashboard/fixtures/{demo-full,demo-drift,demo-bootstrap} from
// scratch. Run with: node dashboard/fixtures/build.mjs
//
// demo-full is built by hand-authoring a real .meta-harness/ source tree and
// then calling the CLI's own generate() — so the manifest and native outputs
// are exactly what a real user's repo would have, never hand-faked hashes.
// demo-drift copies that tree and perturbs it by hand (see comments below).
// demo-bootstrap is native-only config with no source dir at all.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate } from '../../src/engine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = __dirname

const write = (root, rel, content) => {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

const readJson = (abs) => JSON.parse(fs.readFileSync(abs, 'utf8'))
const writeJson = (abs, data) => fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n')

/* ── demo-full: a healthy, configured "orbit" billing-service repo ───────── */

function buildFull(root) {
  fs.rmSync(root, { recursive: true, force: true })

  write(
    root,
    'meta-harness.jsonc',
    `{\n  // source-of-truth directory\n  "sourceDir": ".meta-harness",\n  // targets to generate; "*" = all\n  "targets": ["claude", "codex"]\n}\n`
  )

  write(
    root,
    '.meta-harness/rules/identity.md',
    `---
description: Project identity and safety floor
root: true
---
# Orbit

You are working in the Orbit billing service. Stripe webhooks, Postgres via
Prisma, deployed on Fly.io.

## Safety

Stop for human review: schema migrations, auth changes, anything touching
production Stripe keys.
`
  )
  write(
    root,
    '.meta-harness/rules/testing.md',
    `---
description: Testing conventions
---
# Testing

Run \`pnpm test\` before every commit. New endpoints need an integration test
in \`tests/api/\`.
`
  )

  write(
    root,
    '.meta-harness/agents/reviewer.md',
    `---
description: Reviews diffs for correctness and security before merge.
claude:
  model: inherit
codex:
  toolsets: ["file", "terminal"]
---
Read the diff. Flag correctness bugs, missing error handling, and security
issues. Never approve a migration without a rollback note.
`
  )

  write(
    root,
    '.meta-harness/commands/ship.md',
    `---
description: Run tests, then open a PR
---
Run \`pnpm test\`, then open a pull request summarizing the diff.
`
  )

  write(
    root,
    '.meta-harness/connections/mcp.jsonc',
    `{
  // Stripe MCP for reading webhook logs and test-mode charges
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp-server"],
      "env": { "STRIPE_API_KEY": "\${STRIPE_API_KEY}" }
    },
    "postgres": {
      "url": "https://mcp.postgres.internal/orbit"
    }
  }
}
`
  )

  write(
    root,
    '.meta-harness/hooks/hooks.jsonc',
    `{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "git fetch --quiet" }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "scripts/guard-bash.sh" }] }
    ]
  }
}
`
  )

  write(root, '.meta-harness/env/env.jsonc', `{ "vars": { "ORBIT_ENV": "development", "LOG_LEVEL": "debug" } }\n`)

  write(root, '.meta-harness/plugins/plugins.jsonc', `{ "enabledPlugins": ["conventional-commits@anthropics"] }\n`)

  write(
    root,
    '.meta-harness/permissions/permissions.jsonc',
    `{
  "permission": {
    "bash": { "git status": "allow", "git diff*": "allow", "rm -rf *": "deny", "*": "ask" },
    "read": { ".env*": "deny" }
  },
  "codex": { "approval_policy": "on-request", "sandbox_mode": "workspace-write" }
}
`
  )

  write(root, '.meta-harness/settings/claude.settings.jsonc', `{ "model": "opus", "enableAllProjectMcpServers": true }\n`)
  write(root, '.meta-harness/settings/codex.config.toml', `model_reasoning_effort = "high"\n`)

  generate(root, { force: true })
}

/* ── demo-drift: demo-full, then perturbed to exercise every status ──────── */

function buildDrift(root) {
  fs.rmSync(root, { recursive: true, force: true })
  fs.cpSync(FULL_DIR, root, { recursive: true })

  // 1. Pending generate: a new source command, never generated.
  write(
    root,
    '.meta-harness/commands/audit.md',
    `---
description: Run a dependency audit
---
Run \`pnpm audit\`, then summarize findings by severity.
`
  )

  // 2 + 3. Conflict: the same env var changed on both the source side and
  // the native side since the last generate, to two different values —
  // neither matches the manifest baseline ("debug"), so it's a real
  // three-way disagreement, not just an import.
  write(root, '.meta-harness/env/env.jsonc', `{ "vars": { "ORBIT_ENV": "development", "LOG_LEVEL": "trace" } }\n`)
  const claudeSettingsPath = path.join(root, '.claude/settings.json')
  const claudeSettings = readJson(claudeSettingsPath)
  claudeSettings.env.LOG_LEVEL = 'warn'
  writeJson(claudeSettingsPath, claudeSettings)

  // 4. EDITED: hand-edit a native per-file output without touching its
  // source — a pure "changed natively, source untouched" import candidate.
  const reviewerToml = path.join(root, '.codex/agents/reviewer.toml')
  fs.writeFileSync(reviewerToml, fs.readFileSync(reviewerToml, 'utf8') + '\n# hand-tuned after generate\n')

  // 5. MISSING + a warning: delete a whole tracked output file. Since the
  // whole file (not one item) is gone, it drops out of syncPlan's scan
  // entirely and surfaces as "deleted natively: sync recreates it" instead
  // of a conflict — status() still reports the path as MISSING.
  fs.rmSync(path.join(root, '.mcp.json'))

  // 6. Unsupported: a real Cursor config file meta-harness cannot yet
  // import (V1-FOCUS: claude+codex only).
  write(root, '.cursor/mcp.json', `{ "mcpServers": { "figma": { "url": "https://mcp.figma.com/mcp" } } }\n`)
}

/* ── demo-bootstrap: native config, no .meta-harness/ at all ─────────────── */

function buildBootstrap(root) {
  fs.rmSync(root, { recursive: true, force: true })

  write(
    root,
    '.claude/settings.json',
    JSON.stringify(
      {
        model: 'sonnet',
        env: { NODE_ENV: 'development' },
        permissions: { allow: ['Bash(git status)', 'Bash(git diff*)'], deny: ['Bash(rm -rf *)'] },
      },
      null,
      2
    ) + '\n'
  )
  write(
    root,
    '.claude/commands/deploy.md',
    `---
description: Deploy to staging
---
Run the staging deploy script and report the release URL.
`
  )
  write(
    root,
    '.claude/agents/reviewer.md',
    `---
name: reviewer
description: Reviews diffs for correctness before merge.
---
Read the diff and flag bugs or missing tests.
`
  )
  write(root, '.mcp.json', `{ "mcpServers": { "postgres": { "url": "https://mcp.postgres.internal/orbit" } } }\n`)
  write(
    root,
    '.codex/config.toml',
    `approval_policy = "on-request"\nsandbox_mode = "workspace-write"\n\n[mcp_servers.postgres]\nurl = "https://mcp.postgres.internal/orbit"\n`
  )
  write(
    root,
    '.codex/agents/reviewer.toml',
    `name = "reviewer"\ndescription = "Reviews diffs for correctness before merge."\ndeveloper_instructions = '''\nRead the diff and flag bugs or missing tests.\n'''\n`
  )
  write(
    root,
    '.codex/hooks.json',
    `{ "hooks": { "SessionStart": [{ "hooks": [{ "type": "command", "command": "git fetch --quiet" }] }] } }\n`
  )
}

const FULL_DIR = path.join(FIXTURES, 'demo-full')
const DRIFT_DIR = path.join(FIXTURES, 'demo-drift')
const BOOTSTRAP_DIR = path.join(FIXTURES, 'demo-bootstrap')

buildFull(FULL_DIR)
buildDrift(DRIFT_DIR)
buildBootstrap(BOOTSTRAP_DIR)

console.log('built:', path.relative(FIXTURES, FULL_DIR))
console.log('built:', path.relative(FIXTURES, DRIFT_DIR))
console.log('built:', path.relative(FIXTURES, BOOTSTRAP_DIR))
