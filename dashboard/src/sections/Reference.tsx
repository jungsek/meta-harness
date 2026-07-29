/**
 * Reference — the docs, over the wire.
 *
 * Every word here comes from `/api/reference`, which serves `CATEGORIES` and
 * `TARGETS` verbatim from `src/explain.js`. Nothing is retyped into the UI, so
 * the help cannot drift from the code it describes — which is the same promise
 * meta-harness makes about config.
 */
import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import type { Reference as ReferenceDoc } from '@/types'
import {
  EmptyState,
  JsonBlock,
  KeyValue,
  Mono,
  Panel,
  SectionHeader,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/chrome'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  SegmentedList,
  SegmentedTrigger,
  Tabs,
  TabsContent,
} from '@/components/ui'
import { cn, resolve, resolveFileState, STATUS_META, type ResolvedStatus } from '@/lib/util'
import { StatusPill } from '@/components/chrome'
import type { StatusKind } from '@/types'

/**
 * The design vocabulary, read from the same map the pills render from. It lives
 * here so the meaning of a state is reachable by keyboard and by screen reader,
 * not only by hovering a pill.
 */
const STATE_LEGEND: ResolvedStatus[] = [
  ...(Object.keys(STATUS_META) as StatusKind[]).map((kind) => resolve(kind)),
  resolveFileState('link'),
]

/** The target docs are typed `unknown` on the wire, so render them structurally. */
function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>
  if (typeof value === 'string') {
    return value.startsWith('http') ? (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="text-accent-strong underline decoration-accent-strong/40 underline-offset-2 transition-colors duration-fast ease-out-quart hover:decoration-accent-strong"
      >
        {value}
      </a>
    ) : (
      <span className="text-ink">{value}</span>
    )
  }
  if (typeof value === 'number' || typeof value === 'boolean') return <Mono>{String(value)}</Mono>
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1">
        {value.map((v, i) => (
          <li key={i} className="text-ink">
            <Value value={v} />
          </li>
        ))}
      </ul>
    )
  }
  if (typeof value === 'object') {
    return (
      <KeyValue
        items={Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
          key: k,
          value: <Value value={v} />,
        }))}
      />
    )
  }
  return <JsonBlock value={value} />
}

function CategoryEntry({ name, doc }: { name: string; doc: ReferenceDoc['categories'][string] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-line last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors duration-fast ease-out-quart hover:bg-raised/60">
        <ChevronRight
          size={14}
          aria-hidden
          className={cn('shrink-0 text-muted transition-transform duration-fast ease-out-quart', open && 'rotate-90')}
        />
        <span className="font-mono text-data text-ink">{name}</span>
        <span className="min-w-0 flex-1 truncate text-label text-muted">{doc.what}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mh-rise space-y-4 bg-surface px-4 py-4">
          <KeyValue
            items={[
              { key: 'Where', value: <Mono className="break-all">{doc.where}</Mono> },
              { key: 'What', value: <span className="text-body">{doc.what}</span> },
              ...(doc.frontmatter ? [{ key: 'Frontmatter', value: <span className="text-body">{doc.frontmatter}</span> }] : []),
              { key: 'Goes to', value: <span className="text-body">{doc.goes}</span> },
            ]}
          />
          {doc.example ? (
            <div>
              <h3 className="text-label font-medium text-muted">Example</h3>
              <pre className="mt-1.5 overflow-x-auto rounded-control bg-raised px-3 py-2.5 font-mono text-data leading-relaxed text-ink">
                {doc.example}
              </pre>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function Reference({ reference }: { reference: ReferenceDoc | null }) {
  const [tab, setTab] = React.useState('categories')

  if (!reference) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Reference" lede="The reference endpoint could not be read." />
        <Panel bleed>
          <EmptyState
            title="No reference available"
            body="/api/reference serves the category and target docs straight from src/explain.js. It did not answer."
            command="meta-harness explain"
          />
        </Panel>
      </div>
    )
  }

  const categories = Object.entries(reference.categories)
  const targets = Object.entries(reference.targets)

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Reference"
        lede={
          <>
            Served from <Mono>src/explain.js</Mono>, not retyped here — the same rule this tool applies to your config
            applies to its own docs.
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <SegmentedList aria-label="Reference topic">
          <SegmentedTrigger value="categories">Categories · {categories.length}</SegmentedTrigger>
          <SegmentedTrigger value="targets">Targets · {targets.length}</SegmentedTrigger>
          <SegmentedTrigger value="events">Hook events · {reference.canonicalEvents.length}</SegmentedTrigger>
          <SegmentedTrigger value="states">States · {STATE_LEGEND.length}</SegmentedTrigger>
        </SegmentedList>

        <TabsContent value="categories" className="mt-4">
          <Panel
            title="Source categories"
            description="What each directory under the source holds, and where it ends up."
            bleed
          >
            {categories.length ? (
              categories.map(([name, doc]) => <CategoryEntry key={name} name={name} doc={doc} />)
            ) : (
              <EmptyState title="No categories" body="The reference payload carried no category docs." />
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="targets" className="mt-4 space-y-4">
          {targets.map(([name, doc]) => (
            <Panel key={name} title={<span className="font-mono">{name}</span>} bleed>
              <div className="px-4 py-3.5">
                <Value value={doc} />
              </div>
            </Panel>
          ))}
          <Panel title="Known targets" bleed>
            <Table>
              <thead>
                <tr>
                  <Th>Target</Th>
                  <Th>Documented</Th>
                </tr>
              </thead>
              <tbody>
                {reference.knownTargets.map((t) => (
                  <Tr key={t}>
                    <Td className="font-mono">{t}</Td>
                    <Td className="text-muted">{reference.targets[t] ? 'yes' : 'not yet'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Panel
            title="Canonical hook events"
            description="Declare hooks against these names. A target that has no equivalent is skipped with a warning rather than silently dropped."
            bleed
          >
            <ul className="flex flex-wrap gap-2 px-4 py-3.5">
              {reference.canonicalEvents.map((event) => (
                <li key={event}>
                  <Mono className="rounded-control bg-raised px-2 py-1 text-ink">{event}</Mono>
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>

        <TabsContent value="states" className="mt-4">
          <Panel
            title="State vocabulary"
            description="Every state is a color, a glyph and a word. The pill tooltips repeat this; nothing here is tooltip-only."
            bleed
          >
            <Table>
              <thead>
                <tr>
                  <Th className="w-[9rem]">State</Th>
                  <Th>Means</Th>
                </tr>
              </thead>
              <tbody>
                {STATE_LEGEND.map((entry) => (
                  <Tr key={entry.word}>
                    <Td>
                      <StatusPill status={entry} explain={false} />
                    </Td>
                    <Td className="text-body">{entry.means}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  )
}
