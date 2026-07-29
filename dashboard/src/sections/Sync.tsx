/**
 * Sync — the "did that land?" screen.
 *
 * Two tables. The plan is what the next `sync` would do; the file list is what
 * is on disk right now and is refreshed by the poll. Both stay tables: these
 * rows exist to be compared column-by-column (DESIGN.md preservation rule 6).
 */
import * as React from 'react'
import type { Snapshot, StatusKind, StatusRow } from '@/types'
import {
  Command,
  EmptyState,
  Mono,
  Panel,
  SearchInput,
  SectionHeader,
  Select,
  StatusPill,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/chrome'
import { normalizeUnsupported, plural, resolveFileState } from '@/lib/util'

interface PlanRow {
  id: string
  kind: StatusKind
  word: string
  target: string
  category: string
  name: string
  detail: string
}

function buildPlanRows(snapshot: Snapshot): PlanRow[] {
  const plan = snapshot.plan
  if (!plan) return []
  return [
    ...plan.conflicts.map((c) => ({
      id: `conflict:${c.target}:${c.category}:${c.name}`,
      kind: 'conflict' as const,
      word: 'conflict',
      target: c.target,
      category: c.category,
      name: c.name,
      detail: c.detail ?? 'Both sides changed — open Drift & conflicts for the two-column view.',
    })),
    ...plan.imports.map((i) => ({
      id: `import:${i.target}:${i.category}:${i.name}`,
      kind: 'new' as const,
      word: 'import',
      target: i.target,
      category: i.category,
      name: i.name,
      detail: i.detail ?? 'Native config will be pulled into the source directory.',
    })),
    ...plan.generates.map((g) => ({
      id: `generate:${g.target}:${g.path}`,
      kind: 'pending' as const,
      word: 'generate',
      target: g.target,
      category: 'file',
      name: g.path,
      detail: 'Will be written on the next generate.',
    })),
    ...plan.unsupported.map(normalizeUnsupported).map((u) => ({
      id: `unsupported:${u.target}:${u.category}:${u.name}`,
      kind: 'missing' as const,
      word: 'unsupported',
      target: u.target,
      category: u.category,
      name: u.name,
      detail: u.detail,
    })),
    ...plan.clean.map((c) => ({
      id: `clean:${c.target}:${c.category}:${c.name}`,
      kind: 'clean' as const,
      word: 'clean',
      target: c.target,
      category: c.category,
      name: c.name,
      detail: 'Already matches the source.',
    })),
  ]
}

const ALL = 'all'

function uniq(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort()
}

export function Sync({ snapshot, status }: { snapshot: Snapshot; status: StatusRow[] }) {
  const [target, setTarget] = React.useState(ALL)
  const [category, setCategory] = React.useState(ALL)
  const [state, setState] = React.useState(ALL)
  const [query, setQuery] = React.useState('')

  const planRows = React.useMemo(() => buildPlanRows(snapshot), [snapshot])

  const targets = uniq([...planRows.map((r) => r.target), ...status.map((s) => s.target)])
  const categories = uniq([...planRows.map((r) => r.category), ...status.map((s) => s.category)])
  const states = uniq([...planRows.map((r) => r.word), ...status.map((s) => s.state)])

  const q = query.trim().toLowerCase()
  const matches = (row: { target: string | null; category: string | null; word: string; text: string }) =>
    (target === ALL || row.target === target) &&
    (category === ALL || row.category === category) &&
    (state === ALL || row.word === state) &&
    (!q || row.text.toLowerCase().includes(q))

  const visiblePlan = planRows.filter((r) =>
    matches({ target: r.target, category: r.category, word: r.word, text: `${r.name} ${r.detail} ${r.category}` }),
  )
  const visibleFiles = status.filter((s) =>
    matches({ target: s.target, category: s.category, word: s.state, text: s.path }),
  )

  const filtersActive = target !== ALL || category !== ALL || state !== ALL || q !== ''

  const filters = (
    <>
      <SearchInput label="Filter rows" placeholder="Filter by path or name…" value={query} onChange={setQuery} />
      <Select
        label="Target"
        value={target}
        onChange={setTarget}
        options={[{ value: ALL, label: 'all' }, ...targets.map((t) => ({ value: t, label: t }))]}
      />
      <Select
        label="Category"
        value={category}
        onChange={setCategory}
        options={[{ value: ALL, label: 'all' }, ...categories.map((c) => ({ value: c, label: c }))]}
      />
      <Select
        label="State"
        value={state}
        onChange={setState}
        options={[{ value: ALL, label: 'all' }, ...states.map((s) => ({ value: s, label: s }))]}
      />
    </>
  )

  if (!snapshot.plan) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Sync" lede="The plan could not be computed for this root." />
        <Panel bleed>
          <EmptyState
            title="No plan"
            body={snapshot.error ?? 'syncPlan threw for this root, so there is nothing to reconcile against.'}
            command="meta-harness status"
          />
        </Panel>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Sync"
        lede={
          <>
            What the next <Command>meta-harness sync</Command> would do, and what is on disk right now. Mode:{' '}
            <Mono>{snapshot.plan.mode}</Mono>.
          </>
        }
      />

      <Panel
        title={`Plan · ${visiblePlan.length}${filtersActive ? ` of ${planRows.length}` : ''}`}
        description="Imports pull native config into the source. Generates write the source out. Clean rows already agree."
        actions={filters}
        bleed
      >
        {visiblePlan.length === 0 ? (
          planRows.length === 0 ? (
            <EmptyState
              title="Nothing planned"
              body="The source and every enabled target already agree, so a sync would be a no-op."
              command="meta-harness status"
            />
          ) : (
            <EmptyState title="No plan rows match this filter" body="Clear a filter to widen the view." />
          )
        ) : (
          <Table className="mh-sticky-head">
            <thead>
              <tr>
                <Th className="w-[8.5rem]">Action</Th>
                <Th className="w-[8rem]">Target</Th>
                <Th className="w-[9rem]">Category</Th>
                <Th className="w-[22rem]">Name</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {visiblePlan.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <StatusPill kind={row.kind} label={row.word} />
                  </Td>
                  <Td className="font-mono">{row.target}</Td>
                  <Td className="font-mono text-muted">{row.category}</Td>
                  <Td>
                    <Mono className="break-all">{row.name}</Mono>
                  </Td>
                  <Td className="text-body text-muted">{row.detail}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel
        title={`Files · ${visibleFiles.length}${filtersActive ? ` of ${status.length}` : ''}`}
        description="Live from the manifest, refreshed by the poll. A symlink reads as a link, which is healthy."
        bleed
      >
        {visibleFiles.length === 0 ? (
          status.length === 0 ? (
            <EmptyState
              title="Nothing generated yet"
              body="There is no manifest for this root, which means the source has never been written out."
              command="meta-harness sync"
              hint={<>{plural(snapshot.plan.generates.length, 'file')} would be written on the first run.</>}
            />
          ) : (
            <EmptyState title="No files match this filter" body="Clear a filter to widen the view." />
          )
        ) : (
          <Table className="mh-sticky-head">
            <thead>
              <tr>
                <Th className="w-[8.5rem]">State</Th>
                <Th>Path</Th>
                <Th className="w-[9rem]">Target</Th>
                <Th className="w-[10rem]">Category</Th>
              </tr>
            </thead>
            <tbody>
              {visibleFiles.map((row) => {
                const s = resolveFileState(row.state)
                return (
                  <Tr key={row.path}>
                    <Td>
                      <StatusPill status={s} />
                    </Td>
                    <Td>
                      <Mono className="break-all">{row.path}</Mono>
                    </Td>
                    <Td className="font-mono text-muted">{row.target ?? '—'}</Td>
                    <Td className="font-mono text-muted">{row.category ?? '—'}</Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  )
}
