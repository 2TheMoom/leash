/**
 * Dashboard ledger, rebuilt from contract state (see lib/ledger.ts for why logs are not used).
 *
 *   1. read nextPaymentId
 *   2. multicall getPayment for the newest MAX_PAYMENTS ids (chunks of CHUNK)
 *   3. build the activity, 24h total and candidate agents and payees
 *   4. multicall getAgent and allowedPayees for the candidates plus the addresses the owner
 *      added from this browser, and keep only what the contract confirms
 *
 * Everything goes through the shared RPC limiter with backoff, and polling pauses while
 * the tab is hidden. Errors are logged with their real cause and shown with a Retry.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { makeArcClient, withRetry } from '../lib/rpcClient'
import { LEASH_VAULT_ABI } from '../contracts/abi'
import { bytes32ToString } from '../lib/format'
import { buildLedger, type ActivityEntry, type LedgerPayment } from '../lib/ledger'
import { getKnown } from '../lib/knownAddresses'

export type { ActivityEntry }

interface UseVaultHistoryOptions {
  vaultAddress: `0x${string}` | undefined
  chainId: number
  enabled: boolean
}

/** Newest payments to read. 3 multicalls cover 300 payments. */
const MAX_PAYMENTS = 300
const CHUNK = 100
const POLL_MS = 15_000

type RawPayment = { agent: string; payee: string; amount: bigint; queuedAt: number | bigint; ref: `0x${string}`; status: number }
type RawAgent = { active: boolean; perPaymentCap: bigint; dailyCap: bigint }

export function useVaultHistory({ vaultAddress, chainId, enabled }: UseVaultHistoryOptions) {
  const [agentAddresses, setAgentAddresses] = useState<Set<string>>(new Set())
  const [allowedPayeeAddresses, setAllowedPayeeAddresses] = useState<Set<string>>(new Set())
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [paidLast24h, setPaidLast24h] = useState<bigint>(0n)
  const [loading, setLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const runId = useRef(0)

  // A different vault or chain starts from a clean slate instead of showing the old one's data.
  useEffect(() => {
    runId.current++
    setAgentAddresses(new Set())
    setAllowedPayeeAddresses(new Set())
    setActivity([])
    setPaidLast24h(0n)
    setHistoryError(null)
  }, [vaultAddress, chainId])

  const load = useCallback(async () => {
    if (!enabled || !vaultAddress) return
    const id = ++runId.current
    setLoading(true)
    try {
      const client = makeArcClient(chainId)

      const next = (await withRetry(() =>
        client.readContract({ address: vaultAddress, abi: LEASH_VAULT_ABI, functionName: 'nextPaymentId' }),
      )) as bigint

      const start = next > BigInt(MAX_PAYMENTS) ? next - BigInt(MAX_PAYMENTS) : 0n
      const payments: LedgerPayment[] = []
      for (let from = start; from < next; from += BigInt(CHUNK)) {
        const to = from + BigInt(CHUNK) < next ? from + BigInt(CHUNK) : next
        const ids = Array.from({ length: Number(to - from) }, (_, i) => from + BigInt(i))
        const results = await withRetry(() =>
          client.multicall({
            allowFailure: true,
            contracts: ids.map((pid) => ({ address: vaultAddress, abi: LEASH_VAULT_ABI, functionName: 'getPayment' as const, args: [pid] as const })),
          }),
        )
        results.forEach((r, i) => {
          if (r.status !== 'success' || !r.result) throw new Error(`getPayment(${ids[i]}) failed`)
          const p = r.result as unknown as RawPayment
          payments.push({ id: ids[i], agent: p.agent, payee: p.payee, amount: BigInt(p.amount), queuedAt: Number(p.queuedAt), ref: bytes32ToString(p.ref), status: Number(p.status) })
        })
      }

      const ledger = buildLedger(payments, Math.floor(Date.now() / 1000))

      // Candidates: addresses seen in payments plus the ones this browser's owner added.
      const agentCands = [...new Set([...ledger.agents, ...getKnown(chainId, vaultAddress, 'agents').map((a) => a.toLowerCase())])]
      const payeeCands = [...new Set([...ledger.payees, ...getKnown(chainId, vaultAddress, 'payees').map((a) => a.toLowerCase())])]

      const [agentRes, payeeRes] = await Promise.all([
        agentCands.length
          ? withRetry(() =>
              client.multicall({
                allowFailure: true,
                contracts: agentCands.map((a) => ({ address: vaultAddress, abi: LEASH_VAULT_ABI, functionName: 'getAgent' as const, args: [a as `0x${string}`] as const })),
              }),
            )
          : Promise.resolve([]),
        payeeCands.length
          ? withRetry(() =>
              client.multicall({
                allowFailure: true,
                contracts: payeeCands.map((a) => ({ address: vaultAddress, abi: LEASH_VAULT_ABI, functionName: 'allowedPayees' as const, args: [a as `0x${string}`] as const })),
              }),
            )
          : Promise.resolve([]),
      ])

      const agents = new Set<string>()
      agentRes.forEach((r, i) => {
        if (r.status !== 'success') throw new Error(`getAgent(${agentCands[i]}) failed`)
        const cfg = r.result as unknown as RawAgent
        // Show configured agents, including deactivated ones so they can be reactivated.
        if (cfg.active || BigInt(cfg.perPaymentCap) > 0n || BigInt(cfg.dailyCap) > 0n) agents.add(agentCands[i])
      })
      const payees = new Set<string>()
      payeeRes.forEach((r, i) => {
        if (r.status !== 'success') throw new Error(`allowedPayees(${payeeCands[i]}) failed`)
        if (r.result === true) payees.add(payeeCands[i])
      })

      if (id !== runId.current) return // a newer load superseded this one
      setActivity(ledger.activity)
      setPaidLast24h(ledger.paidLast24hRaw)
      setAgentAddresses(agents)
      setAllowedPayeeAddresses(payees)
      setHistoryError(null)
    } catch (err) {
      console.error('[useVaultHistory] ledger load failed', err)
      if (id === runId.current) setHistoryError(err instanceof Error ? err.message : String(err))
    } finally {
      if (id === runId.current) setLoading(false)
    }
  }, [enabled, vaultAddress, chainId])

  useEffect(() => {
    if (!enabled || !vaultAddress) return
    void load()
    const interval = setInterval(() => {
      if (!document.hidden) void load()
    }, POLL_MS)
    const onVisibility = () => {
      if (!document.hidden) void load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, vaultAddress, load])

  return { agentAddresses, allowedPayeeAddresses, activity, paidLast24h, loading, historyError, retry: load }
}
