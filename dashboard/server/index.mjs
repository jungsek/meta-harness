#!/usr/bin/env node
// Plain node:http API server — zero new dependencies, imports the CLI's own
// ESM modules directly (see ../CONTRACT.md). Serves dist/ as static files
// when it exists, with an SPA fallback, so `npm run build && npm start` is a
// single process.

import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { getReference, getRoots, getSnapshot, getStatusPoll, validateRoot } from './collect.mjs'
import { computeDiff } from './diff.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dashboardDir = path.join(__dirname, '..')
const distDir = path.join(dashboardDir, 'dist')

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '4711' },
    root: { type: 'string' },
  },
})

const PORT = Number(values.port)
if (!Number.isInteger(PORT) || PORT <= 0) {
  console.error(`--port must be a positive integer (got "${values.port}")`)
  process.exit(1)
}

// Default root: the repo containing dashboard/ (CONTRACT.md's default).
const DEFAULT_ROOT = path.resolve(values.root ?? path.join(dashboardDir, '..'))
try {
  validateRoot(DEFAULT_ROOT)
} catch (e) {
  console.error(`--root: ${e.message}`)
  process.exit(1)
}

function sendJson(res, statusCode, body) {
  const data = JSON.stringify(body)
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(data)
}

// Contract's one error shape everywhere: {error, detail?} JSON, never HTML.
function sendError(res, statusCode, message, detail) {
  sendJson(res, statusCode, detail === undefined ? { error: message } : { error: message, detail })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function serveStatic(res, pathname) {
  if (!fs.existsSync(distDir)) return sendError(res, 404, 'not found', 'dashboard/dist does not exist — run `npm run build` first')
  const indexHtml = path.join(distDir, 'index.html')
  let abs = path.join(distDir, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''))
  // Any path outside dist (traversal, or simply "not a real asset") falls
  // back to index.html — this is the SPA fallback the contract asks for.
  if (!abs.startsWith(distDir + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) abs = indexHtml
  if (!fs.existsSync(abs)) return sendError(res, 404, 'not found')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] ?? 'application/octet-stream' })
  fs.createReadStream(abs).pipe(res)
}

function rootFromQuery(searchParams) {
  const raw = searchParams.get('root')
  return raw && raw.length ? raw : DEFAULT_ROOT
}

const server = createServer((req, res) => {
  let url
  try {
    url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  } catch {
    return sendError(res, 400, 'invalid URL')
  }
  const { pathname } = url

  try {
    if (req.method !== 'GET') {
      if (pathname.startsWith('/api/')) return sendError(res, 405, `method not allowed: ${req.method}`)
      return serveStatic(res, pathname)
    }

    if (pathname === '/api/snapshot') {
      const root = rootFromQuery(url.searchParams)
      validateRoot(root)
      return sendJson(res, 200, getSnapshot(root))
    }
    if (pathname === '/api/status') {
      const root = rootFromQuery(url.searchParams)
      validateRoot(root)
      return sendJson(res, 200, getStatusPoll(root))
    }
    if (pathname === '/api/diff') {
      const root = rootFromQuery(url.searchParams)
      validateRoot(root)
      const rel = url.searchParams.get('path')
      if (!rel) return sendError(res, 400, 'path query parameter is required')
      const diff = computeDiff(root, rel) // read-only — recomputes expected bytes, never writes
      if (diff.error) return sendJson(res, 404, diff)
      return sendJson(res, 200, diff)
    }
    if (pathname === '/api/reference') return sendJson(res, 200, getReference())
    if (pathname === '/api/roots') return sendJson(res, 200, getRoots(DEFAULT_ROOT, dashboardDir))
    if (pathname.startsWith('/api/')) return sendError(res, 404, `unknown endpoint: ${pathname}`)

    return serveStatic(res, pathname)
  } catch (e) {
    // validateRoot marks its own rejections with .status = 400 (the caller's
    // fault). Anything else — a collect.mjs bug, a corrupt manifest that
    // couldn't be swallowed honestly, an fs error — is unmarked and treated
    // as the server's fault, not the caller's.
    sendError(res, e.status ?? 500, e.message)
  }
})

server.listen(PORT, () => {
  console.log(`meta-harness dashboard API listening on http://127.0.0.1:${PORT}`)
  console.log(`default root: ${DEFAULT_ROOT}`)
})
