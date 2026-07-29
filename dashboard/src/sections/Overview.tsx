/**
 * Overview — "is my harness correct right now?" in under ten seconds.
 *
 * Deliberately not a KPI screen: no hero metric, no gradient number, no
 * sparkline (PRODUCT.md anti-references). What action is needed comes first;
 * the ledgers that prove the claim come second. A clean harness reads calm, not
 * congratulatory.
 */
import type { Snapshot, StatusKind } from '@/types'
import { Button, Command, CountChip, EmptyState, KeyValue, Mono, Panel, SectionHeader, StatusPill, Table, Td, Th, Tr } from '@/components/chrome'
import { Tooltip } from '@/components/ui'
import { plural, resolve, resolveFileState } from '@/lib/util'

interface Action {
  id: string
  kind: StatusKind
  word: string
  what: string
  where: string | null
  remedy: string | null
  section: string | null
}

function buildActions(snap: Snapshot): Action[] {
  const actions: Action[] = []
  const plan = snap.plan

  for (const c of plan?.conflicts ?? []) {
    actions.push({
      id: `conflict:${c.target}:${c.category}:${c.name}`,
      kind: 'conflict',
      word: 'conflict',
      what: c.detail ? `${c.category} · ${c.name} — ${c.detail}` : `${c.category} · ${c.name} changed on both sides`,
      where: c.target,
      remedy: 'meta-harness sync',
      section: 'drift',
    })
  }

  for (const file of snap.drift.drifted) {
    actions.push({
      id: `drift:${file}`,
      kind: 'changed',
      word: 'changed',
      what: `${file} was edited natively and no longer matches the source`,
      where: null,
      remedy: 'meta-harness generate',
      section: 'drift',
    })
  }

  for (const row of snap.status.filter((s) => s.state === 'MISSING')) {
    actions.push({
      id: `missing:${row.path}`,
      kind: 'missing',
      word: 'missing',
      what: `${row.path} is managed but absent from disk`,
      where: row.target,
      remedy: 'meta-harness generate',
      section: 'sync',
    })
  }

  for (const gate of snap.trustGates.filter((g) => g.relevant)) {
    actions.push({
      id: `gate:${gate.target}:${gate.gate}`,
      kind: 'pending',
      word: 'inert',
      what: `${gate.target} — ${gate.gate} not accepted, so ${plural(gate.blocks.length, 'file')} ${
        gate.blocks.length === 1 ? 'stays' : 'stay'
      } inert`,
      where: gate.blocks.join(', ') || null,
      remedy: null,
      section: 'targets',
    })
  }

  for (const issue of snap.model?.issues ?? []) {
    actions.push({
      id: `issue:${issue.file}:${issue.message}`,
      kind: issue.level === 'error' ? 'conflict' : 'changed',
      word: issue.level,
      what: issue.message,
      where: issue.file,
      remedy: null,
      section: 'source',
    })
  }

  for (const warning of plan?.warnings ?? []) {
    actions.push({
      id: `warn:${warning}`,
      kind: 'changed',
      word: 'warning',
      what: warning,
      where: null,
      remedy: null,
      section: 'sync',
    })
  }

  return actions
}

export function Overview({ snapshot, onNavigate }: { snapshot: Snapshot; onNavigate: (section: string) => void }) {
  const { plan, model } = snapshot

  if (!snapshot.configured || !snapshot.sourceExists) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Overview" lede={<>No harness source in <Mono>{snapshot.root}</Mono> yet.</>} />
        <Panel bleed>
          <EmptyState
            title="This repo has no meta-harness source directory"
            body={
              <>
                meta-harness keeps one source directory and generates every agent’s native config from it. Nothing
                has been set up here, so there is nothing to compare against.
              </>
            }
            command="meta-harness init"
            hint={
              <>
                <Command>init</Command> creates <Mono>{snapshot.sourceDir}</Mono> and imports any native config it
                finds, so nothing you already have is lost.
              </>
            }
          />
        </Panel>
      </div>
    )
  }

  const actions = buildActions(snapshot)
  const byState = {
    clean: snapshot.status.filter((s) => s.state === 'clean').length,
    link: snapshot.status.filter((s) => s.state === 'link').length,
    edited: snapshot.status.filter((s) => s.state === 'EDITED').length,
    missing: snapshot.status.filter((s) => s.state === 'MISSING').length,
  }
  const counts = model?.counts ?? {}
  const categories = Object.entries(counts).filter(([, n]) => n > 0)

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Overview"
        lede={
          <>
            <Mono>{snapshot.sourceDir}</Mono> drives{' '}
            {plan?.targets.length ? plan.targets.join(' and ') : 'no enabled target'} in{' '}
            <Mono>{snapshot.root}</Mono>.
          </>
        }
      />

      <Panel
        title={actions.length ? `Needs action · ${actions.length}` : 'Needs action'}
        description={
          actions.length
            ? 'Every line names the file, the target, and the command that clears it.'
            : undefined
        }
        bleed
      >
        {actions.length === 0 ? (
          <p className="px-4 py-6 text-body text-muted">
            Nothing needs action. Every managed file matches the source, and no trust gate is blocking a generated
            file.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[7.5rem]">State</Th>
                <Th>What</Th>
                <Th className="w-[15rem]">Where</Th>
                <Th className="w-[17.5rem]">Remedy</Th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <StatusPill kind={a.kind} label={a.word} />
                  </Td>
                  <Td className="text-body">{a.what}</Td>
                  <Td>{a.where ? <Mono className="break-all text-muted">{a.where}</Mono> : <span className="text-muted">—</span>}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      {a.remedy ? <Command>{a.remedy}</Command> : <span className="text-label text-muted">manual</span>}
                      {a.section ? (
                        <Button
                          variant="quiet"
                          className="min-h-6 px-2 py-0.5 text-micro"
                          onClick={() => onNavigate(a.section as string)}
                        >
                          open
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Panel title="Harness" description="What this run is configured to do.">
          <KeyValue
            items={[
              {
                key: 'Mode',
                value: (
                  <Tooltip
                    label={
                      plan?.mode === 'bootstrap'
                        ? 'Bootstrap: the source directory is being populated from native config found in the repo.'
                        : 'Reconcile: the source directory exists and is the authority; native files are compared against it.'
                    }
                  >
                    <span className="cursor-help font-mono">{plan?.mode ?? 'unknown'}</span>
                  </Tooltip>
                ),
              },
              { key: 'Source', value: <Mono>{snapshot.sourceDir}</Mono> },
              { key: 'Root', value: <Mono className="break-all">{snapshot.root}</Mono> },
              {
                key: 'Enabled',
                value: (
                  <span className="flex flex-wrap gap-1.5">
                    {(plan?.targets ?? []).map((t) => (
                      <StatusPill key={t} kind="clean" label={t} explain={false} />
                    ))}
                    {plan?.targets.length ? null : <span className="text-muted">none</span>}
                  </span>
                ),
              },
              {
                key: 'Proposed',
                value: (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {(plan?.proposed ?? []).map((t) => (
                      <Tooltip key={t} label={`${t} was detected in this repo but is not enabled. meta-harness never enables a target for you.`}>
                        <span className="cursor-help">
                          <StatusPill kind="pending" label={t} explain={false} />
                        </span>
                      </Tooltip>
                    ))}
                    {plan?.proposed.length ? null : <span className="text-muted">none</span>}
                  </span>
                ),
              },
              { key: 'Scan took', value: <Mono>{snapshot.durationMs}ms</Mono> },
            ]}
          />
        </Panel>

        <Panel
          title="Output"
          description={`${plural(snapshot.status.length, 'managed file')} across the enabled targets.`}
          actions={
            <Button variant="quiet" className="text-micro" onClick={() => onNavigate('sync')}>
              Open sync
            </Button>
          }
        >
          {snapshot.status.length === 0 ? (
            <EmptyState
              title="Nothing generated yet"
              body="There is no manifest, which means the source has never been written out to a target."
              command="meta-harness sync"
            />
          ) : (
            <>
            <div className="flex flex-wrap gap-2">
              <CountChip label="clean" value={byState.clean} status={resolveFileState('clean')} />
              <CountChip label="link" value={byState.link} status={resolveFileState('link')} />
              <CountChip label="changed" value={byState.edited} status={resolveFileState('EDITED')} />
              <CountChip label="missing" value={byState.missing} status={resolveFileState('MISSING')} />
              <CountChip label="pending" value={plan?.generates.length ?? 0} status={resolve('pending')} />
              <CountChip label="imports" value={plan?.imports.length ?? 0} status={resolve('new')} />
              <CountChip label="conflicts" value={plan?.conflicts.length ?? 0} status={resolve('conflict')} />
            </div>
            <p className="mt-3 max-w-[72ch] text-label text-muted">
              {plan?.generates.length
                ? `${plural(plan.generates.length, 'file')} would be rewritten by the next generate.`
                : 'A generate would write nothing — every output already matches the source.'}
            </p>
            </>
          )}
        </Panel>
      </div>

      <Panel
        title="Source model"
        description="What the source directory declares, by category."
        actions={
          <Button variant="quiet" className="text-micro" onClick={() => onNavigate('source')}>
            Open source
          </Button>
        }
        bleed
      >
        {categories.length === 0 ? (
          <EmptyState
            title="The source directory is empty"
            body="No rules, agents, or commands have been declared yet."
            command="meta-harness init"
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th className="w-[6rem] text-right">Items</Th>
                <Th>Reaches</Th>
              </tr>
            </thead>
            <tbody>
              {categories.map(([category, n]) => {
                const reaches = snapshot.detection.filter((d) => d.enabled && d.supports.includes(category))
                return (
                  <Tr key={category}>
                    <Td className="font-mono">{category}</Td>
                    <Td className="text-right font-semibold tabular-nums">{n}</Td>
                    <Td>
                      {reaches.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {reaches.map((d) => (
                            <Mono key={d.target} className="text-muted">
                              {d.target}
                            </Mono>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted">no enabled target supports this</span>
                      )}
                    </Td>
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
