/**
 * Reads pending (held) payments by calling getPayment(id) for ids from
 * max(0, nextPaymentId - 200) up to nextPaymentId - 1.
 * Status === 1 means Pending.
 *
 * Primary path: viem multicall with Arc's multicall3 address.
 * Fallback: individual eth_call with at most 3 in flight (MAX_CONCURRENT).
 *
 * Never shows "Nothing is waiting" when the read failed -- surfaces an error
 * with a Retry button instead.
 */

import { useEffect, useState, useCallback } from 'react'
import { makeArcClient, withRetry } from '../lib/rpcClient'
import { LEASH_VAULT_ABI } from '../contracts/abi'
import { bytes32ToString } from '../lib/format'

export interface HeldPayment {
  id: bigint
  agent: string
  payee: string
  amount: bigint
  /** Unix timestamp seconds from the queuedAt field (uint48). */
  queuedAt: number
  ref: string
  status: number
}

interface UseHeldPaymentsOptions {
  vaultAddress: `0x${string}` | undefined
  chainId: number
  nextPaymentId: bigint
  enabled: boolean
}

const LOOKBACK = 200n
const STATUS_PENDING = 1

export function useHeldPayments({
  vaultAddress,
  chainId,
  nextPaymentId,
  enabled,
}: UseHeldPaymentsOptions) {
  const [held, setHeld] = useState<HeldPayment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled || !vaultAddress || nextPaymentId === 0n) return
    setLoading(true)
    setError(null)

    const client = makeArcClient(chainId)
    const startId = nextPaymentId > LOOKBACK ? nextPaymentId - LOOKBACK : 0n
    const count = Number(nextPaymentId - startId)
    if (count <= 0) { setLoading(false); return }

    type RawPayment = {
      agent: string
      payee: string
      amount: bigint
      queuedAt: number | bigint
      ref: `0x${string}`
      status: number
    }

    function toHeld(id: bigint, p: RawPayment): HeldPayment | null {
      if (Number(p.status) !== STATUS_PENDING) return null
      return {
        id,
        agent: p.agent,
        payee: p.payee,
        amount: BigInt(p.amount),
        queuedAt: Number(p.queuedAt),
        ref: bytes32ToString(p.ref),
        status: STATUS_PENDING,
      }
    }

    try {
      // Primary: multicall -- the chain object has contracts.multicall3 defined.
      const contracts = Array.from({ length: count }, (_, i) => ({
        address: vaultAddress,
        abi: LEASH_VAULT_ABI,
        functionName: 'getPayment' as const,
        args: [startId + BigInt(i)] as const,
      }))

      const results = await withRetry(() =>
        client.multicall({ contracts, allowFailure: true }),
      )

      const pending: HeldPayment[] = []
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        if (r.status !== 'success' || !r.result) continue
        const hp = toHeld(startId + BigInt(i), r.result)
        if (hp) pending.push(hp)
      }
      setHeld(pending)
    } catch (multicallErr) {
      console.error('[useHeldPayments] multicall failed, falling back to individual calls:', multicallErr)

      // Fallback: individual calls with at most MAX_CONCURRENT in flight (via withRetry).
      try {
        const ids = Array.from({ length: count }, (_, i) => startId + BigInt(i))
        const settled = await Promise.allSettled(
          ids.map((id) =>
            withRetry(() =>
              client.readContract({
                address: vaultAddress,
                abi: LEASH_VAULT_ABI,
                functionName: 'getPayment',
                args: [id],
              }),
            ).then((res) => ({ id, result: res as RawPayment })),
          ),
        )

        const pending: HeldPayment[] = []
        for (const s of settled) {
          if (s.status !== 'fulfilled') continue
          const hp = toHeld(s.value.id, s.value.result)
          if (hp) pending.push(hp)
        }
        setHeld(pending)
      } catch (fallbackErr) {
        console.error('[useHeldPayments] fallback individual calls also failed:', fallbackErr)
        const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        setError(`Could not load held payments: ${msg}`)
        // Do not clear held -- keep the previous state if any
      }
    } finally {
      setLoading(false)
    }
  }, [vaultAddress, chainId, nextPaymentId, enabled])

  useEffect(() => {
    if (!enabled || !vaultAddress || nextPaymentId === 0n) return
    void load()
    const hidden = () => document.hidden
    let interval: ReturnType<typeof setInterval> | null = null

    function schedulePolling() {
      if (interval) clearInterval(interval)
      interval = setInterval(() => {
        if (!hidden()) void load()
      }, 8000)
    }

    schedulePolling()

    function onVisibility() {
      if (!document.hidden) void load()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load, enabled, vaultAddress, nextPaymentId])

  return { held, loading, error, retry: load }
}
