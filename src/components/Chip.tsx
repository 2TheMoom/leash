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
