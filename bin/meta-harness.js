#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { program } from 'commander'
import { detectTargets, splitDetected } from '../src/detect.js'
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
  .description('one setup, every coding agent — import your Claude Code config into Codex (and back), one source of truth')
  .version(pkg.version, '-v, --version')
  .addHelpText(
    'after',
    `
Start here:
  meta-harness sync              import your Claude Code setup into Codex — and back
  meta-harness sync --dry-run    preview the plan, write nothing
  meta-harness status            is everything still in sync?

  Keep editing whichever tool you live in and run sync again whenever you like:
  hand edits fold back into the source and reach every other agent.

Starting fresh / power use:
  meta-harness init              scaffold .meta-harness/ + the agent skills, nothing imported
  meta-harness generate          compile the source, no import step
  meta-harness generate --check  CI drift gate (exit 1 if stale or hand-edited)

Targets default to claude and codex. cursor, opencode and hermes are
experimental and one-way — enable them with --targets or meta-harness.jsonc.`
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

function renderSyncPlan(plan, c, prefer) {
  const { dim, bold, yellow, red, green } = c
  const lines = [bold('sync plan')]

  if (plan.imports?.length) {
    lines.push(`  ${dim('←')} import`)
    for (const [target, items] of groupByTarget(plan.imports)) {
      items.forEach((item, i) => {
        const mark = item.kind === 'new' ? green('+') : item.kind === 'removed' ? red('-') : yellow('~')
        const label = (i === 0 ? target : '').padEnd(8)
        // In bootstrap every single item is "(unmanaged)" — a column of the same
        // word teaches nothing on the one run that matters most.
        const detail = item.detail && plan.mode !== 'bootstrap' ? ` ${dim(`(${item.detail})`)}` : ''
        lines.push(`    ${label} ${String(item.category ?? '').padEnd(12)} ${mark} ${item.name}${detail}`)
      })
    }
  }

  if (plan.conflicts?.length) {
    // With --prefer the run continues, so the header has to say the
    // conflicts were settled — a bare "! conflicts" above a "✔ synced" reads
    // like something was ignored.
    lines.push(`  ${red('!')} conflicts${prefer ? dim(` — resolved with --prefer ${prefer}: kept the ${prefer} side`) : ''}`)
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
    // The remedy is printed once, under the plan (see syncStopped) — repeating
    // it here made every conflict run say --prefer twice.
  }

  // Files inside a managed dir that aren't definitions (a README in
  // .claude/agents/) are left alone, not imported and not deleted. Reported so
  // the user knows they were seen — never as a failure.
  const skipped = [...(plan.skipped ?? []), ...(plan.unsupported ?? []).filter((u) => u.skipped)]
  if (skipped.length) {
    lines.push(`  ${dim('-')} skipped`)
    for (const s of skipped) lines.push(`    ${dim(`${s.path ?? s.name}  ${s.reason ?? 'not a definition — left in place'}`)}`)
  }

  const unsupported = (plan.unsupported ?? []).filter((u) => !u.skipped)
  if (unsupported.length) {
    lines.push(`  ${yellow('?')} unsupported`)
    for (const u of unsupported) {
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
      // A per-category roll-up, so two clean permissions entries read as
      // "permissions", not "permissions permissions".
      const names = [...new Set(items.map((i) => (typeof i === 'string' ? i : (i.category ?? i.name))))].join(' ')
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
// target a user recognizes — excluded from both target lists in the headline.
const realTargets = (items) => [...new Set((items ?? []).map((i) => i.target))].filter((t) => t && t !== 'shared')

function bootstrapBanner(plan, cfg, bold, dim) {
  const from = realTargets(plan.imports)
  const to = realTargets(plan.generates)
  const src = cfg.sourceDir
  console.log(
    bold(
      `importing your ${from.length ? from.join(' + ') : 'existing'} setup → building ${src}/ → emitting ${to.length ? to.join(', ') : 'every target'}`
    )
  )
  console.log(dim(`${src}/ becomes the source of truth; every target is generated from it.\n`))
}

// Neither tool reads project config until you have accepted its trust prompt —
// the single most common "I ran it and nothing happened". Printed as steps,
// not as warnings buried in a warn: stream.
const TRUST_STEPS = {
  codex: ['open codex here, accept the directory-trust prompt', 'then run /hooks and accept — until you do, hooks and deny rules quietly do nothing'],
  claude: ['open claude here, accept the folder-trust prompt — project settings, hooks and permissions load after it'],
}

// The trust warnings the next: block now says better. Matched narrowly (codex
// prefix + trust wording) so any other codex warning still prints.
const coveredByNext = (w, targets) => targets.some((t) => w.startsWith(`${t}: `)) && /trust/.test(w)

function printWarnings(warnings, targets, yellow) {
  for (const w of new Set(warnings ?? [])) if (!coveredByNext(w, targets)) console.warn(yellow(`warn: ${w}`))
}

function printNext(targets, { bold, dim }) {
  const steps = targets.filter((t) => TRUST_STEPS[t])
  if (!steps.length) return
  console.log(`\n${bold('next:')}`)
  for (const t of steps) {
    const [first, ...rest] = TRUST_STEPS[t]
    console.log(`  ${bold(t.padEnd(7))} ${first}`)
    for (const r of rest) console.log(`  ${' '.repeat(7)} ${r}`)
  }
  console.log(`  ${dim('then    keep editing whichever tool you live in — run `meta-harness sync` again to fold it back')}`)
}

// A conflict is a fork, not a dead end: both exits are printed, and they are
// the last thing on screen because that is what the user acts on.
function syncStopped(conflicts = [], unsupported = [], sourceDir = '.meta-harness') {
  const resolvable = conflicts.filter((c) => !c.fatal)
  const stuck = [...conflicts.filter((c) => c.fatal), ...unsupported.filter((u) => u.fatal && !u.skipped)]
  console.error(red(`\nsync stopped — nothing was written.`))
  if (resolvable.length) {
    const n = resolvable.length
    console.error(`  ${n} item${n > 1 ? 's' : ''} changed in the source AND in the tool (both shown above). Pick a side:`)
    console.error(`    meta-harness sync --prefer native   ${dim('keep what the tool has now')}`)
    console.error(`    meta-harness sync --prefer source   ${dim(`keep what ${sourceDir}/ has`)}`)
    console.error(dim(`  --prefer applies to every conflict in the run; edit ${sourceDir}/ by hand to settle them one at a time.`))
  }
  if (stuck.length)
    console.error(
      `  ${stuck.length} item${stuck.length > 1 ? 's' : ''} above cannot be translated — leave ${stuck.length > 1 ? 'them' : 'it'} in place (nothing was lost), or move ${stuck.length > 1 ? 'them' : 'it'} out of the file named above and run sync again.`
    )
}

// Drift is the refusal people hit first, and --force is the only exit the raw
// error names. sync is the exit that KEEPS their work, so it leads; --force
// goes last with its cost stated.
function driftedRefusal(e, cmd) {
  const adopting = /did not write/.test(e.message)
  console.error(
    red(
      adopting
        ? `${cmd} stopped — these files exist already and meta-harness did not write them:`
        : `${cmd} stopped — these outputs were hand-edited since the last run:`
    )
  )
  for (const p of e.drifted) console.error(`  ${p}`)
  if (cmd === 'uninstall') {
    console.error(`\n  keep those edits:  copy the files above out of the repo first ${dim('(uninstall removes them either way)')}`)
    console.error(`  remove anyway:     meta-harness uninstall --force   ${dim('deletes them along with everything else')}`)
    return
  }
  console.error(
    `\n  keep those edits:  ${bold('meta-harness sync')}   ${dim(adopting ? 'imports them into the source, then re-emits everywhere' : 'folds them back into the source, then re-emits everywhere')}`
  )
  console.error(`  discard them:      meta-harness ${cmd} --force   ${dim('overwrites the files listed above — the edits are gone')}`)
}

// Detected but deliberately not enabled (V1-FOCUS §1): one dim FYI line, never
// an emitted tree. The plan carries its own proposed list in bootstrap mode;
// outside it we ask detection directly.
function printProposed(root, enabled, planProposed, dim) {
  const proposed = planProposed ?? splitDetected(detectTargets(root)).proposed
  const extra = [...new Set(proposed)].filter((t) => !enabled.includes(t))
  if (extra.length)
    console.log(dim(`also detected: ${extra.join(', ')} — not enabled (experimental, one-way); add with --targets ${extra.join(',')} or meta-harness.jsonc`))
}

// F4: an empty repo has nothing to import and no source to compile. Say that,
// don't fail with "source dir not found" as if the user did something wrong.
function nothingToImport(root, cfg, bold, dim) {
  if (fs.existsSync(path.join(root, cfg.sourceDir))) return false
  const native = detectTargets(root).some((r) => r.repo.length)
  const shared = ['CLAUDE.md', 'AGENTS.md', '.mcp.json'].some((f) => fs.existsSync(path.join(root, f)))
  if (native || shared) return false
  console.log(bold('nothing to import here — no agent config found'))
  console.log(
    `\nStarting fresh?\n` +
      `  meta-harness init${dim('        scaffold ' + cfg.sourceDir + '/ with commented examples, install the agent skills')}\n` +
      `  ${dim('…or ask your coding agent: "build my harness"')}\n\n` +
      dim(`Already have a setup in another checkout? run sync there — this is a project-scoped tool.`)
  )
  return true
}

program
  .command('sync')
  .description('start here — import your setup into every agent, both directions')
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
    const cfg = loadConfig(root)
    if (!opts.json && nothingToImport(root, cfg, bold, dim)) return
    try {
      if (opts.dryRun) {
        const plan = syncPlan(root, syncOpts)
        if (opts.json) console.log(JSON.stringify(planForJson(plan), null, 2))
        else {
          if (plan.mode === 'bootstrap') bootstrapBanner(plan, cfg, bold, dim)
          console.log(renderSyncPlan(plan, { dim, bold, yellow, red, green }))
          const emitted = realTargets(plan.generates)
          printWarnings(plan.warnings, emitted, yellow)
          printProposed(root, emitted, plan.proposed, dim)
          if (plan.conflicts?.length) syncStopped(plan.conflicts, plan.unsupported ?? [], cfg.sourceDir)
          else console.log(dim('\nnothing written (--dry-run) — run `meta-harness sync` to apply this plan'))
        }
        if (plan.conflicts?.length) process.exit(1)
      } else {
        const res = syncApply(root, syncOpts)
        if (opts.json) console.log(JSON.stringify({ ...res, plan: planForJson(res.plan) }, null, 2))
        else {
          if (res.plan?.mode === 'bootstrap') bootstrapBanner(res.plan, cfg, bold, dim)
          console.log(renderSyncPlan(res.plan, { dim, bold, yellow, red, green }, opts.prefer))
          const emitted = realTargets(res.plan?.generates)
          printWarnings(res.warnings, emitted, yellow)
          printProposed(root, emitted, res.plan?.proposed, dim)
          const written = res.written ?? []
          console.log(
            `${green('✔')} synced — ${written.length} file${written.length === 1 ? '' : 's'} written` +
              ((res.pruned ?? []).length ? ` · ${res.pruned.length} pruned` : '')
          )
          // Cold-start story: a bootstrap sync should leave the agent skills
          // installed too, same as init. Best-effort — a failed install never
          // fails the sync.
          if (res.plan?.mode === 'bootstrap') {
            const missing = ['meta-harness', 'mh-sync', 'mh-generate', 'mh-status', 'mh-audit'].filter(
              (s) => !fs.existsSync(path.join(root, `.agents/skills/${s}`))
            )
            if (missing.length) console.log(dim('  adding the agent skills — /mh-sync /mh-status /mh-audit in Claude, $-prefixed in Codex'))
            for (const s of missing) installSkill(s)
          }
          // Trust prompts are a first-run story. Repeating them on every routine
          // sync trains people to skim the block that matters once.
          if (res.plan?.mode === 'bootstrap' && written.length) printNext(emitted, { bold, dim })
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
          // Plan first, verdict last: the last line on screen is the one the
          // user acts on, so it has to be the remedy, not the header.
          console.log(renderSyncPlan({ conflicts: e.conflicts, unsupported: e.unsupported ?? [] }, { dim, bold, yellow, red, green }))
          syncStopped(e.conflicts, e.unsupported ?? [], cfg.sourceDir)
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
  .description('compile the source dir into native config (no import step)')
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
      else if (e.drifted?.length) driftedRefusal(e, 'generate')
      else console.error(red(e.message))
      process.exit(1)
    }
  })

program
  .command('status')
  .description('is everything still in sync? clean / EDITED / MISSING per output')
  .option('--json', 'machine-readable output')
  .action((opts) => {
    const rows = status(root)
    const bad = rows.filter((r) => r.state !== 'clean' && r.state !== 'link')
    if (opts.json) console.log(JSON.stringify(rows, null, 2))
    else if (rows.length === 0) console.log(`no harness here yet — run: ${bold('meta-harness sync')} (imports what you already have) or meta-harness init`)
    else {
      for (const r of rows) {
        const color = r.state === 'clean' ? dim : r.state === 'link' ? dim : red
        console.log(`  ${color(r.state.padEnd(8))} ${r.path}`)
      }
      // "link" is the one state whose name doesn't explain itself.
      if (rows.some((r) => r.state === 'link')) console.log(dim('  link = symlinked to the source file (identical bytes)'))
      if (!bad.length) console.log(green(`✔ all clean (${rows.length} outputs)`))
      else {
        const edited = bad.filter((r) => r.state === 'EDITED').length
        // MISSING just needs a rebuild; EDITED means someone's work is at stake
        // — sync keeps it, so sync is what we name.
        const fix = edited
          ? `keep those edits: ${bold('meta-harness sync')} (folds them back into the source)`
          : 'rebuild them: meta-harness generate'
        console.log(red(`✘ ${bad.length} of ${rows.length} outputs need attention`) + ` — ${fix}`)
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
  // `skills add` prints a full-screen installer report per skill. Five of those
  // buried the sync result that the user actually ran the command for — so it
  // is captured, and only the one-line outcome is shown (stderr surfaces on
  // failure, where the detail matters).
  process.stdout.write(dim(`  installing skill ${name} …`))
  const r = spawnSync('npx', ['-y', 'skills', 'add', repo, '--skill', name, '-y'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    console.log(red(' failed'))
    if (r.stderr) console.error(dim(r.stderr.trim().split('\n').slice(-3).join('\n')))
    return false
  }
  console.log(green(' ✔'))
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
  }
  return r.status === 0
}

program
  .command('show')
  .description('what this harness contains, read from the source')
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
  .description('the source shape of a category, or a target\'s manual')
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
  .description('starting from scratch: scaffold the source dir + agent skills')
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
        // Only claude/codex auto-enable (V1-FOCUS §1); anything else detected is
        // proposed in one line, never written into the config behind your back.
        const { enabled, proposed } = splitDetected(rows)
        console.log('detecting targets…')
        for (const r of rows) {
          if (!DEFAULT_TARGETS.includes(r.target)) continue
          const evidence = [...r.repo.map((p) => `${p} in repo`), ...(r.bin ? [`${r.bin} on PATH`] : [])]
          const hit = evidence.length > 0
          console.log(`  ${(hit ? green('✔') : dim('—'))} ${r.target.padEnd(9)} ${hit ? evidence.join(' · ') : dim('nothing found')}`)
        }
        chosen = enabled.length ? enabled : cfg.targets
        if (!enabled.length) console.log(dim(`  nothing detected — defaulting to ${cfg.targets.join(', ')}`))
        printProposed(root, chosen, proposed, dim)
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

    // One brain skill + four thin entry-point skills. Skills are the only
    // project-scoped invocation both runtimes resolve (/name in Claude,
    // $name in Codex) — commands would be Claude-only.
    const SKILLS = ['meta-harness', 'mh-sync', 'mh-generate', 'mh-status', 'mh-audit']
    const skilled = opts.skill ? SKILLS.every((s) => installSkill(s)) : false
    if (opts.skill && !skilled)
      console.warn(yellow('warn: could not install the agent skills — run it yourself:\n      npx skills add jungsek/meta-harness'))

    console.log(
      `\n${bold('next — pick a path:')}\n\n` +
        `  ${bold('by hand')}\n` +
        `    edit ${cfg.sourceDir}/ (every file is a commented example), then: meta-harness generate\n\n` +
        `  ${bold('by agent')}${skilled ? '' : dim('  (skills not installed — npx skills add jungsek/meta-harness)')}\n` +
        `    ask any coding agent: "build my harness"\n` +
        `    ...with your requirements inline: "build my harness — claude and codex, stop before payments"\n` +
        `    ...or sketch it in ${cfg.sourceDir}/HARNESS-INIT.md first and let it build from that\n` +
        `    ...or ask it to interview you if you'd rather be walked through it\n\n` +
        `  ${bold('invoking the skills')}\n` +
        `    build/change: /meta-harness (Claude) · $meta-harness (Codex)\n` +
        `    day-to-day:   /mh-sync /mh-generate /mh-status /mh-audit ($-prefixed in Codex)\n` +
        `    Codex only sees project skills after you accept its directory-trust prompt\n`
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
  .description('remove every trace: outputs, source dir, config, skills')
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
        // Everything above is managed output — including config adopted from
        // the user's original setup on the first sync. Say so once: git is the
        // only way back, and nobody expects to need it after "uninstall".
        if (res.pruned.length)
          console.log(dim('  that includes config adopted from your original setup — `git checkout .` brings it back if you want it'))
        if (opts.check) console.log(dim('  nothing removed (--check) — run `meta-harness uninstall` to do it'))
      }
    } catch (e) {
      if (opts.json) console.log(JSON.stringify({ error: e.message, drifted: e.drifted ?? [] }))
      else if (e.drifted?.length) driftedRefusal(e, 'uninstall')
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
