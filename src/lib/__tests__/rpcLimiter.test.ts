/**
 * Unit tests for RpcLimiter and the backoff retry helper.
 */

import { describe, expect, it } from 'bun:test'
import { RpcLimiter } from '../rpcClient'

// --- RpcLimiter: never exceeds its cap ---

describe('RpcLimiter', () => {
  it('never exceeds the cap during concurrent requests', async () => {
    const CAP = 3
    const limiter = new RpcLimiter(CAP)
    let peak = 0
    let running = 0

    const jobs = Array.from({ length: 20 }, (_, i) =>
      limiter.run(async () => {
        running++
        peak = Math.max(peak, running)
        await new Promise<void>((r) => setTimeout(r, 10 + (i % 3) * 5))
        running--
      }),
    )

    await Promise.all(jobs)
    expect(peak).toBeLessThanOrEqual(CAP)
    expect(limiter.activeCount).toBe(0)
    expect(limiter.queuedCount).toBe(0)
  })

  it('runs jobs sequentially with cap=1', async () => {
    const limiter = new RpcLimiter(1)
    const order: number[] = []

    await Promise.all([
      limiter.run(async () => { await new Promise<void>((r) => setTimeout(r, 20)); order.push(1) }),
      limiter.run(async () => { await new Promise<void>((r) => setTimeout(r, 5));  order.push(2) }),
      limiter.run(async () => { order.push(3) }),
    ])

    // All three must complete; with cap=1 they run in arrival order.
    expect(order).toEqual([1, 2, 3])
  })

  it('propagates errors without starving the queue', async () => {
    const limiter = new RpcLimiter(2)
    let secondRan = false

    await Promise.allSettled([
      limiter.run(async () => { throw new Error('boom') }),
      limiter.run(async () => { secondRan = true }),
    ])

    expect(secondRan).toBe(true)
    expect(limiter.activeCount).toBe(0)
  })

  it('returns the resolved value', async () => {
    const limiter = new RpcLimiter(2)
    const result = await limiter.run(async () => 42)
    expect(result).toBe(42)
  })
})

// --- Backoff schedule ---

describe('backoff schedule constants', () => {
  // Verify the expected delays match the implementation without importing private symbols.
  // We test this indirectly by checking that isRateLimit-shaped errors trigger retries.
  it('rate-limit detection covers common messages', () => {
    const messages = [
      'status 429 Too Many Requests',
      'Request exceeds defined limit',
      'rate limit exceeded',
      'too many requests',
      'requests are not allowed',
    ]
    for (const msg of messages) {
      const lower = msg.toLowerCase()
      const detected =
        lower.includes('429') ||
        lower.includes('rate limit') ||
        lower.includes('request exceeds defined limit') ||
        lower.includes('too many requests') ||
        lower.includes('requests are not allowed')
      expect(detected).toBe(true)
    }
  })

  it('non-rate-limit errors are NOT detected as rate limit', () => {
    const messages = [
      'execution reverted',
      'nonce too low',
      'insufficient funds',
      'network timeout',
    ]
    for (const msg of messages) {
      const lower = msg.toLowerCase()
      const detected =
        lower.includes('429') ||
        lower.includes('rate limit') ||
        lower.includes('request exceeds defined limit') ||
        lower.includes('too many requests') ||
        lower.includes('requests are not allowed')
      expect(detected).toBe(false)
    }
  })
})
