import { useRef, useState, useCallback, useEffect } from 'react'
import { HoldButton } from './HoldButton'

const DAILY_CAP = 25
const PER_TX = 10
const INITIAL_VAULT = 120

interface DemoState {
  vault: number
  held: number
  spent: number
  pending: boolean
  busy: boolean
  alt: number
}

const INITIAL_STATE: DemoState = {
  vault: INITIAL_VAULT,
  held: 0,
  spent: 0,
  pending: false,
  busy: false,
  alt: 0,
}

function f2(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

type StatusKind = '' | 'ok' | 'hold' | 'stop'

const STATUS_CLASSES: Record<StatusKind, string> = {
  '': 'bg-steel2 text-ink2',
  ok: 'bg-slack-wash text-[#07603f]',
  hold: 'bg-tension-wash text-[#8a2f08]',
  stop: 'bg-stop-wash text-[#8e1d15]',
}

export function TetherDemo() {
  const [s, setS] = useState<DemoState>(INITIAL_STATE)
  const [status, setStatus] = useState<{ kind: StatusKind; text: string }>({
    kind: '',
    text: `Agent limits: ${f2(PER_TX)} per payment, ${f2(DAILY_CAP)} per day. Pick an action.`,
  })
  const [heldVisible, setHeldVisible] = useState(false)

  // SVG animation state
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const ropeRef = useRef<SVGPathElement>(null)
  const ropeTwistRef = useRef<SVGPathElement>(null)
  const coinRef = useRef<SVGGElement>(null)
  const coinHeldRef = useRef<SVGGElement>(null)
  const pulseRef = useRef<SVGCircleElement>(null)
  const sagRef = useRef(1)

  function setSag(fr: number) {
    const sag = 6 + Math.round(96 * Math.max(0, Math.min(1, fr)))
    const d = `M82 170 Q 191 ${170 + sag} 300 170`
    ropeRef.current?.setAttribute('d', d)
    ropeTwistRef.current?.setAttribute('d', d)
    sagRef.current = fr
  }

  function putEl(el: SVGGElement | SVGCircleElement | null, x: number, y: number, opacity: number) {
    if (!el) return
    el.setAttribute('transform', `translate(${x} ${y})`)
    el.setAttribute('opacity', String(opacity))
  }

  function animateSag(target: number, ms = 500) {
    if (reduceMotion || !ropeRef.current) { setSag(target); return Promise.resolve() }
    return new Promise<void>((res) => {
      const start = sagRef.current
      const t0 = performance.now()
      function step(ts: number) {
        const p = Math.min(1, (ts - t0) / ms)
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
        setSag(start + (target - start) * e)
        if (p < 1) requestAnimationFrame(step)
        else res()
      }
      requestAnimationFrame(step)
    })
  }

  type Point = [number, number]
  function moveEl(el: SVGGElement | null, pts: Point[], ms: number) {
    if (!el || reduceMotion || ms <= 0) {
      if (pts.length > 0) { const last = pts[pts.length - 1]; putEl(el, last[0], last[1], 1) }
      return Promise.resolve()
    }
    const segs: number[] = []
    let tot = 0
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      segs.push(l)
      tot += l
    }
    return new Promise<void>((res) => {
      const t0 = performance.now()
      function step(ts: number) {
        const u = Math.min(1, (ts - t0) / ms)
        let d = u * tot
        let k = 0
        while (k < segs.length - 1 && d > segs[k]) { d -= segs[k]; k++ }
        const q = segs[k] ? Math.min(1, d / segs[k]) : 1
        putEl(el, pts[k][0] + (pts[k + 1][0] - pts[k][0]) * q, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * q, 1)
        if (u < 1) requestAnimationFrame(step); else res()
      }
      requestAnimationFrame(step)
    })
  }

  const AG: Point = [368, 170]
  const GX = 450
  const PX = 506
  const Y: [number, number, number] = [80, 170, 260]

  const reject = useCallback(async (msg: string) => {
    setStatus({ kind: 'stop', text: msg })
    await moveEl(coinRef.current, [AG, [418, AG[1]], AG], 700)
    putEl(coinRef.current, 0, 0, 0)
  }, [])

  const payAllowed = useCallback(async () => {
    setS((prev) => {
      if (prev.busy) return prev
      return { ...prev, busy: true }
    })

    const amt = 4
    const yIdx = s.alt % 2
    const name = yIdx === 0 ? 'Cloud API' : 'Data feed'

    if (amt > PER_TX) {
      await reject(`Rejected. ${f2(amt)} is over the per-payment cap.`)
    } else if (s.spent + amt > DAILY_CAP + 1e-9) {
      await reject(`Rejected. That would pass the daily cap. ${f2(DAILY_CAP - s.spent)} left today.`)
    } else {
      await moveEl(coinRef.current, [AG, [GX, Y[yIdx]], [PX, Y[yIdx]]], 900)
      putEl(coinRef.current, 0, 0, 0)
      setS((prev) => ({ ...prev, vault: prev.vault - amt, spent: prev.spent + amt, alt: prev.alt + 1 }))
      setStatus({ kind: 'ok', text: `Paid ${f2(amt)} USDC to ${name}. It is on the allowlist, so it went straight through.` })
      await animateSag(1 - (s.spent + amt) / DAILY_CAP)
    }
    setS((prev) => ({ ...prev, busy: false }))
  }, [s, reject])

  const payBig = useCallback(async () => {
    setS((prev) => ({ ...prev, busy: true }))
    await reject(`Rejected. 40.00 is over the per-payment cap of ${f2(PER_TX)}. Nothing was sent and no gas was spent.`)
    setS((prev) => ({ ...prev, busy: false }))
  }, [reject])

  const payNew = useCallback(async () => {
    if (s.pending) return
    setS((prev) => ({ ...prev, busy: true }))
    const amt = 8
    await moveEl(coinRef.current, [AG, [GX, Y[2]]], 800)
    putEl(coinRef.current, 0, 0, 0)
    putEl(coinHeldRef.current, GX, Y[2], 1)
    pulseRef.current?.setAttribute('opacity', '1')
    pulseRef.current?.classList.add('pulse-ring')
    setS((prev) => ({ ...prev, held: amt, pending: true, busy: false }))
    setHeldVisible(true)
    setStatus({ kind: 'hold', text: `Held. 0x9f2c...b1c3 is not on the allowlist, so the payment stopped at the gate. The ${f2(amt)} is reserved, not sent.` })
  }, [s.pending])

  const settleHeld = useCallback(async (doApprove: boolean) => {
    if (!s.pending) return
    const amt = s.held
    setHeldVisible(false)
    pulseRef.current?.classList.remove('pulse-ring')
    pulseRef.current?.setAttribute('opacity', '0')
    if (doApprove) {
      await moveEl(coinHeldRef.current, [[GX, Y[2]], [PX, Y[2]]], 600)
      setS((prev) => ({ ...prev, vault: prev.vault - amt, held: 0, pending: false, busy: false }))
      setStatus({ kind: 'ok', text: `Approved. ${f2(amt)} USDC went to 0x9f2c...b1c3 because you said yes.` })
    } else {
      await moveEl(coinHeldRef.current, [[GX, Y[2]], AG], 700)
      setS((prev) => ({ ...prev, held: 0, pending: false, busy: false }))
      setStatus({ kind: 'ok', text: `Cancelled. The ${f2(amt)} never left the vault and is available again.` })
    }
    putEl(coinHeldRef.current, 0, 0, 0)
  }, [s.held, s.pending])

  const reset = useCallback(() => {
    putEl(coinRef.current, 0, 0, 0)
    putEl(coinHeldRef.current, 0, 0, 0)
    pulseRef.current?.classList.remove('pulse-ring')
    pulseRef.current?.setAttribute('opacity', '0')
    setHeldVisible(false)
    setS({ ...INITIAL_STATE })
    setStatus({ kind: '', text: `Agent limits: ${f2(PER_TX)} per payment, ${f2(DAILY_CAP)} per day. Pick an action.` })
    void animateSag(1)
  }, [animateSag])

  useEffect(() => { setSag(1) }, [])

  const avail = s.vault - s.held
  const off = s.busy

  return (
    <div
      className="border border-ink rounded-[14px] bg-plate p-[14px] grid gap-3"
      style={{ boxShadow: '8px 8px 0 var(--ink)' }}
    >
      <svg
        viewBox="0 0 600 340"
        className="w-full h-auto block"
        role="img"
        aria-label="A vault tied by a rope to an agent. The agent sends coins to payees. Allowed payees receive immediately; new addresses are held at the gate."
      >
        {/* Vault */}
        <circle cx="56" cy="170" r="24" fill="none" stroke="var(--ink)" strokeWidth="7" />
        <circle cx="56" cy="166" r="5" fill="var(--ink)" />
        <rect x="53.5" y="168" width="5" height="12" fill="var(--ink)" />
        <text x="56" y="216" textAnchor="middle" className="font-mono text-[11px] tracking-[0.06em]" fill="var(--ink3)" style={{ font: '500 11px var(--fm)', letterSpacing: '0.06em' }}>VAULT</text>
        {/* Rope */}
        <path ref={ropeRef} d="M82 170 Q 191 266 300 170" fill="none" stroke="var(--rope)" strokeWidth="9" strokeLinecap="round" />
        <path ref={ropeTwistRef} d="M82 170 Q 191 266 300 170" fill="none" stroke="#fff" strokeWidth="9" strokeDasharray="3 9" opacity="0.4" strokeLinecap="round" />
        <text x="191" y="292" textAnchor="middle" fill="var(--ink3)" style={{ font: '500 11px var(--fm)', letterSpacing: '0.06em' }}>SLACK IS BUDGET LEFT</text>
        {/* Agent */}
        <rect x="300" y="138" width="68" height="64" rx="12" fill="var(--ink)" />
        <text x="334" y="178" textAnchor="middle" fill="var(--rope-wash)" style={{ font: '600 22px var(--fm)' }}>&gt;_</text>
        <text x="334" y="222" textAnchor="middle" fill="var(--ink3)" style={{ font: '500 11px var(--fm)', letterSpacing: '0.06em' }}>AGENT</text>
        {/* Allowlist line */}
        <line x1="450" y1="38" x2="450" y2="300" stroke="var(--steel)" strokeWidth="2" strokeDasharray="4 6" />
        <text x="450" y="24" textAnchor="middle" fill="var(--ink3)" style={{ font: '500 11px var(--fm)', letterSpacing: '0.06em' }}>ALLOWLIST</text>
        {/* Payees */}
        <text x="550" y="50" textAnchor="middle" fill="var(--slack)" style={{ font: '500 11px var(--fm)', letterSpacing: '0.06em' }}>ALLOWED</text>
        <text x="550" y="140" textAnchor="middle" fill="var(--slack)" style={{ font: '500 11px var(--fm)', letterSpacing: '0.06em' }}>ALLOWED</text>
        <text x="546" y="230" textAnchor="middle" fill="#B8400F" style={{ font: '500 11px var(--fm)', letterSpacing: '0.04em' }}>NEW ADDR</text>
        <rect x="506" y="58" width="88" height="44" rx="8" fill="none" stroke="var(--ink)" strokeWidth="2" />
        <text x="550" y="85" textAnchor="middle" fill="var(--ink)" style={{ font: '500 12px var(--fm)' }}>Cloud API</text>
        <rect x="506" y="148" width="88" height="44" rx="8" fill="none" stroke="var(--ink)" strokeWidth="2" />
        <text x="550" y="175" textAnchor="middle" fill="var(--ink)" style={{ font: '500 12px var(--fm)' }}>Data feed</text>
        <rect x="506" y="238" width="88" height="44" rx="8" fill="none" stroke="var(--tension)" strokeWidth="2" strokeDasharray="5 4" />
        <text x="550" y="265" textAnchor="middle" fill="var(--ink)" style={{ font: '500 12px var(--fm)' }}>0x9f2c...b1c3</text>
        {/* Gate pulse */}
        <circle ref={pulseRef} cx="450" cy="260" r="16" fill="none" stroke="var(--tension)" strokeWidth="3" opacity="0" style={{ transformOrigin: 'center', transformBox: 'fill-box' }} />
        {/* Coins */}
        <g ref={coinRef} opacity="0">
          <circle r="11" fill="var(--rope)" stroke="var(--ink)" strokeWidth="2" />
          <text y="4.5" textAnchor="middle" fill="#fff" style={{ font: '700 12px var(--fm)' }}>$</text>
        </g>
        <g ref={coinHeldRef} opacity="0">
          <circle r="11" fill="var(--tension)" stroke="var(--ink)" strokeWidth="2" />
          <text y="4.5" textAnchor="middle" fill="#fff" style={{ font: '700 12px var(--fm)' }}>$</text>
        </g>
      </svg>

      {/* Meters */}
      <div className="grid grid-cols-3 gap-2" aria-label="Demo balances">
        {[
          { label: 'Available', value: f2(avail), sub: '' },
          { label: 'Held', value: f2(s.held), sub: '' },
          { label: 'Spent today', value: f2(s.spent), sub: `of ${f2(DAILY_CAP)}` },
        ].map(({ label, value, sub }) => (
          <div key={label} className="border border-steel rounded px-[8px] py-[6px] min-w-0">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink3 block leading-tight">{label}</span>
            <b className="font-mono text-[clamp(14px,3.5vw,20px)] leading-[1.1] tabular-nums block whitespace-nowrap">{value}</b>
            {sub && <span className="font-mono text-[9px] text-ink3 whitespace-nowrap">{sub}</span>}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { void payAllowed() }} disabled={off} className="text-[13px] font-medium px-3 py-[9px] border border-ink rounded bg-plate hover:bg-steel2 disabled:opacity-40 transition-colors">Pay allowed payee · 4.00</button>
        <button onClick={() => { void payNew() }} disabled={off || s.pending} className="text-[13px] font-medium px-3 py-[9px] border border-ink rounded bg-plate hover:bg-steel2 disabled:opacity-40 transition-colors">Pay new address · 8.00</button>
        <button onClick={() => { void payBig() }} disabled={off} className="text-[13px] font-medium px-3 py-[9px] border border-ink rounded bg-plate hover:bg-steel2 disabled:opacity-40 transition-colors">Try 40.00</button>
        <button onClick={reset} disabled={off} className="text-[13px] font-medium px-3 py-[9px] border border-ink rounded bg-plate hover:bg-steel2 disabled:opacity-40 transition-colors">Reset</button>
      </div>

      {/* Held card */}
      {heldVisible && (
        <div className="border border-tension bg-tension-wash rounded p-3 grid gap-[10px]">
          <p className="text-[14px]">
            <b>Held.</b> {f2(s.held)} USDC to 0x9f2c...b1c3 is reserved in the vault. It has not left. You decide.
          </p>
          <div className="flex flex-wrap gap-2">
            <HoldButton onHeld={() => { void settleHeld(true) }}>Hold to approve</HoldButton>
            <button onClick={() => { void settleHeld(false) }} className="text-[13px] font-medium px-3 py-[9px] border border-ink rounded bg-plate hover:bg-steel2 transition-colors">Cancel payment</button>
          </div>
        </div>
      )}

      {/* Status */}
      <p
        className={`min-h-[44px] text-[14px] rounded px-3 py-[10px] ${STATUS_CLASSES[status.kind]}`}
        aria-live="polite"
      >
        {status.text}
      </p>
    </div>
  )
}
