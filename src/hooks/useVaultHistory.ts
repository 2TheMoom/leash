/**
 * Scans vault event logs in bounded 4,000-block windows, newest-first.
 *
 * Key design decisions driven by Arc RPC limits:
 *   - ONE getLogs call per window (no event filter -- fetch all logs for the
 *     vault address, then decode with parseEventLogs).
 *   - At most 2 windows in parallel (PARALLEL_WINDOWS = 2).
 *   - All RPC calls routed through the global limiter (MAX_CONCURRENT = 3)
 *     so history plus polling never exceed 3 concurrent requests.
 *   - Exponential backoff (400, 800, 1600, 3200 ms) on rate-limit errors.
 *   - Fallback transport across four Arc RPC endpoints.
 *   - Polling paused while the tab is hidden.
 *   - Errors are always console.error'd with the real cause.
 *   - Raw USDC amounts stored as decimal strings in the cache for bigint precision.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { parseEventLogs } from 'viem'
import { makeArcClient, withRetry } from '../lib/rpcClient'
import { LEASH_VAULT_ABI, LEASH_FACTORY_ABI } from '../contracts/abi'
import { formatUsdc, bytes32ToString } from '../lib/format'
import { buildWindows } from '../lib/logWindows'

export interface ActivityEntry {
  txHash: string
  kind: 'PAID' | 'HELD' | 'APPROVED' | 'CANCELLED' | 'ALLOWED' | 'FROZEN' | 'UNFROZEN' | 'WITHDRAWN'
  text: string
  meta: string
  blockNumber: bigint
  /** Unix timestamp in seconds (0 if not yet fetched). */
  timestamp: number
  /** Raw USDC amount as decimal string for bigint precision ("1250000" = 1.25 USDC). */
  rawAmount: string
}

interface UseVaultHistoryOptions {
  vaultAddress: `0x${string}` | undefined
  factoryAddress: string
  chainId: number
  enabled: boolean
}

const CREATION_BLOCK_KEY = (chainId: number, vault: string) =>
  `leash-creation-block-${chainId}-${vault.toLowerCase()}`

const HISTORY_CACHE_KEY = (chainId: number, vault: string) =>
  `leash-history-${chainId}-${vault.toLowerCase()}`

/** Max windows fetched in parallel. Keep at 2 to stay within Arc's concurrency limit. */
const PARALLEL_WINDOWS = 2

const SECONDS_24H = 86400

interface CachedHistory {
  agentAddresses: string[]
  allowedPayeeAddresses: string[]
  activity: ActivityEntry[]
  /** Sum of PAID+APPROVED rawAmounts in last 24h as decimal string. */
  paidLast24hRaw: string
  scannedTo: string
  scannedFrom: string
}

function loadCache(chainId: number, vault: string): CachedHistory | null {
  try {
    const raw = localStorage.getItem(HISTORY_CACHE_KEY(chainId, vault))
    return raw ? (JSON.parse(raw) as CachedHistory) : null
  } catch {
    return null
  }
}

function saveCache(chainId: number, vault: string, data: CachedHistory): void {
  try {
    localStorage.setItem(HISTORY_CACHE_KEY(chainId, vault), JSON.stringify(data))
  } catch {}
}

export function getCreationBlock(chainId: number, vault: string): bigint | null {
  try {
    const raw = localStorage.getItem(CREATION_BLOCK_KEY(chainId, vault))
    return raw ? BigInt(raw) : null
  } catch {
    return null
  }
}

export function storeCreationBlock(chainId: number, vault: string, block: bigint): void {
  try {
    localStorage.setItem(CREATION_BLOCK_KEY(chainId, vault), block.toString())
  } catch {}
}

/**
 * Fetch ALL logs for a vault address in one window, then decode known events.
 * Retries once with backoff on rate-limit errors (withRetry handles this).
 */
async function fetchWindowLogs(
  chainId: number,
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const client = makeArcClient(chainId)
  const rawLogs = await withRetry(() =>
    client.getLogs({ address, fromBlock, toBlock }),
  )

  // Decode all known vault events from the raw logs.
  const decoded = parseEventLogs({
    abi: LEASH_VAULT_ABI,
    logs: rawLogs,
    strict: false,
  })

  return decoded
}

export function useVaultHistory({
  vaultAddress,
  factoryAddress,
  chainId,
  enabled,
}: UseVaultHistoryOptions) {
  const [agentAddresses, setAgentAddresses] = useState<Set<string>>(new Set())
  const [allowedPayeeAddresses, setAllowedPayeeAddresses] = useState<Set<string>>(new Set())
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [paidLast24h, setPaidLast24h] = useState<bigint>(0n)
  const [loading, setLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const retryCounterRef = useRef(0)

  const scan = useCallback(async (force = false) => {
    if (!enabled || !vaultAddress) return
    if (document.hidden) return  // pause while tab is hidden

    setLoading(true)
    setHistoryError(null)

    try {
      const client = makeArcClient(chainId)
      const headBlock = await withRetry(() => client.getBlockNumber())

      // --- Resolve vault creation block ---
      let creationBlock = getCreationBlock(chainId, vaultAddress)
      if (creationBlock === null) {
        const factAddr = factoryAddress as `0x${string}`
        const factWindows = buildWindows(0n, headBlock)
        let found = false
        for (let i = 0; i < factWindows.length && !found; i++) {
          const [fb, tb] = factWindows[i]
          try {
            const factLogs = await withRetry(() =>
              client.getLogs({ address: factAddr, fromBlock: fb, toBlock: tb }),
            )
            const decoded = parseEventLogs({ abi: LEASH_FACTORY_ABI, logs: factLogs, strict: false })
            for (const log of decoded) {
              if (log.eventName !== 'VaultCreated') continue
              const args = log.args as { owner?: string; vault?: string }
              if (typeof args.vault === 'string' && args.vault.toLowerCase() === vaultAddress.toLowerCase()) {
                creationBlock = log.blockNumber ?? 0n
                storeCreationBlock(chainId, vaultAddress, creationBlock)
                found = true
                break
              }
            }
          } catch (err) {
            console.error('[useVaultHistory] VaultCreated scan window failed:', err)
          }
        }
        if (!found) creationBlock = 0n
      }

      // --- Cache check ---
      const cache = force ? null : loadCache(chainId, vaultAddress)
      const cachedTo = cache ? BigInt(cache.scannedTo) : null

      if (!force && cache && cachedTo === headBlock) {
        setAgentAddresses(new Set(cache.agentAddresses))
        setAllowedPayeeAddresses(new Set(cache.allowedPayeeAddresses))
        setActivity(cache.activity)
        setPaidLast24h(BigInt(cache.paidLast24hRaw || '0'))
        setLoading(false)
        return
      }

      const scanFrom = (!force && cache && cachedTo) ? cachedTo + 1n : (creationBlock ?? 0n)
      const scanTo = headBlock

      if (scanFrom > scanTo && cache) {
        setAgentAddresses(new Set(cache.agentAddresses))
        setAllowedPayeeAddresses(new Set(cache.allowedPayeeAddresses))
        setActivity(cache.activity)
        setPaidLast24h(BigInt(cache.paidLast24hRaw || '0'))
        setLoading(false)
        return
      }

      const windows = buildWindows(scanFrom, scanTo)

      const agentSet: Set<string> = cache ? new Set(cache.agentAddresses) : new Set()
      const payeeSet: Set<string> = cache ? new Set(cache.allowedPayeeAddresses) : new Set()
      const allActivity: ActivityEntry[] = cache ? [...cache.activity] : []

      // Track which payment ids have been queued (for APPROVED label).
      const queuedIdSet = new Set<string>()
      const executedIdSet = new Set<string>()

      // Process windows in batches of PARALLEL_WINDOWS.
      for (let w = 0; w < windows.length; w += PARALLEL_WINDOWS) {
        const batch = windows.slice(w, w + PARALLEL_WINDOWS)
        const batchResults = await Promise.all(
          batch.map(([fb, tb]) => fetchWindowLogs(chainId, vaultAddress, fb, tb)),
        )

        for (const logs of batchResults) {
          for (const log of logs) {
            const txHash = log.transactionHash ?? ''
            const blockNumber = log.blockNumber ?? 0n

            switch (log.eventName) {
              case 'AgentSet': {
                const args = log.args as { agent?: string; active?: boolean }
                const agent = (args.agent ?? '').toLowerCase()
                if (args.active) agentSet.add(agent)
                else agentSet.delete(agent)
                break
              }
              case 'PayeeSet': {
                const args = log.args as { payee?: string; allowed?: boolean }
                const payee = args.payee ?? ''
                if (args.allowed) payeeSet.add(payee.toLowerCase())
                else payeeSet.delete(payee.toLowerCase())
                allActivity.push({
                  txHash, kind: 'ALLOWED',
                  text: `Payee ${args.allowed ? 'added' : 'removed'}: ${payee}`,
                  meta: payee, blockNumber, timestamp: 0, rawAmount: '0',
                })
                break
              }
              case 'PaymentExecuted': {
                const args = log.args as { id?: bigint; payee?: string; amount?: bigint }
                const id = String(args.id ?? 0n)
                const amount = BigInt(args.amount ?? 0n)
                const payee = args.payee ?? ''
                executedIdSet.add(id)
                const wasQueued = queuedIdSet.has(id)
                allActivity.push({
                  txHash, kind: wasQueued ? 'APPROVED' : 'PAID',
                  text: `${wasQueued ? 'Approved' : 'Paid'} ${formatUsdc(amount)} USDC to ${payee}`,
                  meta: payee, blockNumber, timestamp: 0, rawAmount: amount.toString(),
                })
                break
              }
              case 'PaymentQueued': {
                const args = log.args as { id?: bigint; payee?: string; amount?: bigint; ref?: `0x${string}` }
                const id = String(args.id ?? 0n)
                const amount = BigInt(args.amount ?? 0n)
                const payee = args.payee ?? ''
                const ref = bytes32ToString(args.ref ?? '0x')
                queuedIdSet.add(id)
                if (!executedIdSet.has(id)) {
                  allActivity.push({
                    txHash, kind: 'HELD',
                    text: `Agent queued ${formatUsdc(amount)} USDC to ${payee}, ref: ${ref || '(none)'}`,
                    meta: payee, blockNumber, timestamp: 0, rawAmount: amount.toString(),
                  })
                }
                break
              }
              case 'PaymentCancelled': {
                const args = log.args as { amount?: bigint; payee?: string }
                const amount = BigInt(args.amount ?? 0n)
                const payee = args.payee ?? ''
                allActivity.push({
                  txHash, kind: 'CANCELLED',
                  text: `Cancelled ${formatUsdc(amount)} USDC to ${payee}`,
                  meta: payee, blockNumber, timestamp: 0, rawAmount: amount.toString(),
                })
                break
              }
              case 'VaultFrozen': {
                allActivity.push({
                  txHash, kind: 'FROZEN',
                  text: 'Vault frozen by owner',
                  meta: '', blockNumber, timestamp: 0, rawAmount: '0',
                })
                break
              }
              case 'VaultUnfrozen': {
                allActivity.push({
                  txHash, kind: 'UNFROZEN',
                  text: 'Vault unfrozen by owner',
                  meta: '', blockNumber, timestamp: 0, rawAmount: '0',
                })
                break
              }
              case 'Withdrawn': {
                const args = log.args as { to?: string; amount?: bigint }
                const amount = BigInt(args.amount ?? 0n)
                const to = args.to ?? ''
                allActivity.push({
                  txHash, kind: 'WITHDRAWN',
                  text: `Withdrawn ${formatUsdc(amount)} USDC to ${to}`,
                  meta: to, blockNumber, timestamp: 0, rawAmount: amount.toString(),
                })
                break
              }
              default:
                break
            }
          }
        }
      }

      allActivity.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0))
      const recentActivity = allActivity.slice(0, 50)

      // Fetch block timestamps for the top 20 entries (via limiter).
      const uniqueBlocks = [...new Set(recentActivity.slice(0, 20).map((e) => e.blockNumber))].filter((b) => b > 0n)
      const blockTimestamps = new Map<bigint, number>()
      await Promise.allSettled(
        uniqueBlocks.map(async (bn) => {
          try {
            const block = await withRetry(() => client.getBlock({ blockNumber: bn }))
            blockTimestamps.set(bn, Number(block.timestamp))
          } catch (err) {
            console.error(`[useVaultHistory] getBlock(${bn}) failed:`, err)
          }
        }),
      )
      for (const entry of recentActivity) {
        const ts = blockTimestamps.get(entry.blockNumber)
        if (ts !== undefined) entry.timestamp = ts
      }

      // Paid last 24h: sum rawAmount of PAID and APPROVED entries within 24h.
      const nowSec = Math.floor(Date.now() / 1000)
      let paid24h = 0n
      for (const entry of recentActivity) {
        if ((entry.kind === 'PAID' || entry.kind === 'APPROVED') && entry.timestamp > 0) {
          if (nowSec - entry.timestamp < SECONDS_24H) {
            paid24h += BigInt(entry.rawAmount || '0')
          }
        }
      }

      const newCache: CachedHistory = {
        agentAddresses: [...agentSet],
        allowedPayeeAddresses: [...payeeSet],
        activity: recentActivity,
        paidLast24hRaw: paid24h.toString(),
        scannedTo: headBlock.toString(),
        scannedFrom: (creationBlock ?? 0n).toString(),
      }
      saveCache(chainId, vaultAddress, newCache)

      setAgentAddresses(new Set(agentSet))
      setAllowedPayeeAddresses(new Set(payeeSet))
      setActivity(recentActivity)
      setPaidLast24h(paid24h)
    } catch (err) {
      console.error('[useVaultHistory] scan failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setHistoryError(`Could not load history: ${msg}`)

      // Serve cached data when available so agents and payees still show.
      const cache = loadCache(chainId, vaultAddress)
      if (cache) {
        setAgentAddresses(new Set(cache.agentAddresses))
        setAllowedPayeeAddresses(new Set(cache.allowedPayeeAddresses))
        setActivity(cache.activity)
        setPaidLast24h(BigInt(cache.paidLast24hRaw || '0'))
      }
    } finally {
      setLoading(false)
    }
  }, [enabled, vaultAddress, factoryAddress, chainId])

  const retry = useCallback(() => {
    retryCounterRef.current += 1
    void scan(true)
  }, [scan])

  useEffect(() => {
    if (!enabled || !vaultAddress) return
    void scan()

    const interval = setInterval(() => {
      if (!document.hidden) void scan()
    }, 30000)

    function onVisibility() {
      if (!document.hidden) void scan()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, vaultAddress, scan])

  return {
    agentAddresses,
    allowedPayeeAddresses,
    activity,
    paidLast24h,
    loading,
    historyError,
    retry,
  }
}
