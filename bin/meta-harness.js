#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { program } from 'commander'
import { DEFAULT_TARGETS, generate, loadConfig, status } from '../src/engine.js'
import { targets as registry } from '../src/targets/index.js'

const root = process.cwd()
const pkg = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')
)

program
  .name('meta-harness')
  .description('one source dir → native config for coding-agent harnesses')
  .version(pkg.version, '-v, --version')

const csv = (v) => v.split(',').map((s) => s.trim()).filter(Boolean)

program
  .command('generate')
  .description('compile the source dir into native harness config')
  .option('--check', 'dry-run; exit 1 if outputs are stale or drifted')
  .option('--dry-run', 'alias of --check without the exit code')
  .option('--force', 'discard hand-edits to generated outputs')
  .option('-t, --targets <names>', `comma-separated targets (default: config or ${DEFAULT_TARGETS.join(',')}); * = all`, csv)
  .option('--only <categories>', 'comma-separated category subset', csv)
  .option('--json', 'machine-readable output')
  .action((opts) => {
    const check = opts.check || opts.dryRun
    try {
      const res = generate(root, { check, force: opts.force, only: opts.only ?? null, targets: opts.targets ?? null })
      if (opts.json) {
        console.log(JSON.stringify({ ...res, stale: check && (res.written.length > 0 || res.pruned.length > 0) }, null, 2))
      } else {
        for (const w of res.warnings) console.warn(`warn: ${w}`)
        const verb = check ? 'would write' : 'wrote'
        for (const p of res.written) console.log(`  ${verb}  ${p}`)
        for (const p of res.pruned) console.log(`  ${check ? 'would prune' : 'pruned'} ${p}`)
        console.log(`${res.written.length} written, ${res.pruned.length} pruned, ${res.unchanged.length} unchanged`)
      }
      if (opts.check && (res.written.length || res.pruned.length)) {
        if (!opts.json) console.error('stale — run: meta-harness generate')
        process.exit(1)
      }
    } catch (e) {
      if (opts.json) console.log(JSON.stringify({ error: e.message, drifted: e.drifted ?? [] }))
      else console.error(e.message)
      process.exit(1)
    }
  })

program
  .command('status')
  .description('manifest vs disk: clean / EDITED / MISSING per output')
  .option('--json', 'machine-readable output')
  .action((opts) => {
    const rows = status(root)
    if (opts.json) console.log(JSON.stringify(rows, null, 2))
    else if (rows.length === 0) console.log('no manifest — run: meta-harness generate')
    else for (const r of rows) console.log(`  ${r.state.padEnd(8)} ${r.path}`)
    if (rows.some((r) => r.state !== 'clean' && r.state !== 'link')) process.exit(1)
  })

program
  .command('targets')
  .description('list supported targets')
  .action(() => {
    for (const name of Object.keys(registry)) console.log(name)
  })

program
  .command('init')
  .description('scaffold the source dir + config (idempotent)')
  .action(() => {
    const cfg = loadConfig(root)
    const src = path.join(root, cfg.sourceDir)
    const scaffoldDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scaffold')
    let created = 0
    for (const rel of walk(scaffoldDir)) {
      const dest = path.join(src, rel)
      if (fs.existsSync(dest)) continue
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(path.join(scaffoldDir, rel), dest)
      created++
    }
    const cfgPath = path.join(root, 'meta-harness.jsonc')
    if (!fs.existsSync(cfgPath)) {
      fs.writeFileSync(
        cfgPath,
        `{\n  // source-of-truth directory\n  "sourceDir": "${cfg.sourceDir}",\n  // targets to generate (see: meta-harness targets); "*" = all\n  "targets": ${JSON.stringify(cfg.targets)}\n}\n`
      )
      created++
    }
    console.log(created ? `initialized ${cfg.sourceDir}/ (${created} files)` : `${cfg.sourceDir}/ already initialized`)
  })

function walk(dir, prefix = '') {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? path.join(prefix, e.name) : e.name
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel))
    else out.push(rel)
  }
  return out
}

program.parse()
