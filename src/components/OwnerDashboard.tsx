import { useState, useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { toast } from 'sonner'
import { LEASH_FACTORY_ABI, LEASH_VAULT_ABI } from '../contracts/abi'
import { factoryAddress, USDC_ADDRESS } from '../contracts/addresses'
import { useVaultState, useAgentConfig } from '../hooks/useVault'
import { useVaultHistory, storeCreationBlock } from '../hooks/useVaultHistory'
import { useSelectedVault } from '../hooks/useSelectedVault'
import { useHeldPayments } from '../hooks/useHeldPayments'
import { setPayeeLabel, removePayeeLabel, getLabel } from '../lib/payeeLabels'
import { formatUsdc, parseUsdc, shortAddr, relativeTime, currentWindowSpend } from '../lib/format'
import { decodeLeashError } from '../lib/errors'
import { Chip } from './Chip'
import { Rail } from './Rail'
import { HoldButton } from './HoldButton'

// Small copy button for addresses.
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }).catch(() => {}) }}
      className="border border-steel bg-plate rounded-[3px] px-[5px] py-[1px] text-[10px] font-mono cursor-pointer hover:bg-steel2 ml-1 flex-none"
      title={text}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

interface OwnerDashboardProps {
  chainId: number
  explorerBase: string
  walletChainId: number | undefined
  onSwitchChain: () => void
  /** In watch mode, show this vault unconditionally (no wallet needed). */
  watchVault?: `0x${string}`
  /** When true, hide all write controls. */
  readOnly?: boolean
}

// Wrong-chain write banner.
function WrongChainBanner({ walletChainId, vaultChainId, onSwitch, isSwitching }: {
  walletChainId: number | undefined
  vaultChainId: number
  onSwitch: () => void
  isSwitching: boolean
}) {
  if (!walletChainId || walletChainId === vaultChainId) return null
  return (
    <div className="border border-[#B8400F] bg-tension-wash rounded p-3 flex flex-wrap items-center justify-between gap-3 mb-4">
      <p className="text-[14px] text-[#8a2f08]">
        Your wallet is on chain {walletChainId}. Vault writes require chain {vaultChainId}. Switch to continue.
      </p>
      <button
        onClick={onSwitch}
        disabled={isSwitching}
        className="font-body font-semibold text-[13px] px-3 py-[9px] border border-[#B8400F] rounded bg-plate text-[#8a2f08] hover:bg-tension-wash disabled:opacity-40"
      >
        {isSwitching ? 'Switching...' : 'Switch chain'}
      </button>
    </div>
  )
}

// Create Vault panel.
function CreateVaultPanel({ chainId, onCreated }: {
  chainId: number
  onCreated: (vault: `0x${string}`, blockNumber: bigint) => void
}) {
  const { address } = useAccount()
  const factory = factoryAddress(chainId) as `0x${string}`
  const [delay, setDelay] = useState('')
  const [useAutoRelease, setUseAutoRelease] = useState(false)

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  const delaySeconds = useAutoRelease ? Math.max(0, parseInt(delay || '0', 10)) : 0
  const warnDelay = useAutoRelease && delaySeconds > 0 && delaySeconds < 300

  useEffect(() => {
    if (!isSuccess || !receipt) return
    for (const log of receipt.logs) {
      if (log.topics.length >= 3) {
        const vaultTopic = log.topics[2]
        if (vaultTopic) {
          const vaultAddr = ('0x' + vaultTopic.slice(26)) as `0x${string}`
          if (isAddress(vaultAddr)) {
            storeCreationBlock(chainId, vaultAddr, receipt.blockNumber)
            onCreated(vaultAddr, receipt.blockNumber)
            return
          }
        }
      }
    }
    onCreated('0x0000000000000000000000000000000000000000', receipt.blockNumber)
  }, [isSuccess, receipt, chainId, onCreated])

  const create = useCallback(() => {
    if (!factory || !address) return
    writeContract({ address: factory, abi: LEASH_FACTORY_ABI, functionName: 'createVault', args: [delaySeconds], chainId })
  }, [factory, address, delaySeconds, writeContract, chainId])

  return (
    <div className="max-w-[520px] mx-auto grid gap-5">
      <div className="border border-stop bg-stop-wash rounded p-3 text-[14px] text-stop">
        <b>Unaudited software.</b> This contract has not been professionally audited. Start with an amount you can afford to lose and review the code before committing real funds.
      </div>
      <div className="bg-plate border border-steel rounded p-5 grid gap-4">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink2">Create your vault</h3>
        <p className="text-[14px] text-ink2">A vault is your personal USDC safe. You deposit into it, you set the rules, and only you can withdraw.</p>
        <div className="grid gap-2">
          <label className="flex items-center gap-2 cursor-pointer font-body text-[14px]">
            <input type="checkbox" checked={useAutoRelease} onChange={(e) => setUseAutoRelease(e.target.checked)} className="w-4 h-4" />
            Enable auto-release (timed payments)
          </label>
          <p className="text-[13px] text-ink3 ml-6">
            With auto-release on, a queued payment to ANY address is released after the delay unless you cancel or freeze first. Off means you must explicitly approve each payment.
          </p>
          {useAutoRelease && (
            <>
              <input type="number" min="0" placeholder="Delay in seconds (e.g. 3600 for 1 hour)" value={delay} onChange={(e) => setDelay(e.target.value)} className="border border-ink rounded px-3 py-[10px] font-body text-[14px] bg-plate" />
              {warnDelay && <p className="text-[13px] text-[#B8400F] bg-tension-wash rounded px-2 py-1">A delay under 5 minutes gives you very little time to cancel. Consider a longer delay or keeping auto-release off.</p>}
            </>
          )}
        </div>
        <button onClick={create} disabled={isPending || isConfirming} className="font-body font-semibold text-[14px] px-[18px] py-[13px] rounded border border-ink bg-rope text-white disabled:opacity-50 cursor-pointer transition-[transform,box-shadow] hover:-translate-x-px hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px] w-fit" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
          {isPending ? 'Confirm in wallet...' : isConfirming ? 'Creating vault...' : 'Create vault'}
        </button>
      </div>
    </div>
  )
}

// Agent row.
interface AgentRowProps {
  vaultAddress: `0x${string}`
  agentAddress: string
  chainId: number
  walletChainId: number | undefined
  frozen: boolean
  readOnly: boolean
  onSuccess: () => unknown
}

function AgentRow({ vaultAddress, agentAddress, chainId, walletChainId, frozen, readOnly, onSuccess }: AgentRowProps) {
  const addr = agentAddress as `0x${string}`
  const cfg = useAgentConfig(vaultAddress, addr, chainId)
  const [editing, setEditing] = useState(false)
  const [perCap, setPerCap] = useState('')
  const [dayCap, setDayCap] = useState('')
  const [confirmToggle, setConfirmToggle] = useState(false)
  const { writeContract, isPending } = useWriteContract()
  const writesBlocked = readOnly || walletChainId !== chainId
  const spentNow = currentWindowSpend(cfg.spentInWindow, cfg.windowStart)

  function save() {
    writeContract({ address: vaultAddress, abi: LEASH_VAULT_ABI, functionName: 'setAgent', args: [addr, cfg.active, parseUsdc(perCap), parseUsdc(dayCap)], chainId }, {
      onSuccess: () => { setEditing(false); onSuccess() },
      onError: (e) => toast.error(decodeLeashError(e)),
    })
  }

  function toggleActive() {
    const newActive = !cfg.active
    writeContract({ address: vaultAddress, abi: LEASH_VAULT_ABI, functionName: 'setAgent', args: [addr, newActive, cfg.perPaymentCap, cfg.dailyCap], chainId }, {
      onSuccess: () => { setConfirmToggle(false); onSuccess(); toast.success(newActive ? 'Agent reactivated.' : 'Agent deactivated.') },
      onError: (e) => toast.error(decodeLeashError(e)),
    })
  }

  return (
    <div className="grid gap-2 min-w-0">
      <div className="flex flex-wrap justify-between gap-2 items-baseline min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <b className="font-mono text-[13px] truncate" title={agentAddress}>{shortAddr(agentAddress)}</b>
          <CopyBtn text={agentAddress} />
          {!cfg.active && <Chip variant="stop">Inactive</Chip>}
        </div>
        <span className="font-mono text-[12px] text-ink3 flex-none">Left today {formatUsdc(cfg.leftToday)}</span>
        {!readOnly && (
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => { setEditing(!editing); setPerCap(formatUsdc(cfg.perPaymentCap)); setDayCap(formatUsdc(cfg.dailyCap)) }} disabled={writesBlocked} className="text-[12px] font-mono border border-steel rounded px-2 py-1 hover:bg-steel2 disabled:opacity-40">{editing ? 'Cancel' : 'Adjust'}</button>
            {!confirmToggle ? (
              <button onClick={() => setConfirmToggle(true)} disabled={writesBlocked} className={`text-[12px] font-mono border rounded px-2 py-1 disabled:opacity-40 ${cfg.active ? 'border-stop text-stop hover:bg-stop-wash' : 'border-slack text-slack hover:bg-slack-wash'}`}>{cfg.active ? 'Deactivate' : 'Reactivate'}</button>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-[12px] text-ink2">Sure?</span>
                <button onClick={toggleActive} disabled={isPending} className="text-[12px] font-mono border border-stop rounded px-2 py-1 text-stop hover:bg-stop-wash disabled:opacity-40">{isPending ? '...' : 'Yes'}</button>
                <button onClick={() => setConfirmToggle(false)} className="text-[12px] font-mono border border-steel rounded px-2 py-1 hover:bg-steel2">No</button>
              </div>
            )}
          </div>
        )}
      </div>
      <Rail spentRaw={spentNow} dailyCapRaw={cfg.dailyCap} perPaymentCapRaw={cfg.perPaymentCap} frozen={frozen || !cfg.active} />
      {editing && !readOnly && (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-1">
          <div>
            <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink3 block mb-1">Per payment</label>
            <input value={perCap} onChange={(e) => setPerCap(e.target.value)} className="border border-ink rounded px-2 py-[8px] font-body text-[14px] bg-plate w-full" placeholder="0.00" />
          </div>
          <div>
            <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink3 block mb-1">Daily cap</label>
            <input value={dayCap} onChange={(e) => setDayCap(e.target.value)} className="border border-ink rounded px-2 py-[8px] font-body text-[14px] bg-plate w-full" placeholder="0.00" />
          </div>
          <div className="flex items-end">
            <button onClick={save} disabled={isPending || writesBlocked} className="font-body font-semibold text-[13px] px-3 py-[9px] border border-ink rounded bg-rope text-white disabled:opacity-50">{isPending ? '...' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function OwnerDashboard({ chainId, explorerBase, walletChainId, onSwitchChain, watchVault, readOnly = false }: OwnerDashboardProps) {
  const { address } = useAccount()
  const factory = factoryAddress(chainId) as `0x${string}`
  const [isSwitching, setIsSwitching] = useState(false)

  function handleSwitchChain() {
    setIsSwitching(true)
    onSwitchChain()
    setTimeout(() => setIsSwitching(false), 3000)
  }

  // Read all vaults for this owner.
  const { data: vaultsData, refetch: refetchVaults } = useReadContract({
    address: factory,
    abi: LEASH_FACTORY_ABI,
    functionName: 'vaultsOf',
    args: [address!],
    chainId,
    query: { enabled: !!address && !!factory && !readOnly },
  })
  const vaults = (vaultsData as `0x${string}`[] | undefined) ?? []

  // Vault selection: shared hook so AgentConsole always reads the same choice.
  const { selectedVault: hookedVault, selectVault } = useSelectedVault(vaults, chainId, address)

  // In watch mode, use the URL vault directly.
  const vault: `0x${string}` | undefined = readOnly ? watchVault : hookedVault

  // Label handling.
  const [labelVersion, setLabelVersion] = useState(0)
  function refreshLabels() { setLabelVersion((v) => v + 1) }
  function labelFor(addr: string): string {
    void labelVersion
    return vault ? getLabel(chainId, vault, addr) : ''
  }

  const vaultState = useVaultState(vault, chainId)
  const heldPayments = useHeldPayments({
    vaultAddress: vault,
    chainId,
    nextPaymentId: vaultState.nextPaymentId,
    enabled: !!vault,
  })
  const history = useVaultHistory({
    vaultAddress: vault,
    factoryAddress: factory,
    chainId,
    enabled: !!vault,
  })

  const { writeContract, isPending: isWriting } = useWriteContract()
  const writesBlocked = readOnly || (!!walletChainId && walletChainId !== chainId)

  const [newAgentAddr, setNewAgentAddr] = useState('')
  const [newAgentPerCap, setNewAgentPerCap] = useState('')
  const [newAgentDayCap, setNewAgentDayCap] = useState('')
  const [newPayeeAddr, setNewPayeeAddr] = useState('')
  const [newPayeeLabel, setNewPayeeLabelState] = useState('')
  const [withdrawTo, setWithdrawTo] = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [copied, setCopied] = useState(false)

  function copyAddr() {
    if (!vault) return
    navigator.clipboard.writeText(vault).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }).catch(() => {})
  }

  function toggleFreeze() {
    if (!vault || writesBlocked) return
    writeContract({ address: vault, abi: LEASH_VAULT_ABI, functionName: vaultState.frozen ? 'unfreeze' : 'freeze', args: [], chainId }, {
      onSuccess: () => { void vaultState.refetch(); toast.success(vaultState.frozen ? 'Vault unfrozen.' : 'Vault frozen.') },
      onError: (e) => toast.error(decodeLeashError(e)),
    })
  }

  function addAgent(e: React.FormEvent) {
    e.preventDefault()
    if (!vault || !isAddress(newAgentAddr)) return toast.error('Enter a valid address.')
    writeContract({ address: vault, abi: LEASH_VAULT_ABI, functionName: 'setAgent', args: [newAgentAddr, true, parseUsdc(newAgentPerCap), parseUsdc(newAgentDayCap)], chainId }, {
      onSuccess: () => { void vaultState.refetch(); toast.success('Agent added.'); setNewAgentAddr(''); setNewAgentPerCap(''); setNewAgentDayCap('') },
      onError: (e) => toast.error(decodeLeashError(e)),
    })
  }

  function addPayee(e: React.FormEvent) {
    e.preventDefault()
    if (!vault || !isAddress(newPayeeAddr)) return toast.error('Enter a valid address.')
    if (newPayeeLabel.trim() && vault) setPayeeLabel(chainId, vault, newPayeeAddr, newPayeeLabel)
    writeContract({ address: vault, abi: LEASH_VAULT_ABI, functionName: 'setPayee', args: [newPayeeAddr, true], chainId }, {
      onSuccess: () => { void vaultState.refetch(); refreshLabels(); toast.success(`Payee ${newPayeeLabel || shortAddr(newPayeeAddr)} added.`); setNewPayeeAddr(''); setNewPayeeLabelState('') },
      onError: (e) => toast.error(decodeLeashError(e)),
    })
  }

  function removePayee(addr: string) {
    if (!vault) return
    writeContract({ address: vault, abi: LEASH_VAULT_ABI, functionName: 'setPayee', args: [addr as `0x${string}`, false], chainId }, {
      onSuccess: () => { removePayeeLabel(chainId, vault, addr); void vaultState.refetch(); refreshLabels(); toast.success('Payee removed.') },
      onError: (e) => toast.error(decodeLeashError(e)),
    })
  }

  function doWithdraw(e: React.FormEvent) {
    e.preventDefault()
    if (!vault || !isAddress(withdrawTo)) return toast.error('Enter a valid address.')
    const raw = parseUsdc(withdrawAmt)
    if (raw === 0n) return toast.error('Enter an amount greater than zero.')
    if (raw > vaultState.available) return toast.error(`Only ${formatUsdc(vaultState.available)} USDC available.`)
    writeContract({ address: vault, abi: LEASH_VAULT_ABI, functionName: 'withdraw', args: [withdrawTo, raw], chainId }, {
      onSuccess: () => { void vaultState.refetch(); toast.success('Withdrawn.'); setWithdrawAmt('') },
      onError: (e) => toast.error(decodeLeashError(e)),
    })
  }

  function approvePayment(id: bigint) {
    if (!vault) return
    writeContract({ address: vault, abi: LEASH_VAULT_ABI, functionName: 'approve', args: [id], chainId }, {
      onSuccess: () => { void vaultState.refetch(); toast.success('Payment approved.') },
      onError: (e) => toast.error(decodeLeashError(e)),
    })
  }

  function cancelPayment(id: bigint) {
    if (!vault) return
    writeContract({ address: vault, abi: LEASH_VAULT_ABI, functionName: 'cancel', args: [id], chainId }, {
      onSuccess: () => { void vaultState.refetch(); toast.success('Payment cancelled. Funds returned to the vault.') },
      onError: (e) => toast.error(decodeLeashError(e)),
    })
  }

  function doDeposit(e: React.FormEvent) {
    e.preventDefault()
    const input = (e.currentTarget as HTMLFormElement).querySelector('input') as HTMLInputElement
    const raw = parseUsdc(input.value)
    if (!vault || raw === 0n) return
    writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [vault, raw], chainId }, {
      onSuccess: () => { void vaultState.refetch(); toast.success('Deposit sent.'); input.value = '' },
      onError: (e) => toast.error(decodeLeashError(e)),
    })
  }

  // ---- Render guards ----

  if (!readOnly && !address) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-ink2 text-[15px]">Connect your wallet to manage your vault.</p>
      </div>
    )
  }

  if (!factory) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="border border-steel2 rounded p-5 text-center max-w-sm">
          <p className="font-mono text-[13px] text-ink3 uppercase tracking-[0.1em]">Not deployed on this network</p>
          <p className="text-[14px] text-ink2 mt-2">Leash is deployed on Arc Testnet and not yet on this chain.</p>
        </div>
      </div>
    )
  }

  if (!readOnly && !vault) {
    return (
      <CreateVaultPanel
        chainId={chainId}
        onCreated={(vaultAddr, blockNumber) => {
          storeCreationBlock(chainId, vaultAddr, blockNumber)
          void refetchVaults()
        }}
      />
    )
  }

  if (!vault) {
    return <div className="py-16 text-center text-ink3 text-[15px]">Loading vault...</div>
  }

  const pendingPayments = heldPayments.held
  const agentList = Array.from(history.agentAddresses)
  const allowedPayeeList = Array.from(history.allowedPayeeAddresses)

  const chipVariantMap: Record<string, 'ok' | 'hold' | 'plain' | 'rope' | 'stop'> = {
    PAID: 'ok', HELD: 'hold', APPROVED: 'ok', CANCELLED: 'plain',
    ALLOWED: 'rope', FROZEN: 'stop', UNFROZEN: 'plain', WITHDRAWN: 'plain',
  }

  return (
    <div className={`min-w-0 ${vaultState.frozen ? 'is-frozen' : ''}`}>
      {!readOnly && (
        <WrongChainBanner walletChainId={walletChainId} vaultChainId={chainId} onSwitch={handleSwitchChain} isSwitching={isSwitching} />
      )}

      {/* Header */}
      <div className="flex flex-wrap gap-3 justify-between items-center mb-4 min-w-0">
        <div className="min-w-0">
          <h3 className="font-display font-extrabold text-[24px] leading-tight" style={{ fontStretch: '112%' }}>
            {readOnly ? 'Vault (read only)' : 'My Vault'}
          </h3>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-ink2 mt-1 min-w-0">
            <span className="truncate max-w-[160px] sm:max-w-none" title={vault}>{shortAddr(vault)}</span>
            <button onClick={copyAddr} className="border border-steel bg-plate rounded-[3px] px-[7px] py-[3px] text-[11px] font-mono cursor-pointer hover:bg-steel2 flex-none">
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a href={`${explorerBase}/address/${vault}`} target="_blank" rel="noopener noreferrer" className="text-rope underline text-[11px] flex-none">Explorer</a>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Chip variant={chainId === 5042 ? 'rope' : 'plain'}>{chainId === 5042 ? 'Arc mainnet' : 'Arc testnet'}</Chip>
          {!readOnly && (
            <label className="flex items-center gap-[10px] font-body font-semibold text-[13px] cursor-pointer select-none">
              <input type="checkbox" checked={vaultState.frozen} onChange={toggleFreeze} className="sr-only" disabled={isWriting || writesBlocked} role="switch" aria-label="Freeze agents" />
              <span className="w-[52px] h-[28px] rounded border border-ink relative flex-none transition-colors" style={{ background: vaultState.frozen ? 'var(--stop)' : 'var(--plate)' }}>
                <span className="absolute top-[2px] left-[2px] w-[21px] h-[21px] rounded-[2px] transition-transform" style={{ background: vaultState.frozen ? '#fff' : 'var(--ink)', transform: vaultState.frozen ? 'translateX(24px)' : 'none' }} />
              </span>
              Freeze agents
            </label>
          )}
        </div>
      </div>

      {/* Vault switcher */}
      {!readOnly && vaults.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">Vault:</span>
          {vaults.map((v, i) => (
            <button
              key={v}
              onClick={() => selectVault(v)}
              className={`font-mono text-[12px] px-[10px] py-[5px] rounded border transition-colors ${v.toLowerCase() === vault.toLowerCase() ? 'border-ink bg-ink text-white' : 'border-steel bg-plate hover:bg-steel2'}`}
              title={v}
            >
              #{i + 1} {shortAddr(v)}
            </button>
          ))}
        </div>
      )}

      {vaultState.frozen && (
        <div className="border border-stop bg-stop-wash text-[#7d1a13] rounded p-3 text-[14px] mb-4">
          Agents are frozen. They cannot pay or release held payments. You can still approve, cancel and withdraw.
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Available', value: formatUsdc(vaultState.available) },
          { label: 'Held for you', value: formatUsdc(vaultState.reserved) },
          { label: 'Vault balance', value: formatUsdc(vaultState.usdcBalance) },
          { label: 'Paid, last 24h', value: formatUsdc(history.paidLast24h) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-plate border border-ink rounded px-[14px] py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink3 block">{label}</span>
            <b className="font-mono text-[clamp(18px,3vw,26px)] leading-[1.1] tabular-nums block mt-1">
              {value}<small className="text-[12px] text-ink3 ml-1">USDC</small>
            </b>
          </div>
        ))}
      </div>

      {/* History error banner */}
      {history.historyError && (
        <div className="border border-[#B8400F] bg-tension-wash rounded p-3 flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-[14px] text-[#8a2f08]">Could not load history. Agents, payees and activity may be incomplete.</p>
          <button onClick={history.retry} className="font-body font-semibold text-[13px] px-3 py-[9px] border border-[#B8400F] rounded bg-plate text-[#8a2f08] hover:bg-tension-wash">Retry</button>
        </div>
      )}

      {/* Held payments error */}
      {heldPayments.error && (
        <div className="border border-[#B8400F] bg-tension-wash rounded p-3 flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-[14px] text-[#8a2f08]">Could not load held payments: {heldPayments.error}</p>
          <button onClick={() => void heldPayments.retry()} className="font-body font-semibold text-[13px] px-3 py-[9px] border border-[#B8400F] rounded bg-plate text-[#8a2f08] hover:bg-tension-wash">Retry</button>
        </div>
      )}

      {/* Main columns */}
      <div className="grid md:grid-cols-[1.25fr_1fr] gap-4 min-w-0">
        {/* Left column */}
        <div className="grid gap-4 min-w-0">
          {/* Agents */}
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink2 flex justify-between items-center gap-2 mb-3">
              <span>Agents</span>
              <span className="text-ink3">{agentList.length}</span>
            </div>
            <div className="bg-plate border border-steel rounded p-[14px] grid gap-3 min-w-0">
              {agentList.length === 0 && (
                <p className="border border-dashed border-steel rounded p-4 text-ink3 text-[14px] text-center">No agents yet.{!readOnly ? ' Add one below.' : ''}</p>
              )}
              {agentList.map((a) => (
                <AgentRow key={a} vaultAddress={vault} agentAddress={a} chainId={chainId} walletChainId={walletChainId} frozen={vaultState.frozen} readOnly={readOnly} onSuccess={vaultState.refetch} />
              ))}
              {!readOnly && (
                <form onSubmit={addAgent} className="grid gap-2 mt-2">
                  <input value={newAgentAddr} onChange={(e) => setNewAgentAddr(e.target.value)} placeholder="Agent address (0x...)" className="border border-ink rounded px-2 py-[8px] font-body text-[13px] bg-plate w-full" />
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input value={newAgentPerCap} onChange={(e) => setNewAgentPerCap(e.target.value)} placeholder="Per payment cap" className="border border-ink rounded px-2 py-[8px] font-body text-[13px] bg-plate" />
                    <input value={newAgentDayCap} onChange={(e) => setNewAgentDayCap(e.target.value)} placeholder="Daily cap" className="border border-ink rounded px-2 py-[8px] font-body text-[13px] bg-plate" />
                    <button type="submit" disabled={writesBlocked} className="font-body font-semibold text-[13px] px-3 py-[8px] border border-ink rounded bg-plate hover:bg-steel2 disabled:opacity-40">Add</button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Held payments */}
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink2 flex justify-between items-center gap-2 mb-3">
              <span>Held for you</span>
              {pendingPayments.length > 0 && <Chip variant="hold">{pendingPayments.length}</Chip>}
            </div>
            <div className="grid gap-[10px] min-w-0" aria-live="polite">
              {pendingPayments.length === 0 && !heldPayments.error && (
                <div className="border border-dashed border-steel rounded p-4 text-ink3 text-[14px] text-center">
                  Nothing is waiting. Payments outside the allowlist will show up here.
                </div>
              )}
              {pendingPayments.map((p) => {
                const payeeLabel = labelFor(p.payee)
                return (
                  <div key={String(p.id)} className="border border-tension bg-plate rounded p-3 grid gap-[10px] min-w-0">
                    <div className="flex flex-wrap justify-between gap-2 items-baseline">
                      <b className="font-mono text-[22px] leading-tight tabular-nums">
                        {formatUsdc(p.amount)}<small className="text-[12px] text-ink3 ml-1">USDC</small>
                      </b>
                      <Chip variant="hold">Needs your yes</Chip>
                    </div>
                    <p className="font-mono text-[12px] leading-[1.8] text-ink2 min-w-0">
                      To{' '}
                      <span title={p.payee} className="inline-flex items-center gap-1 flex-wrap">
                        <span>{payeeLabel ? <><b>{payeeLabel}</b> <span className="text-ink3">{shortAddr(p.payee)}</span></> : shortAddr(p.payee)}</span>
                        <CopyBtn text={p.payee} />
                      </span>
                      <br />
                      From{' '}
                      <span title={p.agent} className="inline-flex items-center gap-1">
                        <span>{shortAddr(p.agent)}</span>
                        <CopyBtn text={p.agent} />
                      </span>
                      {' '}· ref {p.ref || '(none)'}
                      {p.queuedAt > 0 && <><br /><span className="text-ink3">Queued {relativeTime(p.queuedAt)}</span></>}
                    </p>
                    {!readOnly && (
                      <div className="flex flex-wrap gap-2">
                        <HoldButton onHeld={() => approvePayment(p.id)} disabled={isWriting || writesBlocked}>Hold to approve</HoldButton>
                        <button onClick={() => cancelPayment(p.id)} disabled={isWriting || writesBlocked} className="font-body font-semibold text-[13px] px-3 py-[9px] border border-ink rounded bg-plate hover:bg-steel2 disabled:opacity-40 transition-colors">Cancel payment</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="grid gap-4 min-w-0">
          {/* Allowed payees */}
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink2 mb-3">Allowed payees</div>
            <div className="bg-plate border border-steel rounded p-[14px] grid gap-[10px] min-w-0">
              {allowedPayeeList.length === 0 && <p className="text-[14px] text-ink3">No payees yet.</p>}
              {allowedPayeeList.length > 0 && (
                <ul className="grid divide-y divide-steel2 min-w-0">
                  {allowedPayeeList.map((p) => {
                    const label = labelFor(p)
                    return (
                      <li key={p} className="flex justify-between gap-2 py-2 text-[13px] min-w-0">
                        <span className="flex items-center gap-1 min-w-0 font-mono text-[12px]">
                          <span title={p} className="truncate max-w-[120px] sm:max-w-[180px]">
                            {label ? <><b>{label}</b> <span className="text-ink3">{shortAddr(p)}</span></> : shortAddr(p)}
                          </span>
                          <CopyBtn text={p} />
                        </span>
                        {!readOnly && (
                          <button onClick={() => removePayee(p)} disabled={writesBlocked} className="font-mono text-[11px] text-stop hover:underline disabled:opacity-40 flex-none">Remove</button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              {!readOnly && (
                <form onSubmit={addPayee} className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-2">
                  <input value={newPayeeLabel} onChange={(e) => setNewPayeeLabelState(e.target.value)} placeholder="Label (optional)" className="border border-ink rounded px-2 py-[8px] font-body text-[13px] bg-plate" />
                  <input value={newPayeeAddr} onChange={(e) => setNewPayeeAddr(e.target.value)} placeholder="0x address" className="border border-ink rounded px-2 py-[8px] font-body text-[13px] bg-plate" />
                  <button type="submit" disabled={writesBlocked} className="font-body font-semibold text-[13px] px-3 py-[8px] border border-ink rounded bg-plate hover:bg-steel2 disabled:opacity-40">Allow</button>
                </form>
              )}
            </div>
          </div>

          {/* Activity */}
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink2 mb-3">Activity</div>
            <div className="bg-plate border border-steel rounded p-[14px] min-w-0">
              {history.activity.length === 0 && <p className="text-[14px] text-ink3">No recent activity.</p>}
              <ul className="grid min-w-0">
                {history.activity.map((e, i) => (
                  <li key={i} className="grid grid-cols-[auto_1fr] gap-2 items-start py-[9px] border-b border-steel2 last:border-b-0 min-w-0">
                    <Chip variant={chipVariantMap[e.kind] ?? 'plain'}>{e.kind}</Chip>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-1 min-w-0">
                        <span title={e.meta} className="text-[13px] break-words min-w-0">
                          {e.text.includes(e.meta) && e.meta.startsWith('0x')
                            ? e.text.replace(e.meta, shortAddr(e.meta))
                            : e.text}
                        </span>
                        {e.meta.startsWith('0x') && <CopyBtn text={e.meta} />}
                      </div>
                      <span className="font-mono text-[11px] text-ink3 block">
                        {e.timestamp > 0 ? relativeTime(e.timestamp) : `block ${String(e.blockNumber)}`}
                        {e.txHash && (
                          <a href={`${explorerBase}/tx/${e.txHash}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-rope underline">tx</a>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Deposit */}
          {!readOnly && (
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink2 mb-3">Deposit USDC</div>
              <div className="bg-plate border border-steel rounded p-[14px]">
                <p className="text-[13px] text-ink2 mb-3">Send USDC to the vault by transferring directly to its address, or use the form below.</p>
                <form onSubmit={doDeposit} className="flex gap-2">
                  <input type="number" min="0" step="0.01" placeholder="Amount" className="border border-ink rounded px-2 py-[8px] font-body text-[14px] bg-plate flex-1 min-w-0" />
                  <button type="submit" disabled={writesBlocked} className="font-body font-semibold text-[13px] px-3 py-[9px] border border-ink rounded bg-plate hover:bg-steel2 disabled:opacity-40 flex-none">Deposit</button>
                </form>
              </div>
            </div>
          )}

          {/* Withdraw */}
          {!readOnly && (
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink2 mb-3">Withdraw</div>
              <div className="bg-plate border border-steel rounded p-[14px]">
                <p className="text-[13px] text-ink2 mb-3">Available: <b className="font-mono">{formatUsdc(vaultState.available)} USDC</b></p>
                <form onSubmit={doWithdraw} className="grid gap-2">
                  <input value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)} placeholder="To address (0x...)" className="border border-ink rounded px-2 py-[8px] font-body text-[13px] bg-plate w-full" />
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} placeholder="Amount" type="number" min="0" step="0.01" className="border border-ink rounded px-2 py-[8px] font-body text-[13px] bg-plate" />
                    <button type="submit" disabled={writesBlocked} className="font-body font-semibold text-[13px] px-3 py-[8px] border border-ink rounded bg-plate hover:bg-steel2 disabled:opacity-40">Withdraw</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
