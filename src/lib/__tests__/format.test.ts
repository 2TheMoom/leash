/**
 * Unit tests for pure formatting helpers.
 * Run with: bun test src/lib/__tests__/format.test.ts
 */

import { describe, expect, it } from 'bun:test'
import {
  parseUsdc,
  formatUsdc,
  shortAddr,
  bytes32ToString,
  stringToBytes32,
  currentWindowSpend,
  leftToday,
} from '../format'

describe('parseUsdc', () => {
  it('parses whole numbers', () => {
    expect(parseUsdc('1')).toBe(1_000000n)
    expect(parseUsdc('100')).toBe(100_000000n)
    expect(parseUsdc('0')).toBe(0n)
  })

  it('parses decimals', () => {
    expect(parseUsdc('1.50')).toBe(1_500000n)
    expect(parseUsdc('0.01')).toBe(10000n)
    expect(parseUsdc('25.123456')).toBe(25_123456n)
  })

  it('truncates to 6 decimal places', () => {
    // 1.1234567 -> 1.123456 (truncated, not rounded)
    expect(parseUsdc('1.1234567')).toBe(1_123456n)
  })

  it('returns 0 for empty string', () => {
    expect(parseUsdc('')).toBe(0n)
    expect(parseUsdc('.')).toBe(0n)
  })

  it('handles leading/trailing whitespace', () => {
    expect(parseUsdc(' 5.00 ')).toBe(5_000000n)
  })
})

describe('formatUsdc', () => {
  it('formats whole numbers to 2 dp', () => {
    expect(formatUsdc(1_000000n)).toBe('1.00')
    expect(formatUsdc(100_000000n)).toBe('100.00')
    expect(formatUsdc(0n)).toBe('0.00')
  })

  it('formats fractions correctly', () => {
    expect(formatUsdc(1_500000n)).toBe('1.50')
    expect(formatUsdc(10000n)).toBe('0.01')
    expect(formatUsdc(123456n)).toBe('0.12') // 2dp truncation
  })

  it('round trips with parseUsdc for whole numbers', () => {
    const raw = parseUsdc('42.00')
    expect(formatUsdc(raw)).toBe('42.00')
  })
})

describe('shortAddr', () => {
  it('shortens a full address', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678'
    expect(shortAddr(addr)).toBe('0x1234...5678')
  })

  it('returns short strings unchanged', () => {
    expect(shortAddr('0x123')).toBe('0x123')
  })

  it('handles empty string', () => {
    expect(shortAddr('')).toBe('')
  })
})

describe('bytes32ToString / stringToBytes32', () => {
  it('round trips a short ASCII string', () => {
    const original = 'inv-001'
    const hex = stringToBytes32(original)
    expect(hex.startsWith('0x')).toBe(true)
    expect(hex.length).toBe(66) // 0x + 64 hex chars
    expect(bytes32ToString(hex)).toBe(original)
  })

  it('truncates strings over 32 bytes', () => {
    const long = 'a'.repeat(40)
    const hex = stringToBytes32(long)
    const back = bytes32ToString(hex)
    expect(back.length).toBeLessThanOrEqual(32)
  })

  it('handles empty string', () => {
    const hex = stringToBytes32('')
    expect(bytes32ToString(hex)).toBe('')
  })
})

describe('currentWindowSpend', () => {
  const now = BigInt(Math.floor(Date.now() / 1000))

  it('returns spentInWindow when window is current', () => {
    const windowStart = now - 3600n // 1 hour ago, within 24h window
    expect(currentWindowSpend(5_000000n, windowStart)).toBe(5_000000n)
  })

  it('returns 0 when window has expired', () => {
    const windowStart = now - 90000n // 25 hours ago
    expect(currentWindowSpend(5_000000n, windowStart)).toBe(0n)
  })
})

describe('leftToday', () => {
  const now = BigInt(Math.floor(Date.now() / 1000))

  it('returns dailyCap minus current spend within window', () => {
    const windowStart = now - 3600n
    const left = leftToday(25_000000n, 17_700000n, windowStart)
    expect(left).toBe(7_300000n)
  })

  it('returns full dailyCap when window has expired', () => {
    const windowStart = now - 90000n
    const left = leftToday(25_000000n, 17_700000n, windowStart)
    expect(left).toBe(25_000000n)
  })

  it('returns 0 when fully spent', () => {
    const windowStart = now - 100n
    const left = leftToday(25_000000n, 25_000000n, windowStart)
    expect(left).toBe(0n)
  })
})
