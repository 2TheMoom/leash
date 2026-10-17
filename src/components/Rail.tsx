import { formatUsdc } from '../lib/format'

interface RailProps {
  spentRaw: bigint
  dailyCapRaw: bigint
  perPaymentCapRaw: bigint
  frozen?: boolean
  /** Compact mode for sidebar/agent panel */
  compact?: boolean
}

export function Rail({ spentRaw, dailyCapRaw, perPaymentCapRaw, frozen, compact }: RailProps) {
  const daily = dailyCapRaw === 0n ? 1n : dailyCapRaw
  const pct = (n: bigint) => `${Math.min(100, Number((n * 100n) / daily))}%`
  const tickEvery5 = Number(dailyCapRaw) > 0 ? (5 * 1e6 / Number(dailyCapRaw)) * 100 : 10
  const tickPct = `${Math.max(1, Math.min(50, tickEvery5))}%`

  const fillStyle: React.CSSProperties = {
    width: pct(spentRaw),
    background: frozen ? 'var(--ink3)' : 'var(--rope)',
    backgroundImage: frozen ? 'none' : undefined,
  }

  return (
    <div className={compact ? '' : ''}>
      <div
        className="leash-rail"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(${tickPct} - 1px), rgba(10,15,30,.16) calc(${tickPct} - 1px) ${tickPct})`,
        }}
      >
        <div
          className="leash-rail-fill"
          style={fillStyle}
        />
        {perPaymentCapRaw > 0n && perPaymentCapRaw < dailyCapRaw && (
          <div className="leash-rail-pt" style={{ left: pct(perPaymentCapRaw) }} />
        )}
        <div className="leash-rail-stop" />
      </div>
      <div className="flex justify-between font-mono text-[11px] text-ink3 mt-[6px]">
        <span>Spent {formatUsdc(spentRaw)}</span>
        <span className="text-[#B8400F]">Per payment {formatUsdc(perPaymentCapRaw)}</span>
        <span>Daily {formatUsdc(dailyCapRaw)}</span>
      </div>
    </div>
  )
}
