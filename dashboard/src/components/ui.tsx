/**
 * Registry primitives — thin, token-styled wrappers over Radix.
 *
 * These are the ARIA interaction patterns where hand-rolling ships defects that
 * axe cannot see (a `role="tablist"` with no arrow-key handling passes every
 * automated check and fails every keyboard user). Radix owns roving tabindex,
 * focus trapping, escape handling, `aria-controls` wiring and the hover-intent
 * timers; this file only dresses them in the tokens (DESIGN.md §Components).
 *
 * Presentational chrome lives in ./chrome.tsx and is deliberately bespoke.
 */
import * as React from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { X } from 'lucide-react'
import { cn } from '@/lib/util'

/* -------------------------------------------------------------------------- */
/* Tabs — the section rail and the in-panel switches.                          */
/* -------------------------------------------------------------------------- */

export const Tabs = TabsPrimitive.Root
export const TabsList = TabsPrimitive.List
export const TabsTrigger = TabsPrimitive.Trigger
export const TabsContent = TabsPrimitive.Content

/** In-panel pill tabs (used inside a section, not the rail). */
export function SegmentedList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex items-center gap-1 rounded-control bg-raised p-1', className)}
      {...props}
    />
  )
}

export function SegmentedTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-[4px] px-2.5 py-1 text-micro font-medium text-muted transition-colors duration-fast ease-out-quart',
        'hover:text-ink data-[state=active]:bg-bg data-[state=active]:text-ink data-[state=active]:shadow-panel',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Tooltip — glyph and gate explanations.                                      */
/* -------------------------------------------------------------------------- */

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({
  children,
  label,
  side = 'top',
}: {
  children: React.ReactNode
  label: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="mh-fade z-[var(--z-tooltip)] max-w-[min(20rem,calc(100vw-2rem))] rounded-control border border-line bg-bg px-2.5 py-1.5 text-micro leading-snug text-ink shadow-panel"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-bg" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/* -------------------------------------------------------------------------- */
/* Collapsible — expandable table rows and reference entries.                  */
/* -------------------------------------------------------------------------- */

export const Collapsible = CollapsiblePrimitive.Root
/**
 * WCAG 2.2 AA 2.5.8 wants a 24x24 pointer target. Row-disclosure triggers are
 * a single line of text, which lands at 21px on its own — so the floor lives
 * here, on the shared trigger, rather than on each call site. Applied per
 * section it was already missed twice.
 */
export const CollapsibleTrigger = React.forwardRef<
  React.ComponentRef<typeof CollapsiblePrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger>
>(function CollapsibleTrigger({ className, ...props }, ref) {
  // Plain concatenation, NOT cn(): tailwind-merge cannot tell this project's
  // custom size tokens (`text-data`, `text-label`, …) from color tokens, so it
  // treats `text-data text-ink` as a conflict and silently drops the size.
  // Nothing here needs merge semantics — no call site sets a min-height.
  return (
    <CollapsiblePrimitive.Trigger
      ref={ref}
      className={className ? `min-h-6 ${className}` : 'min-h-6'}
      {...props}
    />
  )
})

export const CollapsibleContent = CollapsiblePrimitive.Content

/* -------------------------------------------------------------------------- */
/* Dialog — conflict detail.                                                   */
/* -------------------------------------------------------------------------- */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogPanel({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="mh-fade fixed inset-0 z-[var(--z-backdrop)] bg-ink/25" />
      <DialogPrimitive.Content
        className={cn(
          'mh-rise fixed left-1/2 top-1/2 z-[var(--z-modal)] flex max-h-[min(44rem,calc(100vh-3rem))] w-[min(64rem,calc(100vw-2rem))]',
          '-translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-panel border border-line bg-bg shadow-panel',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-h3 font-semibold text-ink">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-label text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">
                Both sides of this conflict, shown in full.
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="-mr-1 -mt-1 rounded-control p-1.5 text-muted transition-colors duration-fast ease-out-quart hover:bg-raised hover:text-ink"
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/* -------------------------------------------------------------------------- */
/* Popover — the root switcher.                                                */
/* -------------------------------------------------------------------------- */

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export function PopoverPanel({ className, children, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={6}
        align="start"
        collisionPadding={12}
        className={cn(
          'mh-fade z-[var(--z-dropdown)] min-w-[18rem] max-w-[min(28rem,calc(100vw-2rem))] rounded-panel border border-line bg-bg p-1.5 shadow-panel',
          className,
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

/* -------------------------------------------------------------------------- */
/* ScrollArea — bounded diff panes.                                            */
/* -------------------------------------------------------------------------- */

export function ScrollPane({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <ScrollAreaPrimitive.Root className={cn('relative overflow-hidden', className)} type="auto">
      <ScrollAreaPrimitive.Viewport className="h-full w-full [&>div]:!block">{children}</ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none select-none p-0.5 transition-opacity duration-fast ease-out-quart"
      >
        <ScrollAreaPrimitive.Thumb className="flex-1 rounded-full bg-line" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Scrollbar
        orientation="horizontal"
        className="flex h-2 touch-none select-none p-0.5 transition-opacity duration-fast ease-out-quart"
      >
        <ScrollAreaPrimitive.Thumb className="rounded-full bg-line" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}
