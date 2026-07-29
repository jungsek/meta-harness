/**
 * The `?` reference popover — the doc tables from src/explain.js, fetched
 * lazily from /api/reference on first open and cached for the session
 * (DESIGN.md v2 §Screen anatomy 6).
 */
import * as React from 'react'
import { Mono, Table, Td, Th, Tr } from '@/components/chrome'
import { Popover, PopoverPanel, PopoverTrigger, ScrollPane } from '@/components/ui'
import { fetchReference } from '@/lib/api'
import type { Reference } from '@/types'

function CategoriesTable({ reference }: { reference: Reference }) {
  return (
    <Table className="text-micro">
      <thead>
        <tr>
          <Th className="text-micro">category</Th>
          <Th className="text-micro">where</Th>
          <Th className="text-micro">what</Th>
          <Th className="text-micro">goes to</Th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(reference.categories).map(([name, doc]) => (
          <Tr key={name}>
            <Td className="text-micro">
              <Mono className="text-micro">{name}</Mono>
            </Td>
            <Td className="text-micro">
              <Mono className="text-micro">{doc.where}</Mono>
            </Td>
            <Td className="max-w-[24ch] text-micro text-muted">{doc.what}</Td>
            <Td className="max-w-[24ch] text-micro text-muted">{doc.goes}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  )
}

function TargetsList({ reference }: { reference: Reference }) {
  return (
    <ul className="space-y-1">
      {reference.knownTargets.map((name) => {
        const doc = reference.targets[name]
        const verified = typeof doc?.verified === 'string' ? doc.verified : null
        return (
          <li key={name} className="flex flex-wrap items-baseline gap-x-2">
            <Mono className="text-micro text-ink">{name}</Mono>
            <span className="min-w-0 text-micro text-muted">{verified ?? 'proposed — not yet verified'}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function Help() {
  const [reference, setReference] = React.useState<Reference | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = () => {
    if (reference) return
    setError(null)
    void fetchReference().then((res) => {
      if (res.data) setReference(res.data)
      else setError(res.error ?? 'Reference unavailable.')
    })
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) load()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Reference"
          className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line font-mono text-micro text-muted transition-colors duration-fast ease-out-quart hover:bg-raised hover:text-ink"
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverPanel align="end" className="w-[min(46rem,calc(100vw-2rem))] max-w-none p-0">
        <ScrollPane className="max-h-[70vh]">
          <div className="space-y-4 p-3">
            {error ? (
              <p className="text-micro text-status-conflict">{error}</p>
            ) : !reference ? (
              <p className="text-micro text-muted">loading reference…</p>
            ) : (
              <>
                <section>
                  <p className="mb-1.5 text-label text-muted">categories</p>
                  <CategoriesTable reference={reference} />
                </section>
                <section>
                  <p className="mb-1.5 text-label text-muted">targets</p>
                  <TargetsList reference={reference} />
                </section>
                <section>
                  <p className="mb-1.5 text-label text-muted">canonical hook events</p>
                  <p className="flex flex-wrap gap-x-2 gap-y-1">
                    {reference.canonicalEvents.map((event) => (
                      <Mono key={event} className="text-micro text-ink">
                        {event}
                      </Mono>
                    ))}
                  </p>
                </section>
              </>
            )}
          </div>
        </ScrollPane>
      </PopoverPanel>
    </Popover>
  )
}
