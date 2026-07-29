/**
 * Drift & conflicts — the two-column view.
 *
 * Both sides are always on screen. Never a "winner", never a collapsed summary,
 * never a resolve button (PRODUCT.md principle 2, DESIGN.md preservation rule
 * 5). `prefer` is reported as what the CLI *would* do, next to the side it
 * would drop — it is information, not a decision taken on the user's behalf.
 */
import * as React from 'react'
import { Maximize2 } from 'lucide-react'
import type { ConflictItem, DriftReport, Snapshot, StatusRow } from '@/types'
import {
  Button,
  Command,
  DiffPane,
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
import { Dialog, DialogPanel, DialogTrigger } from '@/components/ui'
import { plural } from '@/lib/util'

function conflictKey(c: ConflictItem) {
  return `${c.target}:${c.category}:${c.name}`
}

function Conflict({ conflict, sourceDir }: { conflict: ConflictItem; sourceDir: string }) {
  const sourceLabel = `source · ${sourceDir}`
  const nativeLabel = `native · ${conflict.target}`
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill kind="conflict" />
          <span className="font-mono">{conflict.category}</span>
          <span className="text-muted">/</span>
          <span className="font-mono">{conflict.name}</span>
        </span>
      }
      description={conflict.detail ?? `${conflict.target} and the source both changed since the last generate.`}
      actions={
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary" className="text-micro">
              <Maximize2 size={13} aria-hidden />
              Expand
            </Button>
          </DialogTrigger>
          <DialogPanel
            title={
              <span className="font-mono">
                {conflict.category} / {conflict.name}
              </span>
            }
            description={`${conflict.target} — both sides shown in full. Nothing is resolved here; the CLI owns writes.`}
          >
            <DiffPane
              source={conflict.source}
              native={conflict.native}
              sourceLabel={sourceLabel}
              nativeLabel={nativeLabel}
            />
            <p className="mt-4 text-label text-muted">
              {conflict.prefer
                ? `A sync would keep the ${conflict.prefer} side. The other side is shown above in full so the drop is a decision you can see.`
                : 'No preference is recorded, so a sync will stop and ask.'}{' '}
              Resolve it by editing the file you want to win, then run <Command>meta-harness sync</Command>.
            </p>
          </DialogPanel>
        </Dialog>
      }
    >
      <DiffPane source={conflict.source} native={conflict.native} sourceLabel={sourceLabel} nativeLabel={nativeLabel} />
      <p className="mt-3 text-label text-muted">
        {conflict.prefer ? (
          <>
            A sync would keep the <Mono>{conflict.prefer}</Mono> side. Both are shown above; nothing is hidden.
          </>
        ) : (
          <>No preference is recorded, so a sync will stop and ask rather than guess.</>
        )}
      </p>
    </Panel>
  )
}

export function Drift({
  snapshot,
  status,
  drift,
}: {
  snapshot: Snapshot
  status: StatusRow[]
  drift: DriftReport
}) {
  const conflicts = snapshot.plan?.conflicts ?? []
  const edited = status.filter((s) => s.state === 'EDITED')
  const drifted = React.useMemo(() => {
    const seen = new Set(edited.map((e) => e.path))
    return [...edited.map((e) => ({ path: e.path, target: e.target, category: e.category })), ...drift.drifted.filter((p) => !seen.has(p)).map((p) => ({ path: p, target: null, category: null }))]
  }, [edited, drift.drifted])

  const nothing = conflicts.length === 0 && drifted.length === 0

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Drift & conflicts"
        lede={
          nothing ? (
            <>Every managed file matches what the source would generate.</>
          ) : (
            <>
              {plural(conflicts.length, 'conflict')} and {plural(drifted.length, 'drifted file')}. Drift is normal —
              it means someone edited a generated file directly.
            </>
          )
        }
      />

      {drift.error ? (
        <Panel title="Drift check failed" bleed>
          <div className="px-4 py-4">
            <StatusPill kind="conflict" label="error" />
            <p className="mt-2 max-w-[72ch] text-body text-ink">{drift.error}</p>
          </div>
        </Panel>
      ) : null}

      {nothing && !drift.error ? (
        <Panel bleed>
          <EmptyState
            title="Nothing has drifted"
            body="No generated file differs from the source, and no item changed on both sides. This is the resting state, not an achievement."
            hint={<>Drift appears here the moment a generated file is edited by hand.</>}
          />
        </Panel>
      ) : null}

      {conflicts.length ? (
        <div className="space-y-4">
          <h2 className="text-h2 font-semibold text-ink">Conflicts · {conflicts.length}</h2>
          <p className="max-w-[72ch] text-body text-muted">
            Both the source and the native file changed since the last generate. Both sides are shown in full; this
            surface never picks one.
          </p>
          {conflicts.map((c) => (
            <Conflict key={conflictKey(c)} conflict={c} sourceDir={snapshot.sourceDir} />
          ))}
        </div>
      ) : null}

      {drifted.length ? (
        <Panel
          title={`Drifted files · ${drifted.length}`}
          description="Edited natively, so the file no longer matches what the source produces. Regenerating overwrites the edit."
          bleed
        >
          <Table>
            <thead>
              <tr>
                <Th className="w-[8.5rem]">State</Th>
                <Th>Path</Th>
                <Th className="w-[8rem]">Target</Th>
                <Th className="w-[9rem]">Category</Th>
                <Th className="w-[16rem]">Remedy</Th>
              </tr>
            </thead>
            <tbody>
              {drifted.map((row) => (
                <Tr key={row.path}>
                  <Td>
                    <StatusPill kind="changed" />
                  </Td>
                  <Td>
                    <Mono className="break-all">{row.path}</Mono>
                  </Td>
                  <Td className="font-mono text-muted">{row.target ?? '—'}</Td>
                  <Td className="font-mono text-muted">{row.category ?? '—'}</Td>
                  <Td>
                    <Command>meta-harness generate</Command>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="border-t border-line px-4 py-3 text-label text-muted">
            Keeping the edit? Move it into <Mono>{snapshot.sourceDir}</Mono> first — a generate rewrites the target
            file from the source.
          </p>
        </Panel>
      ) : null}
    </div>
  )
}
