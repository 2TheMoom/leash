/**
 * Unit test: viem returns uint48 and uint32 as JavaScript numbers, not bigint.
 * Verify that currentWindowSpend and leftToday survive a number-typed windowStart
 * (including 0) without throwing "Cannot mix BigInt and other types".
 */

import { describe, expect, it } from 'bun:test'
import { currentWindowSpend, leftToday } from '../format'

/**
 * Simulate the normalisation that useAgentConfig does at the boundary:
 *   const windowStart = raw ? BigInt(raw.windowStart) : 0n
 * where raw.windowStart is a number returned by viem for a uint48 field.
 */
function normalise(viemReturnShape: {
  active: boolean
  perPaymentCap: bigint
  dailyCap: bigint
  spentInWindow: bigint
  windowStart: number    // viem returns uint48 as number
  pendingCount: number   // viem returns uint32 as number
}) {
  return {
    active: viemReturnShape.active,
    perPaymentCap: BigInt(viemReturnShape.perPaymentCap),
    dailyCap: BigInt(viemReturnShape.dailyCap),
    spentInWindow: BigInt(viemReturnShape.spentInWindow),
    windowStart: BigInt(viemReturnShape.windowStart),
    pendingCount: Number(viemReturnShape.pendingCount),
  }
}

describe('BigInt normalisation for viem uint48/uint32 fields', () => {
  it('does not throw when windowStart is a number (0)', () => {
    const raw = { active: true, perPaymentCap: 10_000000n, dailyCap: 50_000000n, spentInWindow: 5_000000n, windowStart: 0, pendingCount: 0 }
    const cfg = normalise(raw)
    expect(() => currentWindowSpend(cfg.spentInWindow, cfg.windowStart)).not.toThrow()
  })

  it('does not throw when windowStart is a recent timestamp number', () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const raw = { active: true, perPaymentCap: 10_000000n, dailyCap: 50_000000n, spentInWindow: 5_000000n, windowStart: nowSec - 3600, pendingCount: 1 }
    const cfg = normalise(raw)
    expect(() => currentWindowSpend(cfg.spentInWindow, cfg.windowStart)).not.toThrow()
  })

  it('currentWindowSpend returns 0 when windowStart is 0 (expired window)', () => {
    const raw = { active: true, perPaymentCap: 10_000000n, dailyCap: 50_000000n, spentInWindow: 5_000000n, windowStart: 0, pendingCount: 0 }
    const cfg = normalise(raw)
    expect(currentWindowSpend(cfg.spentInWindow, cfg.windowStart)).toBe(0n)
  })

  it('leftToday returns full dailyCap when windowStart is 0', () => {
    const raw = { active: true, perPaymentCap: 10_000000n, dailyCap: 50_000000n, spentInWindow: 5_000000n, windowStart: 0, pendingCount: 0 }
    const cfg = normalise(raw)
    expect(leftToday(cfg.dailyCap, cfg.spentInWindow, cfg.windowStart)).toBe(50_000000n)
  })

  it('leftToday returns reduced amount inside an active window', () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const raw = { active: true, perPaymentCap: 10_000000n, dailyCap: 50_000000n, spentInWindow: 20_000000n, windowStart: nowSec - 3600, pendingCount: 2 }
    const cfg = normalise(raw)
    expect(leftToday(cfg.dailyCap, cfg.spentInWindow, cfg.windowStart)).toBe(30_000000n)
  })
})
