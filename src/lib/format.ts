/**
 * Pure formatting helpers.
 * These are the functions unit tests cover.
 */

const USDC_DECIMALS = 6
const USDC_UNIT = 10n ** BigInt(USDC_DECIMALS)

/** Parse a human-readable USDC string into raw uint128 (bigint). */
export function parseUsdc(value: string): bigint {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '.') return 0n
  const [intPart = '0', fracPart = ''] = trimmed.split('.')
  const frac = (fracPart + '000000').slice(0, USDC_DECIMALS)
  const raw = BigInt(intPart) * USDC_UNIT + BigInt(frac)
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

/** Convert bytes32 hex to a UTF-8 string, stripping null bytes. */
export function bytes32ToString(hex: string): string {
  try {
    const bytes = hex.slice(2).match(/.{2}/g) ?? []
    return bytes
      .map((b) => String.fromCharCode(parseInt(b, 16)))
      .join('')
      .replace(/\0/g, '')
      .trim()
  } catch {
    return hex
  }
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
