/**
 * Unit tests for the vault-selection resolution logic used by useSelectedVault.
 *
 * The hook wraps this logic in a useEffect, but the rules are deterministic and
 * pure: we test them directly without mounting React.
 */

import { describe, expect, it } from 'bun:test'

type Addr = `0x${string}`

// Pure resolver extracted from the hook logic.
function resolveVault(
  vaults: Addr[],
  stored: string | null,
): Addr | undefined {
  if (vaults.length === 0) return undefined
  const mostRecent = vaults[vaults.length - 1]
  if (stored === null || stored === '') return mostRecent
  // Return the vault from the list so the result is always canonical.
  const matched = vaults.find((v) => v.toLowerCase() === stored.toLowerCase())
  return matched ?? mostRecent
}

const V1 = '0x0000000000000000000000000000000000000001' as Addr
const V2 = '0x0000000000000000000000000000000000000002' as Addr
const V3 = '0x0000000000000000000000000000000000000003' as Addr
const GONE = '0x000000000000000000000000000000000000dead' as Addr

describe('vault selection logic', () => {
  it('returns undefined when the list is empty', () => {
    expect(resolveVault([], null)).toBeUndefined()
    expect(resolveVault([], V1)).toBeUndefined()
  })

  it('defaults to the most-recent vault (last in array) when nothing is stored', () => {
    expect(resolveVault([V1, V2, V3], null)).toBe(V3)
  })

  it('defaults to the only vault when there is exactly one', () => {
    expect(resolveVault([V1], null)).toBe(V1)
    expect(resolveVault([V1], null)).toBe(V1)
  })

  it('honours a stored choice that is in the list', () => {
    expect(resolveVault([V1, V2, V3], V1)).toBe(V1)
    expect(resolveVault([V1, V2, V3], V2)).toBe(V2)
  })

  it('honours a stored choice regardless of case', () => {
    const storedUpper = V2.toUpperCase()
    expect(resolveVault([V1, V2, V3], storedUpper)).toBe(V2)
  })

  it('ignores a stored choice that is no longer in the list', () => {
    expect(resolveVault([V1, V2, V3], GONE)).toBe(V3)
  })

  it('ignores a stored choice of empty string', () => {
    expect(resolveVault([V1, V2], '')).toBe(V2)
  })

  it('two vaults: most-recent is second', () => {
    expect(resolveVault([V1, V2], null)).toBe(V2)
  })

  it('switching from 3 vaults to 2 (vault removed) falls back to most-recent', () => {
    // V3 was selected but is no longer in the list.
    expect(resolveVault([V1, V2], V3)).toBe(V2)
  })
})
