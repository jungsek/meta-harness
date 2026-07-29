import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Structural responsive behaviour only — never fluid type (DESIGN.md §Layout). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export interface HashState {
  section: string
  root: string | null
}

function parseHash(): HashState {
  const raw = window.location.hash.replace(/^#/, '')
  const params = new URLSearchParams(raw)
  const section = params.get('section')
  const root = params.get('root')
  // Tolerate the plain `#sync` shorthand a teammate is likely to hand-type.
  if (!section && raw && !raw.includes('=')) return { section: raw, root: null }
  return { section: section ?? 'overview', root: root ?? null }
}

function serialize(state: HashState): string {
  const params = new URLSearchParams()
  params.set('section', state.section)
  if (state.root) params.set('root', state.root)
  return `#${params.toString()}`
}

/**
 * Section + root live in the URL hash so a teammate can be sent straight to the
 * conflict. Written with replaceState so the back button is not filled with
 * every tab press.
 */
export function useHashState(): [HashState, (next: Partial<HashState>) => void] {
  const [state, setState] = useState<HashState>(() => parseHash())

  useEffect(() => {
    const onHashChange = () => setState(parseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const update = useCallback((next: Partial<HashState>) => {
    setState((prev) => {
      const merged = { ...prev, ...next }
      const hash = serialize(merged)
      if (hash !== window.location.hash) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
      }
      return merged
    })
  }, [])

  return [state, update]
}

/** A slow tick so "12s ago" stays honest without re-rendering the whole tree. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * Poll on an interval AND on focus, but never while the tab is hidden — a
 * background tab hammering the CLI's own modules is not free.
 */
export function usePoll(fn: () => void, intervalMs: number, enabled = true) {
  const saved = useRef(fn)
  saved.current = fn

  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      if (document.visibilityState === 'visible') saved.current()
    }
    const id = window.setInterval(tick, intervalMs)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [intervalMs, enabled])
}
