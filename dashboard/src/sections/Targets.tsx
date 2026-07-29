/**
 * Targets — the output matrix.
 *
 * The load-bearing distinction is enabled vs *proposed*: cursor, opencode and
 * hermes can be detected in a repo and are still never quietly switched on.
 * The grid says what each target can receive; the table says what it currently
 * owns; the gates say what is generated but inert.
 */
import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import type { DetectionRow, Snapshot } from '@/types'
import {
  EmptyState,
  Mono,
  Panel,
  SectionHeader,
  StatusPill,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/chrome'
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Tooltip } from '@/components/ui'
import { cn, normalizeUnsupported, plural, STATUS_META } from '@/lib/util'

const CATEGORIES = [
  'rules',
  'agents',
  'commands',
  'connections',
  'hooks',
  'env',
  'plugins',
  'permissions',
  'settings',
]

function detected(row: DetectionRow) {
  return row.repo.length > 0 || row.bin !== null
}

function targetStatus(row: DetectionRow) {
  if (row.enabled) return { kind: 'clean' as const, word: 'enabled', means: `${row.target} is enabled and receives generated output.` }
  if (row.proposed)
    return {
      kind: 'pending' as const,
      word: 'proposed',
      means: `${row.target} was detected in this repo but is not enabled. meta-harness proposes targets; it never enables one for you.`,
    }
  if (detected(row))
    return {
      kind: 'missing' as const,
      word: 'not enabled',
      means: `${row.target} was found in this repo but is not an enabled target, so nothing is written for it.`,
    }
  return { kind: 'missing' as const, word: 'not detected', means: `No ${row.target} config or binary was found for this root.` }
}

/** One grid cell: still color + glyph + word, just without a pill ground. */
function Cell({ row, category }: { row: DetectionRow; category: string }) {
  if (!row.supports.includes(category)) {
    return (
      <>
        <span aria-hidden className="text-muted">
          —
        </span>
        <span className="sr-only">{`${row.target} does not support ${category}`}</span>
      </>
    )
  }
  // `on` is a real status and uses the status vocabulary. `off` is capability
  // information, not one of the six file states, so it gets a hollow mark
  // rather than borrowing a status glyph that would misread as a file state.
  const meta = row.enabled
    ? { ...STATUS_META.clean, glyph: '●', word: 'on' }
    : row.proposed
      ? { ...STATUS_META.pending, glyph: '→', word: 'proposed' }
      : { text: 'text-muted', glyph: '○', word: 'off' }
  const word = meta.word
  return (
    <Tooltip
      label={
        row.enabled
          ? `${row.target} receives ${category} from the source.`
          : row.proposed
            ? `${row.target} supports ${category} but is not enabled, so nothing is written for it.`
            : `${row.target} supports ${category}, but the target is not enabled, so nothing is written for it.`
      }
    >
      <span className={cn('inline-flex cursor-help items-center gap-1 text-micro font-medium', meta.text)}>
        <span aria-hidden className="font-mono text-[0.85em] leading-none">
          {meta.glyph}
        </span>
        {word}
      </span>
    </Tooltip>
  )
}

function TargetRow({ row, snapshot }: { row: DetectionRow; snapshot: Snapshot }) {
  const [open, setOpen] = React.useState(false)
  const state = targetStatus(row)
  const generates = snapshot.plan?.generates.filter((g) => g.target === row.target) ?? []
  const owned = snapshot.status.filter((s) => s.target === row.target)

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <tbody className="border-b border-line last:border-b-0">
        <Tr className={cn(open && 'bg-raised/60')}>
          <Td className="w-[12rem]">
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-control text-left font-mono text-data text-ink transition-colors duration-fast ease-out-quart hover:text-primary">
              <ChevronRight
                size={14}
                aria-hidden
                className={cn('shrink-0 text-muted transition-transform duration-fast ease-out-quart', open && 'rotate-90')}
              />
              {row.target}
            </CollapsibleTrigger>
          </Td>
          <Td className="w-[10rem]">
            <StatusPill kind={state.kind} label={state.word} />
          </Td>
          <Td>
            {row.repo.length ? (
              <span className="flex flex-wrap gap-1.5">
                {row.repo.map((r) => (
                  <Mono key={r} className="text-muted">
                    {r}
                  </Mono>
                ))}
              </span>
            ) : (
              <span className="text-muted">nothing in the repo</span>
            )}
          </Td>
          <Td className="w-[9rem]">{row.bin ? <Mono>{row.bin}</Mono> : <span className="text-muted">not on PATH</span>}</Td>
          <Td className="w-[7rem] text-right tabular-nums">{row.outputs.length}</Td>
        </Tr>
        <CollapsibleContent asChild>
          <tr>
            <td colSpan={5} className="border-b border-line bg-surface px-4 py-4">
              <div className="mh-rise grid gap-5 lg:grid-cols-3">
                <div>
                  <h3 className="text-label font-medium text-muted">Supports</h3>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {row.supports.map((c) => (
                      <li key={c}>
                        <Mono className="text-ink">{c}</Mono>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 max-w-[60ch] text-label text-muted">
                    Categories outside this list are reported as unsupported for {row.target} rather than silently
                    dropped.
                  </p>
                </div>
                <div>
                  <h3 className="text-label font-medium text-muted">Owns now · {row.outputs.length}</h3>
                  {row.outputs.length ? (
                    <ul className="mt-1.5 space-y-1">
                      {row.outputs.map((f) => (
                        <li key={f}>
                          <Mono className="break-all text-ink">{f}</Mono>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-label text-muted">No managed files yet.</p>
                  )}
                </div>
                <div>
                  <h3 className="text-label font-medium text-muted">Next generate · {generates.length}</h3>
                  {generates.length ? (
                    <ul className="mt-1.5 space-y-1">
                      {generates.map((g) => (
                        <li key={g.path} className="flex items-baseline gap-2">
                          <StatusPill kind="pending" explain={false} />
                          <Mono className="break-all text-ink">{g.path}</Mono>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-label text-muted">
                      {owned.length ? 'Nothing to write — the output already matches.' : 'Nothing is written for this target.'}
                    </p>
                  )}
                </div>
              </div>
            </td>
          </tr>
        </CollapsibleContent>
      </tbody>
    </Collapsible>
  )
}

export function Targets({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.detection
  const gates = snapshot.trustGates.filter((g) => g.relevant)
  const unsupported = snapshot.plan?.unsupported ?? []

  if (!rows.length) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Targets" lede="No coding agent was detected in this root." />
        <Panel bleed>
          <EmptyState
            title="No targets detected"
            body="meta-harness looks for each agent's config directory in the repo and its binary on PATH. Neither turned up."
            command="meta-harness init"
          />
        </Panel>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Targets"
        lede={
          <>
            {plural(rows.filter((r) => r.enabled).length, 'target')} enabled,{' '}
            {rows.filter((r) => !r.enabled && detected(r)).length} detected but off. A detected target is never
            switched on for you — enabling one is always an explicit decision.
          </>
        }
      />

      <Panel
        title="Category × target"
        description="What each target can receive. A dash means the runtime has no surface for that category at all."
        bleed
      >
        <Table>
          <thead>
            <tr>
              <Th>Category</Th>
              {rows.map((r) => (
                <Th key={r.target} className="text-center font-mono">
                  {r.target}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((category) => (
              <Tr key={category}>
                <Td className="font-mono">{category}</Td>
                {rows.map((r) => (
                  <Td key={r.target} className="text-center">
                    <Cell row={r} category={category} />
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel title="Detection" description="Expand a target for what it supports, owns, and will be given next." bleed>
        <Table>
          <thead>
            <tr>
              <Th>Target</Th>
              <Th>State</Th>
              <Th>Found in repo</Th>
              <Th>Binary</Th>
              <Th className="text-right">Files</Th>
            </tr>
          </thead>
          {rows.map((row) => (
            <TargetRow key={row.target} row={row} snapshot={snapshot} />
          ))}
        </Table>
      </Panel>

      {gates.length ? (
        <Panel
          title={`Trust gates · ${gates.length}`}
          description="Generated, but inert until the runtime accepts them. Nothing else surfaces this."
          bleed
        >
          <Table>
            <thead>
              <tr>
                <Th className="w-[8rem]">Target</Th>
                <Th className="w-[11rem]">Gate</Th>
                <Th>Blocks</Th>
                <Th>What clears it</Th>
              </tr>
            </thead>
            <tbody>
              {gates.map((gate) => (
                <Tr key={`${gate.target}:${gate.gate}`}>
                  <Td className="font-mono">{gate.target}</Td>
                  <Td>
                    <StatusPill kind="pending" label={gate.gate} />
                  </Td>
                  <Td>
                    <ul className="space-y-0.5">
                      {gate.blocks.map((b) => (
                        <li key={b}>
                          <Mono className="break-all text-muted">{b}</Mono>
                        </li>
                      ))}
                    </ul>
                  </Td>
                  <Td className="max-w-[36rem] text-body">{gate.hint}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      ) : null}

      {unsupported.length ? (
        <Panel
          title={`Unsupported · ${unsupported.length}`}
          description="Declared in the source, but the target runtime has nowhere to put it. Reported, never silently dropped."
          bleed
        >
          <Table>
            <thead>
              <tr>
                <Th className="w-[8rem]">Target</Th>
                <Th className="w-[10rem]">Category</Th>
                <Th className="w-[14rem]">Name</Th>
                <Th>Why</Th>
              </tr>
            </thead>
            <tbody>
              {unsupported.map(normalizeUnsupported).map((u) => (
                <Tr key={`${u.target}:${u.category}:${u.name}`}>
                  <Td className="font-mono">{u.target}</Td>
                  <Td className="font-mono">{u.category}</Td>
                  <Td>
                    <Mono className="break-all">{u.name}</Mono>
                  </Td>
                  <Td className="text-body">{u.detail}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      ) : null}
    </div>
  )
}
