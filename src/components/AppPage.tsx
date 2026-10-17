import { useState, useEffect } from 'react'
import { ConnectButton, NetworkSwitch } from './ConnectButton'
import { usePreferredChain } from '../lib/preferredChain'
import { useAccount, useSwitchChain } from 'wagmi'
import { isAddress } from 'viem'
import { Logo } from './Logo'
import { OwnerDashboard } from './OwnerDashboard'
import { AgentConsole } from './AgentConsole'
import { Chip } from './Chip'
import { isSupported, SUPPORTED_CHAIN_IDS } from '../contracts/addresses'

const CHAIN_CONFIGS: Record<number, { name: string; explorerBase: string }> = {
  5042002: { name: 'Arc Testnet', explorerBase: 'https://explorer.testnet.arc.io' },
  5042:    { name: 'Arc',         explorerBase: 'https://explorer.arc.io' },
}

interface AppPageProps {
  onHome: () => void
}

type Tab = 'owner' | 'agent'

/** Parse ?vault= and ?chain= from the current URL for watch mode. */
function parseWatchParams(): { vault: `0x${string}` | null; chain: number | null } {
  if (typeof window === 'undefined') return { vault: null, chain: null }
  const params = new URLSearchParams(window.location.search)
  const v = params.get('vault')
  const c = params.get('chain')
  return {
    vault: v && isAddress(v) ? (v) : null,
    chain: c ? parseInt(c, 10) : null,
  }
}

export function AppPage({ onHome }: AppPageProps) {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [tab, setTab] = useState<Tab>('owner')

  // Watch mode: read-only view of any vault via query params.
  const [watchParams] = useState(parseWatchParams)
  const isWatchMode = watchParams.vault !== null

  const [preferredChain, setPreferredChain] = usePreferredChain()
  const supported = isSupported(chainId)
  // Watch mode follows the URL. Otherwise follow the wallet when it is on a supported
  // chain, and the owner's last network choice when it is not (or nothing is connected).
  const vaultChainId: number = isWatchMode
    ? (watchParams.chain ?? SUPPORTED_CHAIN_IDS[0])
    : (supported ? chainId : preferredChain)

  const chainConfig = CHAIN_CONFIGS[vaultChainId]
  const explorerBase = chainConfig?.explorerBase ?? 'https://explorer.testnet.arc.io'

  // Keep browser URL in sync when navigating into or out of /app (cosmetic).
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/app')) {
      window.history.replaceState(null, '', '/app' + window.location.search)
    }
  }, [])

  function switchToVaultChain() {
    switchChain({ chainId: vaultChainId })
  }

  function selectNetwork(id: number) {
    setPreferredChain(id)
    if (isConnected && chainId !== id) switchChain({ chainId: id })
  }

  return (
    <div className="min-h-dvh bg-paper grid md:grid-cols-[176px_1fr] overflow-x-hidden">
      {/* Sidebar */}
      <aside className="bg-ink text-white p-[14px] flex md:flex-col gap-3 md:gap-5 items-center md:items-stretch flex-wrap md:flex-nowrap">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); onHome() }}
          aria-label="Leash home"
          className="flex items-center gap-[10px] no-underline"
        >
          <Logo size={28} light />
        </a>

        {/* Watch mode badge */}
        {isWatchMode && (
          <div className="bg-[#1b2238] border border-[#3a4360] rounded px-[10px] py-[6px] text-[11px] font-mono text-[#8e97b0] text-center">
            Read only
          </div>
        )}

        <nav className="flex md:flex-col gap-1 flex-wrap" aria-label="Vault">
          <button
            onClick={() => setTab('owner')}
            className={`text-[14px] font-medium px-[10px] py-[9px] rounded text-left transition-colors ${tab === 'owner' ? 'bg-rope text-white' : 'text-[#C9D0E2] hover:bg-[#1b2238]'}`}
          >
            {isWatchMode ? 'Vault' : 'Owner'}
          </button>
          {!isWatchMode && (
            <button
              onClick={() => setTab('agent')}
              className={`text-[14px] font-medium px-[10px] py-[9px] rounded text-left transition-colors ${tab === 'agent' ? 'bg-rope text-white' : 'text-[#C9D0E2] hover:bg-[#1b2238]'}`}
            >
              Agent
            </button>
          )}
        </nav>
        <div className="mt-auto hidden md:block">
          <p className="font-mono text-[11px] text-[#8e97b0]">
            {chainConfig?.name ?? 'Unsupported chain'}<br />
            Chain {vaultChainId}
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="p-[clamp(14px,2.5vw,24px)] grid gap-4 min-w-0 overflow-x-hidden content-start">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {isWatchMode ? (
              <Chip variant="plain">Read only</Chip>
            ) : chainId && CHAIN_CONFIGS[chainId] ? (
              <Chip variant="rope">{CHAIN_CONFIGS[chainId].name}</Chip>
            ) : chainId ? (
              <Chip variant="stop">Unsupported chain</Chip>
            ) : null}
          </div>
          {!isWatchMode && (
            <div className="flex items-center gap-3 flex-wrap">
              <NetworkSwitch chainId={vaultChainId} onSelect={selectNetwork} />
              <ConnectButton chainId={vaultChainId} onChainChange={selectNetwork} />
            </div>
          )}
        </div>

        {/* Unsupported chain banner */}
        {!isWatchMode && isConnected && !supported && (
          <div className="border border-[#B8400F] bg-tension-wash rounded p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px] text-[#8a2f08]">
              Leash is not deployed on this chain. Switch your wallet to an Arc network to continue.
            </p>
            <div className="flex gap-2 flex-wrap">
              {[{ id: 5042, name: 'Arc Mainnet' }, { id: 5042002, name: 'Arc Testnet' }].map((n) => (
                <button
                  key={n.id}
                  onClick={() => selectNetwork(n.id)}
                  disabled={isSwitching}
                  className="font-body font-semibold text-[13px] px-3 py-[9px] border border-[#B8400F] rounded bg-plate text-[#8a2f08] hover:bg-tension-wash disabled:opacity-40"
                >
                  {isSwitching ? 'Switching...' : `Switch to ${n.name}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Watch mode notice */}
        {isWatchMode && (
          <div className="border border-steel2 bg-steel2 rounded p-3 text-[13px] text-ink2">
            Read-only view of vault {watchParams.vault}. No wallet needed. Write controls are hidden.
          </div>
        )}

        {/* Tab content */}
        {tab === 'owner' && (
          <OwnerDashboard
            chainId={vaultChainId}
            explorerBase={explorerBase}
            walletChainId={isWatchMode ? undefined : chainId}
            onSwitchChain={switchToVaultChain}
            watchVault={watchParams.vault ?? undefined}
            readOnly={isWatchMode}
          />
        )}
        {tab === 'agent' && !isWatchMode && (
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink3 mb-4">
              Agent console. For developers and for the interactive demo.
            </p>
            <div className="bg-plate border border-steel rounded overflow-hidden">
              <AgentConsole chainId={vaultChainId} explorerBase={explorerBase} />
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="font-mono text-[11px] text-ink3 mt-4 border-t border-steel2 pt-4">
          Unaudited software. Start with small amounts. Review the contract before committing real funds.
        </p>
      </div>
    </div>
  )
}
