import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { isAddress } from 'viem'
import { LogoMark } from './Logo'
import { ChipLink } from './Chip'
import { describeConnectError, pickWallets, safeIcon, type WalletOption } from '../lib/walletList'
import { SUPPORTED_CHAIN_IDS } from '../contracts/addresses'

const NETWORKS: { id: number; name: string; note: string }[] = [
  { id: 5042, name: 'Mainnet', note: 'real USDC' },
  { id: 5042002, name: 'Testnet', note: 'practice USDC' },
]

const INSTALL_LINKS: { name: string; href: string }[] = [
  { name: 'MetaMask', href: 'https://metamask.io/download/' },
  { name: 'Rabby', href: 'https://rabby.io/' },
]

type Status = { kind: 'idle' | 'wait' | 'error' | 'rejected'; walletId?: string; message: string }

interface WalletTagProps {
  open: boolean
  onClose: () => void
  chainId: number
  onChainChange: (id: number) => void
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href]'
const IDLE: Status = { kind: 'idle', message: 'Pick a wallet to connect.' }

/**
 * The connect step, drawn as a tag hanging on a rope. Built on the wallets the browser
 * announces (EIP-6963), so there is no third-party wallet kit and no outside request.
 */
export function WalletTag({ open, onClose, chainId, onChainChange }: WalletTagProps) {
  const { connectors, connectAsync } = useConnect()
  const { address, connector: active, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [copied, setCopied] = useState(false)
  const wallets = pickWallets(connectors)
  const [status, setStatus] = useState<Status>(IDLE)
  const [watchValue, setWatchValue] = useState('')
  const [watchError, setWatchError] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    setStatus(isConnected ? { kind: 'idle', message: 'Connected. Pick another wallet to switch.' } : IDLE)
    setWatchError('')
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => returnFocus.current?.focus?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  async function pick(w: WalletOption<(typeof connectors)[number]>) {
    if (status.kind === 'wait') return
    if (isConnected && active?.id === w.connector.id) return onClose()
    const net = chainId === 5042 ? 'Mainnet' : 'Testnet'
    setStatus({ kind: 'wait', walletId: w.connector.id, message: `Check ${w.name} and approve sharing your address on Arc ${net}.` })
    try {
      await connectAsync({ connector: w.connector, chainId })
      onClose()
    } catch (err) {
      console.error(`[wallet] connect to ${w.name} failed`, err)
      const d = describeConnectError(err, w.name)
      setStatus({ kind: d.kind, walletId: w.connector.id, message: d.message })
    }
  }

  function watch(e: React.FormEvent) {
    e.preventDefault()
    const v = watchValue.trim()
    if (!isAddress(v)) return setWatchError('Enter a full 0x vault address.')
    window.location.assign(`/app?vault=${v}&chain=${chainId}`)
  }

  if (!open) return null

  const statusTone =
    status.kind === 'error' || status.kind === 'rejected' ? 'text-stop' : status.kind === 'wait' ? 'text-tension' : 'text-ink2'

  return (
    <div className="fixed inset-0 z-[10001]" onKeyDown={onKeyDown}>
      <div className="tag-scrim absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute top-0 right-[clamp(8px,4vw,40px)] w-[min(380px,calc(100vw-16px))] max-h-dvh overflow-y-auto"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-tag-title"
      >
        <div className="tag-swing grid justify-items-center">
          <div
            aria-hidden="true"
            className="w-1 h-[52px] rounded-sm"
            style={{ background: 'repeating-linear-gradient(180deg, #2A3BFF 0 6px, #1B28C9 6px 9px)' }}
          />
          <div
            className="relative w-full bg-plate border-[1.5px] border-ink rounded-md px-4 pt-7 pb-4 grid gap-[13px]"
            style={{ boxShadow: '6px 6px 0 var(--ink)' }}
          >
            <span aria-hidden="true" className="absolute top-[9px] left-1/2 -ml-[7px] w-[15px] h-[15px] rounded-full border-[1.5px] border-ink bg-paper" />
            <div className="flex items-center gap-[10px]">
              <span className="inline-flex items-center gap-[9px] font-display font-black tracking-[0.04em] text-[15px]" style={{ fontStretch: '118%' }}>
                <LogoMark size={22} />
                LEASH
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="ml-auto w-8 h-8 border-[1.5px] border-ink rounded bg-plate text-ink text-[16px] leading-none cursor-pointer hover:bg-steel2"
              >
                &times;
              </button>
            </div>

            <h2 id="wallet-tag-title" className="font-display font-black text-[22px] leading-none m-0" style={{ fontStretch: '112%' }}>
              {isConnected ? 'Your handle' : 'Take the handle'}
            </h2>

            {isConnected && address && (
              <div className="grid gap-2 border-[1.5px] border-ink rounded p-3 bg-slack-wash">
                <div className="flex items-center gap-2">
                  {safeIcon(active?.icon) && <img src={safeIcon(active?.icon)} alt="" width={28} height={28} className="rounded" />}
                  <b className="text-[14px]">{active?.name ?? 'Wallet'}</b>
                  <span className="ml-auto font-mono text-[10px] tracking-[0.08em] uppercase text-slack">Connected</span>
                </div>
                <div className="font-mono text-[12px] break-all" title={address}>{address}</div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }).catch(() => {}) }}
                    className="font-mono text-[12px] border-[1.5px] border-ink rounded px-[10px] py-[6px] bg-plate hover:bg-steel2 cursor-pointer"
                  >
                    {copied ? 'Copied' : 'Copy address'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { disconnect(); onClose() }}
                    className="font-mono text-[12px] border-[1.5px] border-stop rounded px-[10px] py-[6px] bg-plate text-stop hover:bg-stop-wash cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 border-[1.5px] border-ink rounded overflow-hidden bg-plate" role="group" aria-label="Network">
              {NETWORKS.filter((n) => (SUPPORTED_CHAIN_IDS as readonly number[]).includes(n.id)).map((n, i) => {
                const on = chainId === n.id
                const main = n.id === 5042
                const tone = on ? (main ? 'bg-tension text-[#14081a]' : 'bg-ink text-paper') : 'bg-transparent text-ink'
                const noteTone = on ? (main ? 'text-[#4a1b08]' : 'text-steel') : 'text-ink3'
                return (
                  <button
                    key={n.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChainChange(n.id)}
                    className={`text-left grid gap-[2px] px-[10px] py-[11px] font-body font-semibold text-[13px] cursor-pointer ${i > 0 ? 'border-l-[1.5px] border-ink' : ''} ${tone}`}
                  >
                    {n.name}
                    <span className={`font-mono font-medium text-[11px] ${noteTone}`}>{n.note}</span>
                  </button>
                )
              })}
            </div>

            {wallets.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {wallets.map((w) => {
                  const mine = status.walletId === w.connector.id
                  const isActive = isConnected && active?.id === w.connector.id
                  const state = mine ? status.kind : 'idle'
                  const tone =
                    state === 'wait' ? 'bg-tension-wash border-tension' : state === 'error' || state === 'rejected' ? 'bg-stop-wash border-stop' : 'bg-plate border-ink'
                  const chipTone = state === 'wait' ? 'text-tension' : state === 'idle' ? 'text-slack bg-slack-wash' : 'text-stop'
                  const label = state === 'wait' ? 'Waiting' : state === 'rejected' ? 'Rejected' : state === 'error' ? 'Failed' : isActive ? 'Connected' : isConnected ? 'Switch' : 'Detected'
                  return (
                    <button
                      key={w.connector.uid}
                      type="button"
                      onClick={() => void pick(w)}
                      disabled={status.kind === 'wait'}
                      className={`grid gap-2 justify-items-start text-left p-3 min-w-0 border-[1.5px] rounded font-body font-semibold text-[14px] cursor-pointer transition-[transform,box-shadow] hover:-translate-x-px hover:-translate-y-px disabled:cursor-wait ${tone}`}
                    >
                      {w.icon ? (
                        <img src={w.icon} alt="" width={36} height={36} className="rounded" />
                      ) : (
                        <span className="w-9 h-9 rounded bg-rope text-white grid place-items-center font-display font-extrabold">{w.name.slice(0, 1).toUpperCase()}</span>
                      )}
                      <span className="break-words max-w-full">{w.name}</span>
                      <span className={`font-mono text-[10px] tracking-[0.08em] uppercase px-[6px] py-[3px] rounded-[3px] ${chipTone}`}>{label}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="border-[1.5px] border-dashed border-steel rounded p-3 grid gap-2">
                <b className="text-[14px]">No browser wallet found</b>
                <p className="m-0 text-[13px] text-ink2">Install one in this browser, then reload this page.</p>
                <div className="flex flex-wrap gap-3">
                  {INSTALL_LINKS.map((l) => (
                    <ChipLink key={l.href} href={l.href}>
                      {l.name}
                    </ChipLink>
                  ))}
                </div>
              </div>
            )}

            <div role="status" aria-live="polite" className={`font-mono text-[12.5px] min-h-5 ${statusTone}`}>
              {status.message}
            </div>

            {!isConnected && <div className="grid grid-cols-2 gap-[10px]">
              <div className="border border-dashed border-steel rounded px-[10px] py-[9px] text-[12.5px] text-ink2 leading-snug">
                <b className="block font-mono text-[10.5px] tracking-[0.1em] uppercase text-slack mb-[3px]">Leash reads</b>
                Your address and the network. Nothing else.
              </div>
              <div className="border border-dashed border-steel rounded px-[10px] py-[9px] text-[12.5px] text-ink2 leading-snug">
                <b className="block font-mono text-[10.5px] tracking-[0.1em] uppercase text-stop mb-[3px]">Leash cannot</b>
                Move funds or see your keys. Every action asks your wallet.
              </div>
            </div>}

            <p className="m-0 text-[12.5px] text-ink2">
              <b className="text-ink">Owner wallet tip.</b> The owner key is the only key that can withdraw. Use a hardware wallet or a Safe.
            </p>

            {!isConnected && <form onSubmit={watch} className="grid gap-2" noValidate>
              <label htmlFor="wallet-tag-watch" className="text-[12.5px] text-ink2">
                Just looking? Paste a vault to watch it read-only, no wallet.
              </label>
              <div className="flex gap-2">
                <input
                  id="wallet-tag-watch"
                  value={watchValue}
                  onChange={(e) => {
                    setWatchValue(e.target.value)
                    setWatchError('')
                  }}
                  placeholder="0x vault address"
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 min-w-0 font-mono text-[13px] border-[1.5px] border-ink rounded p-[10px] bg-plate"
                />
                <button
                  type="submit"
                  className="font-body font-semibold text-[14px] border-[1.5px] border-ink rounded bg-rope text-white px-[14px] py-[10px] cursor-pointer"
                  style={{ boxShadow: '3px 3px 0 var(--ink)' }}
                >
                  Watch
                </button>
              </div>
              {watchError && <span className="font-mono text-[12px] text-stop">{watchError}</span>}
            </form>}
          </div>
        </div>
      </div>
    </div>
  )
}
