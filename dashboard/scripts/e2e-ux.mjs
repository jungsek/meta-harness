// End-to-end UX sweep: every interaction, every fixture state, screenshots
// for human judgment + hard assertions for regressions. Run with the API on
// :4711 (demo-drift root) and vite on :5173.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) return import(process.env.PLAYWRIGHT_MODULE)
  try {
    return await import('playwright')
  } catch {
    const cache = path.join(os.homedir(), '.npm', '_npx')
    for (const entry of await fs.readdir(cache, { withFileTypes: true })) {
      const candidate = path.join(cache, entry.name, 'node_modules', 'playwright', 'index.mjs')
      try {
        await fs.access(candidate)
        return import(pathToFileURL(candidate).href)
      } catch {
        // next
      }
    }
    throw new Error('Playwright not found. Run: npx playwright install chromium')
  }
}

const { chromium } = await loadPlaywright()
const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.resolve(here, '..', 'shots', 'e2e')
await fs.mkdir(shots, { recursive: true })
const FIX = path.resolve(here, '..', 'fixtures')

const results = []
async function check(name, fn) {
  try {
    await fn()
    results.push(`PASS ${name}`)
  } catch (err) {
    results.push(`FAIL ${name}: ${String(err.message ?? err).split('\n')[0]}`)
  }
}
const shoot = async (page, name) => page.screenshot({ path: path.join(shots, name), fullPage: false })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') results.push(`CONSOLE-ERROR ${msg.text().slice(0, 140)}`)
})
page.on('pageerror', (err) => results.push(`PAGE-ERROR ${String(err).slice(0, 140)}`))

/* ── 1 · drift state (default root) ─────────────────────────────────── */
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
await shoot(page, '01-drift-map.png')

await check('insights tabs switch and keep content', async () => {
  await page.getByRole('tab', { name: /notes/i }).click()
  assert.ok(await page.getByText(/deleted natively/i).first().isVisible(), 'notes content missing')
  await page.getByRole('tab', { name: /needs action/i }).click()
  assert.ok(await page.getByText(/folder trust/i).first().isVisible(), 'actions content missing')
})
await shoot(page, '02-insights-notes-tab.png')

await check('copy chip copies the verdict command', async () => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.locator('section[aria-label="status and next steps"] button', { hasText: 'copy' }).first().click()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  assert.match(text, /meta-harness sync/, `clipboard got: ${text}`)
})

await check('source item drawer (rules body)', async () => {
  await page.locator('[data-conn="rules"]').click()
  await page.locator('.mh-frame-source button', { hasText: 'guardrails' }).first().click().catch(async () => {
    // fall back to the first item under rules
    await page.locator('.mh-frame-source ul button').first().click()
  })
  assert.ok(await page.locator('[role="dialog"]').isVisible(), 'drawer did not open')
})
await shoot(page, '03-source-item-drawer.png')
await page.keyboard.press('Escape')

await check('arrow drawer explains direction', async () => {
  await page.locator('button[aria-label^="generate"], button[aria-label^="import"]').first().click()
  assert.ok(await page.locator('[role="dialog"]').getByText(/next sync|folding back/i).first().isVisible())
})
await shoot(page, '04-arrow-drawer.png')
await page.keyboard.press('Escape')

await check('conflict drawer diff + both prefer commands', async () => {
  await page.locator('button[aria-label^="conflict"]').first().click()
  const dialog = page.locator('[role="dialog"]')
  assert.ok(await dialog.getByText('meta-harness sync --prefer source').isVisible())
  assert.ok(await dialog.getByText('meta-harness sync --prefer native').isVisible())
})
await shoot(page, '05-conflict-drawer.png')
await page.keyboard.press('Escape')

await check('drifted file opens real content diff', async () => {
  await page.locator('button', { hasText: '.claude/settings.json' }).last().click()
  const table = page.locator('[aria-label^="content diff"]')
  await table.waitFor({ timeout: 5000 })
  const dels = await table.locator('tr').filter({ hasText: 'trace' }).count()
  assert.ok(dels > 0, 'expected the trace→warn diff rows')
})
await shoot(page, '06-diff-view.png')
await page.keyboard.press('Escape')

await check('ghost panel drawer has enable command', async () => {
  await page.locator('button', { hasText: '--targets cursor' }).first().click()
  assert.ok(await page.locator('[role="dialog"]').getByText(/detected but not enabled/i).isVisible())
})
await page.keyboard.press('Escape')

await check('help popover renders reference tables', async () => {
  await page.getByRole('button', { name: 'Reference' }).click()
  assert.ok(await page.getByText(/canonical hook events/i).first().isVisible({ timeout: 4000 }))
})
await shoot(page, '07-help-popover.png')
await page.keyboard.press('Escape')

await check('connector wires draw on category hover', async () => {
  await page.locator('[data-conn="agents"]').hover()
  await page.waitForTimeout(400)
  const wires = await page.locator('.pointer-events-none path').count()
  assert.ok(wires >= 1, `no wires (${wires})`)
})
await shoot(page, '08-connectors.png')

await check('re-scan completes and returns to idle', async () => {
  await page.getByRole('button', { name: /re-scan/i }).click()
  await page.getByRole('button', { name: /^re-scan$/i }).waitFor({ timeout: 15000 })
})

/* ── 2 · clean state (demo-full) ────────────────────────────────────── */
await check('root switch to demo-full shows green verdict', async () => {
  await page.locator('header button', { hasText: 'demo-drift' }).click()
  await page.getByRole('listitem').filter({ hasText: 'demo-full' }).locator('button').click()
  await page.waitForTimeout(1500)
  const h1 = await page.locator('h1').textContent()
  assert.match(h1 ?? '', /in sync/i, `verdict: ${h1}`)
})
await shoot(page, '09-clean-state.png')

/* ── 3 · bootstrap state (demo-bootstrap) ───────────────────────────── */
await check('bootstrap root teaches the first command', async () => {
  await page.locator('header button', { hasText: 'demo-full' }).click()
  await page.getByRole('listitem').filter({ hasText: 'demo-bootstrap' }).locator('button').click()
  await page.waitForTimeout(1500)
  assert.ok(await page.getByText(/npx @jungsek\/meta-harness sync/).first().isVisible(), 'bootstrap teach missing')
})
await shoot(page, '10-bootstrap-state.png')

/* ── 4 · keyboard end-to-end on drift ───────────────────────────────── */
await page.goto(`http://localhost:5173/#root=${encodeURIComponent(path.join(FIX, 'demo-drift'))}`, { waitUntil: 'networkidle' })
await check('keyboard: tab order reaches map, enter opens drawer, escape closes', async () => {
  // Do not start tabbing until the map itself is mounted.
  await page.locator('button', { hasText: '.claude/settings.json' }).last().waitFor({ timeout: 8000 })
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    // Must be the file BUTTON itself — the insights tab panel (tabindex 0)
    // also contains this path inside a gate sentence.
    const isFileBtn = await page.evaluate(() => {
      const el = document.activeElement
      return el?.tagName === 'BUTTON' && (el.textContent ?? '').startsWith('.claude/settings.json')
    })
    if (isFileBtn) break
  }
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  try {
    await page.locator('[role="dialog"]').waitFor({ timeout: 8000 })
  } catch (err) {
    const active = await page.evaluate(() => (document.activeElement?.textContent ?? '(body)').slice(0, 60))
    const dialogs = await page.locator('[role="dialog"]').count()
    throw new Error(`no dialog after Enter — active=${JSON.stringify(active)} dialogs=${dialogs}`)
  }
  await page.keyboard.press('Escape')
  await page.locator('[role="dialog"]').waitFor({ state: 'detached', timeout: 8000 })
})

/* ── 5 · responsive sweep ───────────────────────────────────────────── */
for (const [w, h, name] of [[380, 800, '11-mobile.png'], [768, 900, '12-tablet.png'], [2560, 1200, '13-wide.png']]) {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(500)
  await check(`no horizontal overflow at ${w}px`, async () => {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    assert.ok(sw <= w + 1, `scrollWidth ${sw} > ${w}`)
  })
  await shoot(page, name)
}

/* ── 6 · reduced motion ─────────────────────────────────────────────── */
await check('reduced-motion collapses animations', async () => {
  const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await rm.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  assert.ok(await rm.locator('h1').isVisible(), 'content hidden under reduced motion')
  await rm.close()
})

await browser.close()
for (const r of results) console.log(r)
const fails = results.filter((r) => !r.startsWith('PASS')).length
console.log(`\n${results.length - fails}/${results.length} clean`)
process.exit(fails ? 1 : 0)
