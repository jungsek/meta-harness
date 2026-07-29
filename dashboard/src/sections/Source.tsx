/**
 * Source — the model, source-first (PRODUCT.md principle 1).
 *
 * A grouped table, not a card grid: these rows exist to be scanned and
 * compared. Each row expands to the item's frontmatter, its target list, and
 * its body, so "what is even in here?" is answered without opening eight files
 * in eight formats.
 */
import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import type { Model, ModelItem, Snapshot } from '@/types'
import {
  Command,
  EmptyState,
  JsonBlock,
  KeyValue,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui'
import { cn, plural } from '@/lib/util'

interface Row {
  category: string
  name: string
  file: string
  targets: string[]
  description: string | null
  body: string | null
  fm: Record<string, unknown> | null
  perTarget: Record<string, unknown> | null
  detail: unknown
  haystack: string
}

function fromItem(category: string, item: ModelItem): Row {
  return {
    category,
    name: item.name,
    file: item.file,
    targets: item.targets,
    description: item.description,
    body: item.body,
    fm: item.fm,
    perTarget: item.perTarget ?? null,
    detail: null,
    haystack: [category, item.name, item.file, item.description, item.body].filter(Boolean).join(' ').toLowerCase(),
  }
}

function fromConfig(category: string, name: string, file: string, detail: unknown, targets: string[]): Row {
  return {
    category,
    name,
    file,
    targets,
    description: null,
    body: null,
    fm: null,
    perTarget: null,
    detail,
    haystack: [category, name, file, JSON.stringify(detail)].join(' ').toLowerCase(),
  }
}

export function buildRows(model: Model, sourceDir: string): Row[] {
  const rows: Row[] = [
    ...model.rules.map((r) => fromItem('rules', r)),
    ...model.agents.map((a) => fromItem('agents', a)),
    ...model.commands.map((c) => fromItem('commands', c)),
  ]

  if (model.mcp) {
    for (const [name, server] of Object.entries(model.mcp.servers)) {
      rows.push(fromConfig('connections', name, model.mcp.file, server, ['*']))
    }
  }
  for (const event of model.hooks ?? []) {
    rows.push(fromConfig('hooks', event.event, `${sourceDir}/hooks/hooks.jsonc`, event.entries, ['*']))
  }
  if (model.env) {
    for (const [name, value] of Object.entries(model.env)) {
      rows.push(fromConfig('env', name, `${sourceDir}/env/env.jsonc`, value, ['*']))
    }
  }
  if (model.plugins) {
    for (const name of model.plugins.enabledPlugins) {
      rows.push(fromConfig('plugins', name, model.plugins.file, name, ['claude']))
    }
  }
  if (model.permissions) {
    rows.push(
      fromConfig('permissions', 'permissions.jsonc', `${sourceDir}/permissions/permissions.jsonc`, model.permissions, ['*']),
    )
  }
  if (model.settings.claude) {
    rows.push(
      fromConfig('settings', 'claude.settings.jsonc', `${sourceDir}/settings/claude.settings.jsonc`, model.settings.claude, ['claude']),
    )
  }
  if (model.settings.codex) {
    rows.push(
      fromConfig('settings', 'codex.config.toml', `${sourceDir}/settings/codex.config.toml`, model.settings.codex, ['codex']),
    )
  }

  return rows
}

const ORDER = ['rules', 'agents', 'commands', 'connections', 'hooks', 'env', 'plugins', 'permissions', 'settings']

const COLUMNS = 4

function SourceRow({ row, enabled }: { row: Row; enabled: string[] }) {
  const [open, setOpen] = React.useState(false)
  const reaches = row.targets.includes('*') ? enabled : row.targets

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <tbody className="border-b border-line last:border-b-0">
        <Tr className={cn(open && 'bg-raised/60')}>
          <Td className="w-[18rem]">
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-control text-left font-mono text-data text-ink transition-colors duration-fast ease-out-quart hover:text-primary">
              <ChevronRight
                size={14}
                aria-hidden
                className={cn('shrink-0 text-muted transition-transform duration-fast ease-out-quart', open && 'rotate-90')}
              />
              <span className="truncate">{row.name}</span>
            </CollapsibleTrigger>
          </Td>
          <Td className="text-body">
            {row.description ?? <span className="text-muted">—</span>}
          </Td>
          <Td className="w-[13rem]">
            <span className="flex flex-wrap gap-1.5">
              {reaches.length ? (
                reaches.map((t) => (
                  <Mono key={t} className="text-muted">
                    {t}
                  </Mono>
                ))
              ) : (
                <StatusPill kind="missing" label="no target" />
              )}
            </span>
          </Td>
          <Td className="w-[22rem]">
            <Mono className="break-all text-muted">{row.file}</Mono>
          </Td>
        </Tr>
        <CollapsibleContent asChild>
          <tr>
            <td colSpan={COLUMNS} className="border-b border-line bg-surface px-4 py-4">
              <div className="mh-rise grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-label font-medium text-muted">Frontmatter</h3>
                    <div className="mt-1.5">
                      {row.fm && Object.keys(row.fm).length ? (
                        <KeyValue
                          items={Object.entries(row.fm).map(([key, value]) => ({
                            key,
                            value: (
                              <Mono className="break-words">
                                {typeof value === 'string' ? value : JSON.stringify(value)}
                              </Mono>
                            ),
                          }))}
                        />
                      ) : (
                        <p className="text-label text-muted">None — this category is JSONC or TOML, not frontmatter.</p>
                      )}
                    </div>
                  </div>
                  {row.perTarget && Object.keys(row.perTarget).length ? (
                    <div>
                      <h3 className="text-label font-medium text-muted">Per-target overrides</h3>
                      <JsonBlock className="mt-1.5" value={row.perTarget} />
                    </div>
                  ) : null}
                  <div>
                    <h3 className="text-label font-medium text-muted">Reaches</h3>
                    <p className="mt-1.5 text-label text-muted">
                      {row.targets.includes('*')
                        ? 'Every enabled target'
                        : `Only ${row.targets.join(', ')}`}{' '}
                      — declared in <Mono className="break-all">{row.file}</Mono>.
                    </p>
                  </div>
                </div>
                <div className="min-w-0">
                  <h3 className="text-label font-medium text-muted">{row.body === null ? 'Value' : 'Body'}</h3>
                  {row.body === null ? (
                    <JsonBlock className="mt-1.5 max-h-96" value={row.detail} />
                  ) : (
                    <pre className="mt-1.5 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-control bg-raised px-3 py-2.5 font-mono text-data leading-relaxed text-ink">
                      {row.body || '(empty body)'}
                    </pre>
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

export function Source({ snapshot }: { snapshot: Snapshot }) {
  const [category, setCategory] = React.useState('all')
  const [query, setQuery] = React.useState('')

  const model = snapshot.model
  const rows = React.useMemo(() => (model ? buildRows(model, snapshot.sourceDir) : []), [model, snapshot.sourceDir])
  const enabled = snapshot.plan?.targets ?? []

  const filtered = rows.filter(
    (r) => (category === 'all' || r.category === category) && (!query || r.haystack.includes(query.toLowerCase())),
  )
  const groups = ORDER.map((c) => ({ category: c, rows: filtered.filter((r) => r.category === c) })).filter(
    (g) => g.rows.length > 0,
  )

  if (!model) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Source" lede="The source directory could not be read." />
        <Panel bleed>
          <EmptyState
            title="No source directory"
            body={
              <>
                <Mono>{snapshot.sourceDir}</Mono> does not exist in this root, so there is no model to show.
              </>
            }
            command="meta-harness init"
          />
        </Panel>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Source"
        lede={
          <>
            Everything <Mono>{snapshot.sourceDir}</Mono> declares. This is the authority — the target files are
            derived from it, never the other way round.
          </>
        }
      />

      {model.issues.length ? (
        <Panel title={`Source issues · ${model.issues.length}`} bleed>
          <Table>
            <thead>
              <tr>
                <Th className="w-[7rem]">Level</Th>
                <Th className="w-[20rem]">File</Th>
                <Th>Message</Th>
              </tr>
            </thead>
            <tbody>
              {model.issues.map((issue) => (
                <Tr key={`${issue.file}:${issue.message}`}>
                  <Td>
                    <StatusPill kind={issue.level === 'error' ? 'conflict' : 'changed'} label={issue.level} />
                  </Td>
                  <Td>
                    <Mono className="break-all">{issue.file}</Mono>
                  </Td>
                  <Td className="text-body">{issue.message}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      ) : null}

      <Panel
        title="Model"
        description={`${plural(filtered.length, 'item')} shown of ${rows.length}. Expand a row for its frontmatter, targets and body.`}
        actions={
          <>
            <SearchInput
              label="Filter source items"
              placeholder="Filter by name, path or body…"
              value={query}
              onChange={setQuery}
            />
            <Select
              label="Category"
              value={category}
              onChange={setCategory}
              options={[
                { value: 'all', label: 'all' },
                ...ORDER.filter((c) => rows.some((r) => r.category === c)).map((c) => ({ value: c, label: c })),
              ]}
            />
          </>
        }
        bleed
      >
        {groups.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState
              title="The source directory is empty"
              body={
                <>
                  <Mono>{snapshot.sourceDir}</Mono> exists but declares nothing yet. Add a rule and the generated
                  AGENTS.md follows.
                </>
              }
              command="meta-harness init"
            />
          ) : (
            <EmptyState
              title="No items match this filter"
              body={<>Nothing in the model matches <Mono>{query || category}</Mono>. Clear the filter to see all {rows.length} items.</>}
            />
          )
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Description</Th>
                <Th>Targets</Th>
                <Th>Source file</Th>
              </tr>
            </thead>
            {groups.map((group) => (
              <React.Fragment key={group.category}>
                <tbody>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={COLUMNS}
                      className="border-b border-line bg-raised/70 px-3 py-1.5 text-left text-label font-medium text-ink"
                    >
                      <span className="font-mono">{group.category}</span>{' '}
                      <span className="font-sans font-normal text-muted">· {plural(group.rows.length, 'item')}</span>
                    </th>
                  </tr>
                </tbody>
                {group.rows.map((row) => (
                  <SourceRow key={`${row.category}:${row.name}:${row.file}`} row={row} enabled={enabled} />
                ))}
              </React.Fragment>
            ))}
          </Table>
        )}
      </Panel>

      <p className="text-label text-muted">
        This surface reads; it never writes. Edit the files under <Mono>{snapshot.sourceDir}</Mono> and re-run{' '}
        <Command>meta-harness sync</Command>.
      </p>
    </div>
  )
}
