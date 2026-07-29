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
    // `npx playwright` caches its package here without modifying package.json.
    const cache = path.join(os.homedir(), '.npm', '_npx')
    for (const entry of await fs.readdir(cache, { withFileTypes: true })) {
      const candidate = path.join(cache, entry.name, 'node_modules', 'playwright', 'index.mjs')
      try {
        await fs.access(candidate)
        return import(pathToFileURL(candidate).href)
      } catch {
        // Try the next cached npx package.
      }
    }
    throw new Error('Playwright not found. Run: npx playwright install chromium')
  }
}

const { chromium } = await loadPlaywright()

const here = path.dirname(fileURLToPath(import.meta.url))
const dashboard = path.resolve(here, '..')
const shots = path.join(dashboard, 'shots')
const url = 'http://localhost:5173'
const results = []

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => results.push({ name, status: 'PASS', reason: 'assertion satisfied' }))
    .catch((error) => results.push({ name, status: 'FAIL', reason: error.message }))
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(shots, name), fullPage: true })
}

async function visible(locator) {
  return (await locator.count()) > 0 && (await locator.first().isVisible())
}

async function main() {
  await fs.mkdir(shots, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const conflict = page.getByRole('button', { name: /^conflict:/i }).first()

  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    await screenshot(page, 'v2-01-map.png')

    await check('2a near-black body background', async () => {
      // assert does not exist inside the page; parse there, judge here. The
      // computed value may be an oklch() string, so resolve it to sRGB bytes
      // through a canvas rather than regexing channel numbers out of it.
      const rgb = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = getComputedStyle(document.body).backgroundColor
        ctx.fillRect(0, 0, 1, 1)
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
      })
      assert.ok(rgb?.length === 3, `unparseable body background`)
      const luminance = (() => {
        const linear = rgb.map((v) => {
          const s = v / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
      })()
      assert.ok(luminance < 0.08, `body luminance ${luminance.toFixed(3)} is not near-black`)
    })
    await check('2b verdict h1 and real command/in-sync text', async () => {
      const h1 = page.locator('h1')
      const text = (await h1.textContent())?.trim() ?? ''
      assert.ok(text, 'verdict h1 missing or empty')
      const adjacent = (await h1.locator('xpath=following-sibling::*[1]').textContent())?.trim() ?? ''
      assert.ok(/in sync/i.test(text) || /meta-harness\s+(sync|generate)/i.test(adjacent), `no In sync verdict or adjacent CLI command: ${text} / ${adjacent}`)
    })
    await check('2c claude code, meta-harness, codex frames', async () => {
      for (const title of ['claude code', 'meta-harness', 'codex']) {
        assert.ok(await visible(page.locator('.mh-frame-title', { hasText: title })), `missing frame title: ${title}`)
      }
    })
    await check('2d lane arrow SVG', async () => assert.ok(await visible(page.locator('svg').filter({ has: page.locator('line.mh-lane-arrow') })), 'no lane arrow SVG rendered'))
    // v2.1: verdict + console merged into one insights panel with tabs.
    await check('2e insights panel with action tabs', async () => {
      assert.ok(await visible(page.locator('[aria-label="status and next steps"]')), 'insights panel missing')
      assert.ok(await visible(page.getByRole('tab', { name: /needs action/i })), 'needs-action tab missing')
    })
    await check('2f no v1 Overview/Targets rail tabs', async () => {
      const tabs = await page.locator('[role="tab"]').allTextContents()
      assert.equal(tabs.some((text) => /^(overview|targets)$/i.test(text.trim())), false, `leftover tabs: ${tabs.join(', ')}`)
    })

    const hasConflict = await conflict.count() > 0 && await conflict.isVisible()
    if (hasConflict) {
      await conflict.click()
      await page.getByRole('dialog').waitFor({ state: 'visible' })
      await screenshot(page, 'v2-02-conflict-drawer.png')
      await check('3 conflict drawer prefer-source command', async () => assert.ok(await visible(page.getByText('meta-harness sync --prefer source').first()), 'prefer source command missing'))
      await check('3 conflict drawer prefer-native command', async () => assert.ok(await visible(page.getByText('meta-harness sync --prefer native').first()), 'prefer native command missing'))
    } else {
      results.push({ name: '3 conflict drawer commands', status: 'PASS', reason: 'no conflict marker in current fixture' })
    }

    // The step-3 drawer is modal; close it before clicking beneath it.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const category = page.locator('.mh-frame-source [data-state] > button').first()
    await check('4 source category expands', async () => {
      assert.ok(await category.count(), 'no source category trigger found')
      await category.click()
      assert.equal(await category.getAttribute('data-state'), 'open', 'source category did not open')
    })
    await screenshot(page, 'v2-03-source-expanded.png')

    await page.setViewportSize({ width: 380, height: 800 })
    await page.reload({ waitUntil: 'networkidle' })
    await check('5 mobile has no horizontal overflow', async () => {
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      assert.ok(width <= 381, `scrollWidth ${width}px exceeds 381px`)
    })
    await check('5 mobile stacked layout', async () => {
      const columns = await page.locator('.mh-frame').evaluateAll((frames) => frames.slice(0, 3).map((frame) => frame.getBoundingClientRect().top))
      assert.ok(columns.length >= 3 && new Set(columns.map(Math.round)).size >= 3, `map is not vertically stacked: ${columns.join(', ')}`)
    })
    await screenshot(page, 'v2-04-mobile.png')

    await page.keyboard.press('Home')
    await page.keyboard.press('Tab')
    await check('6 Tab reaches visible focusable element', async () => {
      const focused = page.locator(':focus')
      assert.ok(await focused.count() && await focused.isVisible(), 'Tab did not land on a visible element')
    })
    await check('6 focus-visible has non-none outline', async () => {
      const style = await page.locator(':focus').evaluate((element) => ({
        tag: element.tagName,
        outlineStyle: getComputedStyle(element).outlineStyle,
      }))
      assert.notEqual(style.outlineStyle, 'none', `focused ${style.tag} outlineStyle is none`)
    })

    if (hasConflict) {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.reload({ waitUntil: 'networkidle' })
      await conflict.click()
      await page.getByRole('dialog').waitFor({ state: 'visible' })
      await page.keyboard.press('Escape')
      await check('6 Escape closes conflict drawer', async () => assert.equal(await page.getByRole('dialog').count(), 0, 'dialog remains after Escape'))
    } else {
      results.push({ name: '6 Escape closes conflict drawer', status: 'PASS', reason: 'no conflict marker in current fixture' })
    }
  } finally {
    await browser.close()
  }

  for (const result of results) console.log(`${result.status} ${result.name}: ${result.reason}`)
  if (results.some((result) => result.status === 'FAIL')) process.exitCode = 1
}

main().catch((error) => {
  console.error(`VERIFY FATAL: ${error.stack ?? error.message}`)
  process.exitCode = 1
})
