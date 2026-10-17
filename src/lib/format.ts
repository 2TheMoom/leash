/**
 * Pure formatting helpers.
 * These are the functions unit tests cover.
 */

const USDC_DECIMALS = 6
const USDC_UNIT = 10n ** BigInt(USDC_DECIMALS)

const UINT128_MAX = (1n << 128n) - 1n

/**
 * Parse a human-readable USDC string into raw uint128 units.
 * Returns null for anything that is not a plain non-negative decimal
 * ("abc", "-1", "1e3", "1,5", "1.2.3") or that does not fit in a uint128.
 * Digits beyond the 6th decimal are truncated.
 */
export function tryParseUsdc(value: string): bigint | null {
  const trimmed = value.trim()
  if (!/^\d*\.?\d*$/.test(trimmed)) return null
  const [intPart = '', fracPart = ''] = trimmed.split('.')
  const frac = (fracPart + '000000').slice(0, USDC_DECIMALS)
  const raw = BigInt(intPart || '0') * USDC_UNIT + BigInt(frac)
  return raw > UINT128_MAX ? null : raw
}

/** Like tryParseUsdc but throws on invalid input. */
export function parseUsdc(value: string): bigint {
  const raw = tryParseUsdc(value)
  if (raw === null) throw new Error('Invalid USDC amount')
  return raw
}

/** Format a raw uint128 USDC bigint to 2 decimal places. */
export function formatUsdc(raw: bigint): string {
  const whole = raw / USDC_UNIT
  const frac = raw % USDC_UNIT
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').slice(0, 2)
  return `${whole}.${fracStr}`
}

/** Shorten an address to 0x1234...abcd style. */
export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/**
 * Convert bytes32 hex to a display string. The value is chosen by the agent, so
 * control characters and bidi overrides are removed to stop it spoofing the UI.
 */
export function bytes32ToString(hex: string): string {
  try {
    const pairs = hex.slice(2).match(/.{2}/g) ?? []
    const bytes = Uint8Array.from(pairs.map((b) => parseInt(b, 16)))
    return new TextDecoder('utf-8')
      .decode(bytes)
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .trim()
  } catch {
    return hex
  }
}

/**
 * True when `addr` is NOT in `known` but shares its first 4 and last 4 hex
 * characters with an address that is (the "address poisoning" pattern).
 */
export function lookalikeOf(addr: string, known: string[]): string | null {
  const a = addr.toLowerCase()
  if (a.length !== 42) return null
  for (const k of known) {
    const b = k.toLowerCase()
    if (b === a || b.length !== 42) continue
    if (a.slice(0, 6) === b.slice(0, 6) && a.slice(-4) === b.slice(-4)) return k
  }
  return null
}

/** Convert a UTF-8 string to a bytes32 hex value. */
export function stringToBytes32(s: string): `0x${string}` {
  const bytes = new TextEncoder().encode(s.slice(0, 32))
  const padded = new Uint8Array(32)
  padded.set(bytes)
  return ('0x' + Array.from(padded).map((b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
}

/** Timestamp seconds -> relative time string. */
export function relativeTime(seconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - seconds
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  return `${Math.floor(diff / 86400)} days ago`
}

/** Compute current window spend. Returns 0 if window has expired. */
export function currentWindowSpend(spentInWindow: bigint, windowStart: bigint): bigint {
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (now >= windowStart + 86400n) return 0n
  return spentInWindow
}

/** Left today for an agent given raw chain values. */
export function leftToday(dailyCap: bigint, spentInWindow: bigint, windowStart: bigint): bigint {
  const spent = currentWindowSpend(spentInWindow, windowStart)
  const left = dailyCap - spent
  return left < 0n ? 0n : left
}
