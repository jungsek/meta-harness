#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { program } from 'commander'
import { detectTargets, detectedNames } from '../src/detect.js'
import { DEFAULT_TARGETS, generate, loadConfig, status, uninstall } from '../src/engine.js'
import { CATEGORIES, TARGETS, explain, explainTarget } from '../src/explain.js'
import { loadModel } from '../src/model.js'
import { show } from '../src/show.js'
import { syncApply, syncPlan } from '../src/sync.js'
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
  .description('your agent setup, in every agent — one source dir, kept in sync with native config')
  .version(pkg.version, '-v, --version')
  .addHelpText(
    'after',
    `
Examples:
  meta-harness sync                          reconcile native config ↔ source, emit to every target
  meta-harness sync --dry-run                preview the plan, write nothing
  meta-harness init                          scaffold .meta-harness/ with commented examples
  meta-harness generate                      compile for all enabled targets
  meta-harness generate --check              CI drift gate (exit 1 if stale or hand-edited)
  meta-harness generate -t cursor --only rules   partial run (never prunes)
  meta-harness status                        per-output: clean / EDITED / MISSING`
  )

const csv = (v) => v.split(',').map((s) => s.trim()).filter(Boolean)

// Renders the SYNC-PLAN §3 report shape: ← import / → generate / = clean,
// grouped by target, +/~/-/! legend (new / changed / removed / conflict).
// Tolerant of plan.generates/clean being either plain strings or
// {target, ...} objects — the exact shape settles with src/sync.js; see
// w2.status for the assumption this locks in.
function groupByTarget(items) {
  const groups = new Map()
  for (const item of items) {
    const target = typeof item === 'string' ? '' : (item.target ?? '')
    if (!groups.has(target)) groups.set(target, [])
    groups.get(target).push(item)
  }
  return groups
}

// Conflict values are whatever the source/native item actually is — a
// string for simple settings, an object for hook entries, MCP server
// defs, permission blocks. Only strings render as themselves; anything
// else is JSON.stringify'd so both sides of a conflict are always legible,
// never "[object Object]".
function renderConflictValue(label, value, dim) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  const [first, ...rest] = text.split('\n')
  const lines = [`             ${dim(label)} ${first}`]
  for (const l of rest) lines.push(`                    ${l}`)
  return lines
}

function renderSyncPlan(plan, c) {
  const { dim, bold, yellow, red, green } = c
  const lines = [bold('sync plan')]

  if (plan.imports?.length) {
    lines.push(`  ${dim('←')} import`)
    for (const [target, items] of groupByTarget(plan.imports)) {
      items.forEach((item, i) => {
        const mark = item.kind === 'new' ? green('+') : item.kind === 'removed' ? red('-') : yellow('~')
        const label = (i === 0 ? target : '').padEnd(8)
        const detail = item.detail ? ` ${dim(`(${item.detail})`)}` : ''
        lines.push(`    ${label} ${String(item.category ?? '').padEnd(12)} ${mark} ${item.name}${detail}`)
      })
    }
  }

  if (plan.conflicts?.length) {
    lines.push(`  ${red('!')} conflicts`)
    for (const cf of plan.conflicts) {
      const fatalNote = cf.fatal ? ` ${red('(fatal — no --prefer resolves this)')}` : ''
      lines.push(`    ${cf.target.padEnd(8)} ${cf.category}/${cf.name}${fatalNote}`)
      if (cf.sides) {
        // Two natives disagreeing — there is no source side (§ contract:
        // `source: null` on these), so show one row per native instead of
        // the usual source/native pair.
        for (const side of cf.sides) lines.push(...renderConflictValue(side.target, side.value, dim))
      } else {
        lines.push(...renderConflictValue('source', cf.source, dim))
        lines.push(...renderConflictValue('native', cf.native, dim))
      }
    }
    if (plan.conflicts.some((cf) => !cf.fatal)) lines.push(`    ${dim('resolve with --prefer native|source')}`)
  }

  if (plan.unsupported?.length) {
    lines.push(`  ${yellow('?')} unsupported`)
    for (const u of plan.unsupported) {
      const mark = u.fatal ? red('!') : dim('·')
      lines.push(`    ${mark} ${u.target.padEnd(8)} ${u.path}  ${dim(u.reason)}`)
    }
  }

  if (plan.generates?.length) {
    lines.push(`  ${dim('→')} generate`)
    for (const [target, items] of groupByTarget(plan.generates)) {
      const paths = items.map((i) => (typeof i === 'string' ? i : (i.path ?? i.name))).join('  ')
      lines.push(`    ${target.padEnd(8)} ${paths}`)
    }
  }

  if (plan.clean?.length) {
    lines.push(`  = clean`)
    for (const [target, items] of groupByTarget(plan.clean)) {
      const names = items.map((i) => (typeof i === 'string' ? i : (i.category ?? i.name))).join(' ')
      lines.push(`    ${dim(target.padEnd(8))} ${dim(names)}`)
    }
  }

  return lines.join('\n')
}

// SYNC-PLAN §3: --json mirrors {imported, generated, clean, conflicts,
// unsupported} — the internal plan uses imports/generates (matching the
// scan/classify vocabulary), renamed here at the JSON boundary only.
// sourceWrites/scanned are apply-internal (full file bodies, raw scan list)
// and never belong in a machine-readable feed — dropped, not renamed.
function planForJson(plan) {
  const { imports, generates, clean, conflicts, unsupported, mode, targets, warnings } = plan
  return { imported: imports, generated: generates, clean, conflicts, unsupported, mode, targets, warnings }
}

// 'shared' is a file-ownership label (AGENTS.md/CLAUDE.md/.mcp.json), not a
// target a user recognizes — excluded from the headline's target list.
function bootstrapBanner(plan, bold) {
  const found = [...new Set((plan.imports ?? []).map((i) => i.target))].filter((t) => t !== 'shared')
  console.log(bold(`no source dir — importing from ${found.length ? found.join(', ') : 'detected targets'} and building one`))
}

program
  .command('sync')
  .description('reconcile native agent config ↔ source, emit to every target')
  .option('--dry-run', 'preview the plan; write nothing')
  .option('--json', 'machine-readable output — mirrors the plan object')
  .option('--prefer <side>', 'resolve conflicts: native or source')
  .option('-t, --targets <names>', 'comma-separated targets (default: config or detected)', csv)
  .action((opts) => {
    if (opts.prefer && opts.prefer !== 'native' && opts.prefer !== 'source') {
      console.error(red(`--prefer must be "native" or "source" (got "${opts.prefer}")`))
      process.exit(1)
    }
    const syncOpts = { targets: opts.targets ?? null, prefer: opts.prefer ?? null }
    try {
      if (opts.dryRun) {
        const plan = syncPlan(root, syncOpts)
        if (opts.json) console.log(JSON.stringify(planForJson(plan), null, 2))
        else {
          if (plan.mode === 'bootstrap') bootstrapBanner(plan, bold)
          console.log(renderSyncPlan(plan, { dim, bold, yellow, red, green }))
        }
        if (plan.conflicts?.length) process.exit(1)
      } else {
        const res = syncApply(root, syncOpts)
        if (opts.json) console.log(JSON.stringify({ ...res, plan: planForJson(res.plan) }, null, 2))
        else {
          if (res.plan?.mode === 'bootstrap') bootstrapBanner(res.plan, bold)
          console.log(renderSyncPlan(res.plan, { dim, bold, yellow, red, green }))
          for (const w of res.warnings ?? []) console.warn(yellow(`warn: ${w}`))
          console.log(`${green('✔')} synced — ${(res.written ?? []).length} written · ${(res.pruned ?? []).length} pruned`)
        }
      }
    } catch (e) {
      if (e.conflicts) {
        // Fatal items (two natives disagreeing, or an untranslatable native
        // value) throw with both attached — §7.3 needs the unsupported side
        // visible too, not just conflicts.
        if (opts.json)
          console.log(JSON.stringify({ error: e.message, conflicts: e.conflicts, unsupported: e.unsupported ?? [] }, null, 2))
        else {
          console.error(red(e.message))
          console.log(renderSyncPlan({ conflicts: e.conflicts, unsupported: e.unsupported ?? [] }, { dim, bold, yellow, red, green }))
        }
        process.exit(1)
      }
      if (opts.json) console.log(JSON.stringify({ error: e.message }))
      else console.error(red(e.message))
      process.exit(1)
    }
  })

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
      if (!bad.length) console.log(green(`✔ all clean (${rows.length} outputs)`))
      else {
        const edited = bad.filter((r) => r.state === 'EDITED').length
        // MISSING just needs a rebuild; EDITED means someone's work is at stake.
        const fix = edited
          ? 'port those changes into the source, then: meta-harness generate --force'
          : 'rebuild them: meta-harness generate'
        console.log(red(`✘ ${bad.length} of ${rows.length} outputs need attention — ${fix}`))
      }
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

// The agent-facing skills are installed by `skills`, which owns skills dirs
// and skills-lock.json — meta-harness delegates rather than writing them
// itself.
function installSkill(name) {
  const repo = (pkg.repository?.url ?? '').replace(/^git\+|\.git$/g, '').replace(/^https:\/\/github\.com\//, '')
  if (!repo) return false
  console.log(dim(`installing the ${name} skill via: npx skills add ${repo} --skill ${name}`))
  const r = spawnSync('npx', ['-y', 'skills', 'add', repo, '--skill', name, '-y'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (r.status !== 0) return false
  // `skills add` mirrors a skill into .claude/skills/ only when it detects a
  // Claude agent driving the terminal — from Codex, a plain shell, or CI it
  // writes .agents/skills/ alone, which Claude Code does not read. Ensure the
  // mirror ourselves so the skill works in every runtime regardless of where
  // init ran. (Codex reads .agents/skills natively; no mirror needed there.)
  const skillDir = path.join(root, `.agents/skills/${name}`)
  const mirror = path.join(root, `.claude/skills/${name}`)
  if (fs.existsSync(skillDir) && !fs.existsSync(mirror)) {
    fs.mkdirSync(path.dirname(mirror), { recursive: true })
    fs.symlinkSync(path.relative(path.dirname(mirror), skillDir), mirror)
    console.log(dim(`linked .claude/skills/${name} → .agents/skills/${name} (Claude does not read .agents)`))
  }
  return r.status === 0
}

program
  .command('show')
  .description('what this harness contains, read from the source (always accurate)')
  .action(() => {
    const cfg = loadConfig(root)
    try {
      console.log(show(loadModel(path.join(root, cfg.sourceDir)), cfg, bold))
    } catch (e) {
      console.error(red(e.message))
      process.exit(1)
    }
  })

program
  .command('explain')
  .argument('[name]', 'a category (rules, agents, hooks, …) or a target (claude, codex, cursor, …)')
  .description('print the source file shape for a category, or the managed surfaces + measured nuances for a target')
  .action((name) => {
    if (!name) {
      console.log('categories:')
      for (const [k, c] of Object.entries(CATEGORIES)) console.log(`  ${bold(k.padEnd(12))} ${c.what}`)
      console.log('\ntargets:')
      for (const k of Object.keys(TARGETS)) console.log(`  ${bold(k)}`)
      console.log(`\n${dim('meta-harness explain <category|target>')}`)
      return
    }
    const text = explain(name, bold) ?? explainTarget(name, bold, dim)
    if (!text) {
      console.error(
        red(`unknown name "${name}" (categories: ${Object.keys(CATEGORIES).join(' ')}; targets: ${Object.keys(TARGETS).join(' ')})`)
      )
      process.exit(1)
    }
    console.log(text)
  })

program
  .command('init')
  .description('scaffold the source dir + config, install the agent skill (idempotent)')
  .option('--no-skill', 'skip installing the agent skill (no network calls)')
  .option('-t, --targets <names>', 'targets to write into the config (skips detection)', csv)
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
      // Pick targets: explicit flag > detection (repo config dirs union
      // binaries on PATH) > the stock default. Deterministic, never prompts.
      let chosen = opts.targets ?? null
      if (!chosen) {
        const rows = detectTargets(root)
        const found = detectedNames(rows)
        console.log('detecting targets…')
        for (const r of rows) {
          const evidence = [...r.repo.map((p) => `${p} in repo`), ...(r.bin ? [`${r.bin} on PATH`] : [])]
          const hit = evidence.length > 0
          console.log(`  ${(hit ? green('✔') : dim('—'))} ${r.target.padEnd(9)} ${hit ? evidence.join(' · ') : dim('nothing found')}`)
        }
        chosen = found.length ? found : cfg.targets
        if (!found.length) console.log(dim(`  nothing detected — defaulting to ${cfg.targets.join(', ')}`))
      }
      fs.writeFileSync(
        cfgPath,
        `{\n  // source-of-truth directory\n  "sourceDir": "${cfg.sourceDir}",\n  // targets to generate (see: meta-harness targets); "*" = all\n  "targets": ${JSON.stringify(chosen)}\n}\n`
      )
      console.log(`targets: ${JSON.stringify(chosen)}   ${dim('(edit meta-harness.jsonc, or: init --targets a,b)')}`)
      created++
    } else if (opts.targets) {
      console.warn(yellow('warn: meta-harness.jsonc already exists — --targets ignored, edit the file instead'))
    }
    if (created) console.log(green(`✔ initialized ${cfg.sourceDir}/ (${created} files)`))
    else console.log(`${cfg.sourceDir}/ already initialized`)

    const skilled = opts.skill ? installSkill('meta-harness') : false
    if (opts.skill && !skilled)
      console.warn(yellow('warn: could not install the meta-harness skill — run it yourself:\n      npx skills add jungsek/meta-harness --skill meta-harness'))
    const auditSkilled = opts.skill ? installSkill('meta-harness-audit') : false
    if (opts.skill && !auditSkilled)
      console.warn(yellow('warn: could not install the meta-harness-audit skill — run it yourself:\n      npx skills add jungsek/meta-harness --skill meta-harness-audit'))

    console.log(
      `\n${bold('next — pick a path:')}\n\n` +
        `  ${bold('by hand')}\n` +
        `    edit ${cfg.sourceDir}/ (every file is a commented example), then: meta-harness generate\n\n` +
        `  ${bold('by agent')}${skilled ? '' : dim('  (needs the skill above)')}\n` +
        `    ask any coding agent: "build my harness"\n` +
        `    ...with your requirements inline: "build my harness — claude and codex, stop before payments"\n` +
        `    ...or sketch it in ${cfg.sourceDir}/HARNESS-INIT.md first and let it build from that\n` +
        `    ...or ask it to interview you if you'd rather be walked through it\n\n` +
        `  ${bold('invoking the skill')}\n` +
        `    Claude Code: /meta-harness · Codex: $meta-harness or plain words (no slash —\n` +
        `    and Codex only sees project skills after you accept its directory-trust prompt)\n`
    )
    if (fs.existsSync(path.join(root, 'node_modules/@jungsek/meta-harness')))
      console.log(
        yellow(
          'tip: meta-harness is npm-installed locally — the package.json/node_modules here came from that install.\n     For a dependency-free project: npm rm @jungsek/meta-harness && npm i -g @jungsek/meta-harness'
        )
      )
  })

program
  .command('uninstall')
  .description('remove every trace: outputs, source dir, config, installed skill (your prose and foreign keys survive)')
  .option('--force', 'discard hand-edits to generated outputs')
  .option('--check', 'dry-run; list what would be removed')
  .option('--json', 'machine-readable output')
  .action((opts) => {
    try {
      const res = uninstall(root, { force: opts.force, check: opts.check })
      if (opts.json) {
        console.log(JSON.stringify(res, null, 2))
      } else {
        for (const w of res.warnings) console.warn(yellow(`warn: ${w}`))
        const verb = opts.check ? 'would remove' : 'removed'
        for (const p of res.pruned) console.log(`  ${red(verb.padEnd(12))} ${p}`)
        console.log(`${green('✔')} ${res.pruned.length} ${verb}`)
      }
    } catch (e) {
      if (opts.json) console.log(JSON.stringify({ error: e.message, drifted: e.drifted ?? [] }))
      else console.error(red(e.message))
      process.exit(1)
    }
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
