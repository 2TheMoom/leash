/**
 * Arc RPC infrastructure.
 *
 * Arc's public RPC endpoints have two limits:
 *   1. No more than ~6 concurrent requests (rate-limit / "Request exceeds defined limit").
 *   2. eth_getLogs block span must be < 10,000 (we use 4,000 in the window planner).
 *
 * This module provides:
 *   - arcChain()        -- a viem chain object with multicall3, correct decimals, and all
 *                          RPC endpoints wired into a fallback() transport.
 *   - makeArcClient()   -- a viem PublicClient built from the above.
 *   - RpcLimiter        -- a shared token-bucket limiter so all concurrent callers never
 *                          exceed MAX_CONCURRENT requests at once.
 *   - withRetry()       -- wraps any async RPC call with exponential backoff on rate-limit
 *                          errors and HTTP 429 (400, 800, 1600, 3200 ms, max 4 tries).
 */

import { createPublicClient, http, fallback } from 'viem'
import type { Chain } from 'viem'

// Multicall3 is deployed at the same address on both Arc networks.
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const

// RPC endpoints per network -- used in fallback() order.
const RPC_URLS: Record<number, string[]> = {
  5042002: [
    'https://rpc.testnet.arc.io',
    'https://rpc.blockdaemon.testnet.arc.io',
    'https://rpc.drpc.testnet.arc.io',
    'https://rpc.quicknode.testnet.arc.io',
  ],
  5042: [
    'https://rpc.mainnet.arc.io',
    'https://rpc.blockdaemon.mainnet.arc.io',
    'https://rpc.drpc.mainnet.arc.io',
    'https://rpc.quicknode.mainnet.arc.io',
  ],
}

const CHAIN_NAMES: Record<number, string> = {
  5042002: 'Arc Testnet',
  5042: 'Arc',
}

// On Arc, native gas == USDC (6 decimals).
// We set decimals: 18 here because viem uses this value for ETH-style display
// calculations; the app's own formatUsdc/parseUsdc helpers always use 6 and
// never rely on nativeCurrency.decimals.
export function arcChain(chainId: number): Chain {
  const urls = RPC_URLS[chainId] ?? RPC_URLS[5042002]
  return {
    id: chainId,
    name: CHAIN_NAMES[chainId] ?? 'Arc',
    nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: urls } },
    contracts: {
      multicall3: { address: MULTICALL3 },
    },
  }
}

export function rpcUrls(chainId: number): string[] {
  return RPC_URLS[chainId] ?? RPC_URLS[5042002]
}

export function makeArcClient(chainId: number) {
  const urls = rpcUrls(chainId)
  return createPublicClient({
    chain: arcChain(chainId),
    transport: fallback(urls.map((u) => http(u)), { retryCount: 0 }),
  })
}

// ---- Shared concurrency limiter ----

/**
 * Maximum simultaneous RPC requests across all callers (history + polling).
 * Arc allows ~6; we cap at 3 to leave headroom for wagmi's own polling.
 */
export const MAX_CONCURRENT = 3

export class RpcLimiter {
  private running = 0
  private queue: Array<() => void> = []
  private readonly cap: number

  constructor(cap = MAX_CONCURRENT) {
    this.cap = cap
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.cap) {
      this.running++
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve)
    })
  }

  private release(): void {
    const next = this.queue.shift()
    if (next) {
      // Keep running count stable; the next caller already increments on acquire.
      next()
    } else {
      this.running--
    }
  }

  get activeCount(): number { return this.running }
  get queuedCount(): number { return this.queue.length }
}

// One shared limiter for the whole app session.
export const globalLimiter = new RpcLimiter(MAX_CONCURRENT)

// ---- Exponential backoff retry ----

const BACKOFF_MS = [400, 800, 1600, 3200]

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('request exceeds defined limit') ||
    lower.includes('too many requests') ||
    lower.includes('requests are not allowed')
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run an RPC call through the global limiter with exponential backoff on rate
 * limit errors.  Non-rate-limit errors are rethrown immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < BACKOFF_MS.length + 1; attempt++) {
    try {
      return await globalLimiter.run(fn)
    } catch (err) {
      lastErr = err
      if (!isRateLimit(err)) throw err
      if (attempt < BACKOFF_MS.length) {
        console.warn(`[rpc] rate limited, backing off ${BACKOFF_MS[attempt]}ms (attempt ${attempt + 1})`)
        await sleep(BACKOFF_MS[attempt])
      }
    }
  }
  throw lastErr
}
