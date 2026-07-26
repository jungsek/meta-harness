#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { program } from 'commander'
import { DEFAULT_TARGETS, generate, loadConfig, status } from '../src/engine.js'
import { CATEGORIES, explain } from '../src/explain.js'
import { targets as registry } from '../src/targets/index.js'

const root = process.cwd()
const pkg = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')
)

// ANSI, tty-aware; NO_COLOR respected.
const tty = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)
const green = paint('32')
const red = paint('31')
const yellow = paint('33')
const dim = paint('2')
const bold = paint('1')

program
  .name('meta-harness')
  .description('one source dir → native config for coding-agent harnesses')
  .version(pkg.version, '-v, --version')
  .addHelpText(
    'after',
    `
Examples:
  meta-harness init                          scaffold .meta-harness/ with commented examples
  meta-harness generate                      compile for all enabled targets
  meta-harness generate --check              CI drift gate (exit 1 if stale or hand-edited)
  meta-harness generate -t cursor --only rules   partial run (never prunes)
  meta-harness status                        per-output: clean / EDITED / MISSING`
  )

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
        for (const w of res.warnings) console.warn(yellow(`warn: ${w}`))
        const verb = check ? 'would write' : 'wrote'
        for (const p of res.written) console.log(`  ${green(verb.padEnd(11))} ${p}`)
        for (const p of res.pruned) console.log(`  ${red((check ? 'would prune' : 'pruned').padEnd(11))} ${p}`)
        const clean = res.written.length === 0 && res.pruned.length === 0
        const mark = clean ? green('✔') : check ? yellow('✱') : green('✔')
        console.log(
          `${mark} ${res.written.length} written · ${res.pruned.length} pruned · ${dim(`${res.unchanged.length} unchanged`)}`
        )
      }
      if (opts.check && (res.written.length || res.pruned.length)) {
        if (!opts.json) console.error(red('stale — run: meta-harness generate'))
        process.exit(1)
      }
    } catch (e) {
      if (opts.json) console.log(JSON.stringify({ error: e.message, drifted: e.drifted ?? [] }))
      else console.error(red(e.message))
      process.exit(1)
    }
  })

program
  .command('status')
  .description('manifest vs disk: clean / EDITED / MISSING per output')
  .option('--json', 'machine-readable output')
  .action((opts) => {
    const rows = status(root)
    const bad = rows.filter((r) => r.state !== 'clean' && r.state !== 'link')
    if (opts.json) console.log(JSON.stringify(rows, null, 2))
    else if (rows.length === 0) console.log('no manifest — run: meta-harness generate')
    else {
      for (const r of rows) {
        const color = r.state === 'clean' ? dim : r.state === 'link' ? dim : red
        console.log(`  ${color(r.state.padEnd(8))} ${r.path}`)
      }
      console.log(
        bad.length
          ? red(`✘ ${bad.length} of ${rows.length} outputs need attention — port changes to the source, then: meta-harness generate --force`)
          : green(`✔ all clean (${rows.length} outputs)`)
      )
    }
    if (bad.length) process.exit(1)
  })

program
  .command('targets')
  .description('list supported targets (✔ = enabled in config)')
  .action(() => {
    const cfg = loadConfig(root)
    const enabled = new Set(cfg.targets.includes('*') ? Object.keys(registry) : cfg.targets)
    for (const name of Object.keys(registry))
      console.log(`  ${enabled.has(name) ? green('✔') : ' '} ${name}`)
  })

// The agent-facing skill is installed by `skills`, which owns skills dirs and
// skills-lock.json — meta-harness delegates rather than writing them itself.
function installSkill() {
  const repo = (pkg.repository?.url ?? '').replace(/^git\+|\.git$/g, '').replace(/^https:\/\/github\.com\//, '')
  if (!repo) return false
  console.log(dim(`installing the meta-harness skill via: npx skills add ${repo}`))
  const r = spawnSync('npx', ['-y', 'skills', 'add', repo, '--skill', 'meta-harness', '-y'], {
    cwd: root,
    stdio: 'inherit',
  })
  return r.status === 0
}

program
  .command('explain')
  .argument('[category]', 'rules | agents | commands | workflows | connections | hooks | env | plugins | settings')
  .description('print the source file shape for a category (what to write, and where it lands)')
  .action((name) => {
    if (!name) {
      console.log('categories:')
      for (const [k, c] of Object.entries(CATEGORIES)) console.log(`  ${bold(k.padEnd(12))} ${c.what}`)
      console.log(`\n${dim('meta-harness explain <category> for the file shape')}`)
      return
    }
    const text = explain(name, bold)
    if (!text) {
      console.error(red(`unknown category "${name}" (known: ${Object.keys(CATEGORIES).join(' ')})`))
      process.exit(1)
    }
    console.log(text)
  })

program
  .command('init')
  .description('scaffold the source dir + config, install the agent skill (idempotent)')
  .option('--no-skill', 'skip installing the agent skill (no network calls)')
  .action((opts) => {
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
    if (created) console.log(green(`✔ initialized ${cfg.sourceDir}/ (${created} files)`))
    else console.log(`${cfg.sourceDir}/ already initialized`)

    const skilled = opts.skill ? installSkill() : false
    if (opts.skill && !skilled)
      console.warn(yellow('warn: could not install the agent skill — run it yourself:\n      npx skills add jungsek/meta-harness'))

    console.log(
      `\n${bold('next — pick a path:')}\n\n` +
        `  ${bold('by hand')}\n` +
        `    edit ${cfg.sourceDir}/ (every file is a commented example), then: meta-harness generate\n\n` +
        `  ${bold('by agent')}${skilled ? '' : dim('  (needs the skill above)')}\n` +
        `    ask any coding agent: "build my harness"\n` +
        `    ...with your requirements inline: "build my harness — claude and codex, stop before payments"\n` +
        `    ...or write ${cfg.sourceDir}/HARNESS.md first and let it build from that\n` +
        `    ...or ask it to interview you if you'd rather be walked through it\n`
    )
    if (fs.existsSync(path.join(root, 'node_modules/@jungsek/meta-harness')))
      console.log(
        yellow(
          'tip: meta-harness is npm-installed locally — the package.json/node_modules here came from that install.\n     For a dependency-free project: npm rm @jungsek/meta-harness && npm i -g @jungsek/meta-harness'
        )
      )
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

if (process.argv.length <= 2) program.help()
program.parse()
