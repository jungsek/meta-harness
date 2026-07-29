/**
 * The single fetch module. Everything the page renders comes through here.
 *
 * Two failure modes, treated differently on purpose:
 *
 *  - **Not reachable** (network error, 404, HTML instead of JSON) — the API
 *    server is not running yet. Fall back to the bundled sample data and say
 *    so in the top bar. The page stays useful.
 *  - **Reachable and refusing** (4xx/5xx with `{ error }`) — that is real
 *    information about the user's repo. Surface it; never paper over it with
 *    sample data.
 */
import { mockReference, mockRoots, mockSnapshot, mockStatus } from '@/lib/mock'
import type { Reference, RootsResponse, Snapshot, StatusPoll } from '@/types'

export type Origin = 'live' | 'sample'

export interface Fetched<T> {
  data: T | null
  origin: Origin
  /** Set only when the server answered and refused. */
  error: string | null
}

function isApiError(value: unknown): value is { error: string; detail?: string } {
  return typeof value === 'object' && value !== null && typeof (value as { error?: unknown }).error === 'string'
}

async function get<T>(path: string, sample: () => T, signal?: AbortSignal): Promise<Fetched<T>> {
  let res: Response
  try {
    res = await fetch(path, { headers: { accept: 'application/json' }, ...(signal ? { signal } : {}) })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return { data: sample(), origin: 'sample', error: null }
  }

  // The dev server answers unknown /api routes with the SPA shell, so a 404 or
  // an HTML content-type both mean "the bridge is not up yet".
  const contentType = res.headers.get('content-type') ?? ''
  if (res.status === 404 || !contentType.includes('json')) {
    return { data: sample(), origin: 'sample', error: null }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { data: sample(), origin: 'sample', error: null }
  }

  if (!res.ok) {
    const message = isApiError(body) ? [body.error, body.detail].filter(Boolean).join(' — ') : `HTTP ${res.status}`
    return { data: null, origin: 'live', error: message }
  }

  return { data: body as T, origin: 'live', error: null }
}

function withRoot(path: string, root: string | null): string {
  return root ? `${path}?root=${encodeURIComponent(root)}` : path
}

export const fetchSnapshot = (root: string | null, signal?: AbortSignal) =>
  get<Snapshot>(withRoot('/api/snapshot', root), mockSnapshot, signal)

export const fetchStatus = (root: string | null, signal?: AbortSignal) =>
  get<StatusPoll>(withRoot('/api/status', root), mockStatus, signal)

export const fetchReference = (signal?: AbortSignal) => get<Reference>('/api/reference', mockReference, signal)

export const fetchRoots = (signal?: AbortSignal) => get<RootsResponse>('/api/roots', mockRoots, signal)
