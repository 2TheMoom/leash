import { type ReactNode } from 'react'

export type ChipVariant = 'ok' | 'hold' | 'stop' | 'rope' | 'plain'

const CHIP_CLASSES: Record<ChipVariant, string> = {
  ok: 'text-slack bg-slack-wash border-slack',
  hold: 'text-[#B8400F] bg-tension-wash border-[#B8400F]',
  stop: 'text-stop bg-stop-wash border-stop',
  rope: 'text-rope-deep bg-rope-wash border-rope-deep',
  plain: 'text-ink2 bg-steel2 border-steel2',
}

interface ChipProps {
  variant: ChipVariant
  children: ReactNode
  dot?: boolean
}

export function Chip({ variant, children, dot }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-[6px] font-mono text-[11px] font-medium tracking-[0.07em] uppercase px-[9px] py-[5px] rounded-full border ${CHIP_CLASSES[variant]}`}
    >
      {dot && (
        <span
          className="w-[7px] h-[7px] rounded-full bg-current"
          style={{ animation: 'blink 2s infinite' }}
        />
      )}
      {children}
    </span>
  )
}

interface ChipLinkProps {
  href: string
  children: ReactNode
  /** Opens in a new tab and shows the arrow (default true). */
  external?: boolean
  className?: string
}

/** A link drawn as a small chip: replaces underlined text links. */
export function ChipLink({ href, children, external = true, className = '' }: ChipLinkProps) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`inline-flex items-center gap-[4px] font-mono text-[11px] font-medium tracking-[0.04em] px-[8px] py-[2px] rounded-full border border-rope-deep/40 bg-rope-wash text-rope-deep no-underline transition-colors hover:bg-rope hover:text-white hover:border-rope focus-visible:outline-2 focus-visible:outline-tension ${className}`}
    >
      {children}
      {external && <span aria-hidden="true" className="text-[10px] leading-none">&#8599;</span>}
    </a>
  )
}
