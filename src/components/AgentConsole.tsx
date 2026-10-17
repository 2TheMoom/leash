import { useState, useCallback } from 'react'
import { useAccount, usePublicClient, useReadContract } from 'wagmi'
import { createWalletClient, http, isAddress } from 'viem'
import { rpcUrls, arcChain } from '../lib/rpcClient'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { toast } from 'sonner'
import { LEASH_VAULT_ABI, LEASH_FACTORY_ABI } from '../contracts/abi'
import { factoryAddress } from '../contracts/addresses'
import { useVaultState, useAgentConfig } from '../hooks/useVault'
import { useSelectedVault } from '../hooks/useSelectedVault'
import { formatUsdc, parseUsdc, shortAddr, stringToBytes32, leftToday, currentWindowSpend } from '../lib/format'
import { decodeLeashError } from '../lib/errors'
import { Rail } from './Rail'

const BURNER_KEY = 'leash-demo-burner-pk'

type ResultKind = 'idle' | 'ok' | 'hold' | 'stop'

interface ResultState {
  kind: ResultKind
  heading: string
  body: string
  cancelId?: bigint
}

interface AgentConsoleProps {
  chainId: number
  explorerBase: string
}

export function AgentConsole({ chainId, explorerBase: _explorerBase }: AgentConsoleProps) {
  const { address: ownerAddress } = useAccount()
  const factory = factoryAddress(chainId) as `0x${string}` | undefined

  // Burner key stored in localStorage
  const [burnerPk, setBurnerPk] = useState<`0x${string}` | null>(() => {
    try { return (localStorage.getItem(BURNER_KEY) as `0x${string}`) || null } catch { return null }
  })
  const burnerAccount = burnerPk ? privateKeyToAccount(burnerPk) : null
  const burnerAddress = burnerAccount?.address

  // Vault the burner agent is configured on
  const [vaultAddr, setVaultAddr] = useState('')
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const [result, setResult] = useState<ResultState>({ kind: 'idle', heading: 'No payment sent yet.', body: 'Pick a payee and an amount. The vault checks your limits before sending.' })
  const [isSending, setIsSending] = useState(false)

  // Read all vaults for this owner -- same query the dashboard uses.
  const { data: ownerVaultsData } = useReadContract({
    address: factory!,
    abi: LEASH_FACTORY_ABI,
    functionName: 'vaultsOf',
    args: [ownerAddress!],
    chainId,
    query: { enabled: !!factory && !!ownerAddress },
  })
  const ownerVaults = (ownerVaultsData as `0x${string}`[] | undefined) ?? []

  // Use the shared selection hook so this screen agrees with OwnerDashboard.
  const { selectedVault: dashboardVault, selectVault: switchVault } = useSelectedVault(ownerVaults, chainId, ownerAddress)

  // Manual paste overrides the shared selection.
  const effectiveVault: `0x${string}` | undefined = isAddress(vaultAddr)
    ? (vaultAddr)
    : dashboardVault

  const vaultState = useVaultState(effectiveVault, chainId)
  const agentCfg = useAgentConfig(effectiveVault, burnerAddress, chainId)

  const publicClient = usePublicClient({ chainId })

  function generateBurner() {
    const pk = generatePrivateKey()
    try { localStorage.setItem(BURNER_KEY, pk) } catch {}
    setBurnerPk(pk)
    toast.success('Demo burner wallet generated. Keep it in this browser only.')
  }

  function clearBurner() {
    try { localStorage.removeItem(BURNER_KEY) } catch {}
    setBurnerPk(null)
  }

  // Simulate + send
  const sendPayment = useCallback(async () => {
    if (!effectiveVault || !burnerAccount || !publicClient) return
    const rawAmount = parseUsdc(amount)
    if (rawAmount === 0n) { setResult({ kind: 'stop', heading: 'Check the amount', body: 'Enter an amount above zero.' }); return }
    if (!isAddress(payee)) { setResult({ kind: 'stop', heading: 'Check the payee', body: 'Enter a valid 0x address.' }); return }

    setIsSending(true)
    setResult({ kind: 'idle', heading: 'Simulating...', body: 'Checking your limits before sending.' })

    try {
      // Simulate first
      const simResult = await publicClient.simulateContract({
        address: effectiveVault,
        abi: LEASH_VAULT_ABI,
        functionName: 'pay',
        args: [payee, rawAmount, stringToBytes32(ref)],
        account: burnerAccount.address,
      })

      const [executed] = simResult.result as [boolean, bigint]

      if (executed) {
        setResult({ kind: 'ok', heading: 'Will be paid instantly', body: `${formatUsdc(rawAmount)} USDC to ${shortAddr(payee)} will go straight through. The payee is on the allowlist and you are within your daily limit.` })
      } else {
        setResult({ kind: 'hold', heading: 'Will be held for the owner', body: `${shortAddr(payee)} is not on the allowlist. ${formatUsdc(rawAmount)} USDC will be reserved in the vault until the owner approves or cancels. You can cancel it yourself too.` })
      }

      // Confirm and send. Use the first Arc RPC URL for the walletClient.
      const minimalChain = arcChain(chainId)
      const walletClient = createWalletClient({
        account: burnerAccount,
        transport: http(rpcUrls(chainId)[0]),
        chain: minimalChain,
      })

      const hash = await walletClient.writeContract({
        address: effectiveVault,
        abi: LEASH_VAULT_ABI,
        functionName: 'pay',
        args: [payee, rawAmount, stringToBytes32(ref)],
        chain: minimalChain,
      })

      await publicClient.waitForTransactionReceipt({ hash })
      void vaultState.refetch()
      void agentCfg.refetch()

      if (executed) {
        setResult({
          kind: 'ok',
          heading: 'Paid',
          body: `${formatUsdc(rawAmount)} USDC went to ${shortAddr(payee)}. It is on the allowlist and inside your limits.`,
        })
        toast.success('Payment sent.')
      } else {
        // Use nextPaymentId snapshot to identify the queued payment id
        const queuedId = vaultState.nextPaymentId > 0n ? vaultState.nextPaymentId - 1n : 0n
        setResult({
          kind: 'hold',
          heading: 'Held for the owner',
          body: `${shortAddr(payee)} is not on the allowlist, so ${formatUsdc(rawAmount)} USDC is reserved in the vault. The owner can approve or cancel. You can also cancel it yourself.`,
          cancelId: queuedId,
        })
        toast('Payment queued.', { description: 'Waiting for owner approval.' })
      }
    } catch (err) {
      const msg = decodeLeashError(err)
      if (msg === 'Transaction cancelled.') {
        setResult({ kind: 'idle', heading: 'Cancelled', body: 'Transaction was not sent.' })
      } else {
        setResult({ kind: 'stop', heading: 'Rejected', body: msg })
      }
    } finally {
      setIsSending(false)
    }
  }, [effectiveVault, burnerAccount, publicClient, payee, amount, ref, chainId, vaultState, agentCfg])

  function cancelOwnPayment(id: bigint) {
    if (!effectiveVault || !burnerAccount) return
    const minimalChain = arcChain(chainId)
    const walletClient = createWalletClient({
      account: burnerAccount,
      transport: http(rpcUrls(chainId)[0]),
      chain: minimalChain,
    })
    walletClient.writeContract({
      address: effectiveVault,
      abi: LEASH_VAULT_ABI,
      functionName: 'cancel',
      args: [id],
      chain: minimalChain,
    }).then(() => {
      void vaultState.refetch()
      setResult({ kind: 'idle', heading: 'Cancelled', body: 'Payment cancelled. Funds returned to the vault.' })
      toast.success('Payment cancelled.')
    }).catch((e) => toast.error(decodeLeashError(e)))
  }

  const resultClasses: Record<ResultKind, string> = {
    idle: 'border-steel bg-plate',
    ok: 'border-slack bg-slack-wash',
    hold: 'border-tension bg-tension-wash',
    stop: 'border-stop bg-stop-wash',
  }

  const spentNow = currentWindowSpend(agentCfg.spentInWindow, agentCfg.windowStart)
  const leftNow = leftToday(agentCfg.dailyCap, agentCfg.spentInWindow, agentCfg.windowStart)

  return (
    <div className="grid md:grid-cols-[0.9fr_1.1fr] min-h-[540px]">
      {/* Left: agent info */}
      <div className="bg-ink text-white p-[clamp(16px,3vw,28px)] grid gap-[18px] content-start">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#8e97b0]">Agent</p>
          <h3
            className="font-display font-extrabold text-[26px] leading-tight mt-1"
            style={{ fontStretch: '112%', fontFamily: "'Archivo', system-ui, sans-serif" }}
          >
            {burnerAddress ? 'Demo agent' : 'No agent'}
          </h3>
          {burnerAddress && (
            <div className="flex items-center gap-2 font-mono text-[12px] text-[#C9D0E2] mt-1">
              <span>{shortAddr(burnerAddress)}</span>
              <button
                onClick={() => { void navigator.clipboard.writeText(burnerAddress).catch(() => {}) }}
                className="border border-[#2a3350] rounded-[3px] px-[6px] py-[2px] text-[10px] hover:bg-[#1b2238]"
              >
                Copy
              </button>
            </div>
          )}
        </div>

        {burnerAddress && effectiveVault && (
          <>
            <Rail
              spentRaw={spentNow}
              dailyCapRaw={agentCfg.dailyCap}
              perPaymentCapRaw={agentCfg.perPaymentCap}
              frozen={vaultState.frozen}
            />
            <div className="grid grid-cols-2 gap-[10px]">
              {[
                { label: 'Left today', value: formatUsdc(leftNow) },
                { label: 'Per payment', value: formatUsdc(agentCfg.perPaymentCap) },
              ].map(({ label, value }) => (
                <div key={label} className="border border-[#2a3350] rounded px-[11px] py-[9px]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#8e97b0] block">{label}</span>
                  <b className="font-mono text-[18px] tabular-nums block">{value}</b>
                </div>
              ))}
            </div>
            {!agentCfg.active && (() => {
              // Check if the burner is active on a different owner vault.
              const otherVault = ownerVaults.find(
                (v) => v.toLowerCase() !== effectiveVault?.toLowerCase(),
              )
              return (
                <div className="border border-[#4a2020] bg-[#2a1010] text-[#ff9a72] rounded p-2 text-[13px] grid gap-2">
                  <span>This agent is not active on the selected vault. Ask the vault owner to add it.</span>
                  {otherVault && (
                    <button
                      onClick={() => { setVaultAddr(''); switchVault(otherVault) }}
                      className="text-left underline text-[12px] text-[#ff9a72] hover:text-white w-fit"
                    >
                      Switch to {shortAddr(otherVault)} where it may be active
                    </button>
                  )}
                </div>
              )
            })()}
          </>
        )}

        {!burnerAddress ? (
          <div className="grid gap-3">
            <p className="text-[14px] text-[#8e97b0]">
              Generate a demo burner wallet to try the agent console. The private key is stored only in your browser's localStorage. Never use it for real funds.
            </p>
            <button
              onClick={generateBurner}
              className="font-body font-semibold text-[13px] px-3 py-[9px] border border-[#3a4360] rounded bg-[#1b2238] text-white hover:bg-[#252f4a] w-fit"
            >
              Generate demo agent
            </button>
          </div>
        ) : (
          <button
            onClick={clearBurner}
            className="font-mono text-[11px] text-[#8e97b0] hover:text-white underline w-fit"
          >
            Clear demo key
          </button>
        )}

        {burnerAddress && (
          <div className="grid gap-1">
            <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8e97b0]">Vault address</label>
            <input
              value={vaultAddr}
              onChange={(e) => setVaultAddr(e.target.value)}
              placeholder={dashboardVault ?? '0x...'}
              className="border border-[#3a4360] rounded px-2 py-[8px] font-mono text-[12px] bg-[#0a0f1e] text-white placeholder:text-[#4a5570]"
            />
            {!effectiveVault && (
              <p className="text-[12px] text-[#8e97b0]">Paste the vault address to connect, or connect your owner wallet first to auto-detect.</p>
            )}
          </div>
        )}
      </div>

      {/* Right: send form */}
      <div className="bg-paper p-[clamp(16px,3vw,28px)] grid gap-4 content-start min-w-0">
        <form onSubmit={(e) => { e.preventDefault(); void sendPayment() }} className="grid gap-[14px]">
          <div className="grid gap-[6px]">
            <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink2">Pay to</label>
            <input
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="0x address"
              className="border border-ink rounded px-[11px] py-[10px] font-body text-[14px] bg-plate"
              aria-label="Payee address"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-[6px]">
              <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink2">Amount, USDC</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                className="border border-ink rounded px-[11px] py-[10px] font-body text-[14px] bg-plate"
              />
            </div>
            <div className="grid gap-[6px]">
              <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink2">Reference</label>
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                type="text"
                placeholder="inv-001"
                className="border border-ink rounded px-[11px] py-[10px] font-body text-[14px] bg-plate"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="submit"
              disabled={isSending || !burnerAddress || !effectiveVault}
              className="font-body font-semibold text-[14px] px-[18px] py-[13px] rounded border border-ink bg-rope text-white disabled:opacity-40 cursor-pointer transition-[transform,box-shadow] hover:-translate-x-px hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px]"
              style={{ boxShadow: '4px 4px 0 var(--ink)' }}
            >
              {isSending ? 'Sending...' : 'Send payment'}
            </button>
            {!burnerAddress && <span className="text-[13px] text-ink3">Generate a demo agent first</span>}
            {burnerAddress && !effectiveVault && <span className="text-[13px] text-ink3">Connect a vault above</span>}
          </div>
        </form>

        {/* Result */}
        <div
          className={`border rounded p-[14px] grid gap-2 min-h-[92px] ${resultClasses[result.kind]}`}
          aria-live="polite"
        >
          <b
            className="font-display text-[17px]"
            style={{ fontStretch: '112%', fontFamily: "'Archivo', system-ui, sans-serif", fontWeight: 700 }}
          >
            {result.heading}
          </b>
          <p className="text-[14px]">{result.body}</p>
          {result.kind === 'hold' && result.cancelId !== undefined && (
            <button
              onClick={() => cancelOwnPayment(result.cancelId!)}
              className="font-body font-semibold text-[13px] px-3 py-[9px] border border-ink rounded bg-plate hover:bg-steel2 w-fit mt-1"
            >
              Cancel this payment
            </button>
          )}
        </div>

        {vaultState.frozen && (
          <div className="border border-stop bg-stop-wash rounded p-3 text-[14px] text-stop">
            The vault is currently frozen. The owner has paused agent payments.
          </div>
        )}
      </div>
    </div>
  )
}
