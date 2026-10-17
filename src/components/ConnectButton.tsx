import { useState } from 'react'
import { useAccount } from 'wagmi'
import { WalletTag } from './WalletTag'
import { safeIcon } from '../lib/walletList'
import { shortAddr } from '../lib/format'

interface ConnectButtonProps {
  /** Network the app is currently showing. */
  chainId: number
  /** Called when the owner picks a network in the tag. */
  onChainChange: (id: number) => void
}

/** Top-bar wallet control: opens the tag when disconnected, shows the account when connected. */
export function ConnectButton({ chainId, onChainChange }: ConnectButtonProps) {
  const { address, connector, isConnected } = useAccount()
  const [open, setOpen] = useState(false)
  const icon = safeIcon(connector?.icon)

  return (
    <>
      {isConnected && address ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          title={address}
          className="inline-flex items-center gap-2 border-[1.5px] border-ink rounded bg-plate px-[10px] py-[7px] font-mono text-[12px] cursor-pointer transition-[transform,box-shadow] hover:-translate-x-px hover:-translate-y-px"
          style={{ boxShadow: '3px 3px 0 var(--ink)' }}
        >
          {icon && <img src={icon} alt="" width={18} height={18} className="rounded-sm" />}
          {shortAddr(address)}
          <span aria-hidden="true" className="text-ink3">&#9662;</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-body font-semibold text-[14px] px-[16px] py-[10px] rounded border-[1.5px] border-ink bg-rope text-white cursor-pointer transition-[transform,box-shadow] hover:-translate-x-px hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px]"
          style={{ boxShadow: '3px 3px 0 var(--ink)' }}
        >
          Connect wallet
        </button>
      )}
      <WalletTag open={open} onClose={() => setOpen(false)} chainId={chainId} onChainChange={onChainChange} />
    </>
  )
}

const NETWORKS: { id: number; label: string }[] = [
  { id: 5042, label: 'Mainnet' },
  { id: 5042002, label: 'Testnet' },
]

/** Two-way network switch for the top bar. Mainnet is orange so real money is never ambiguous. */
export function NetworkSwitch({ chainId, onSelect }: { chainId: number; onSelect: (id: number) => void }) {
  return (
    <div className="inline-grid grid-cols-2 border-[1.5px] border-ink rounded overflow-hidden bg-plate" role="group" aria-label="Network">
      {NETWORKS.map((n, i) => {
        const on = chainId === n.id
        const main = n.id === 5042
        const tone = on ? (main ? 'bg-tension text-[#14081a]' : 'bg-ink text-paper') : 'bg-transparent text-ink hover:bg-steel2'
        return (
          <button
            key={n.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(n.id)}
            className={`px-3 py-[7px] font-body font-semibold text-[13px] cursor-pointer ${i > 0 ? 'border-l-[1.5px] border-ink' : ''} ${tone}`}
          >
            {n.label}
          </button>
        )
      })}
    </div>
  )
}
