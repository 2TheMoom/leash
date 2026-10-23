/**
 * Agents and payees the owner added from this browser, kept per chain and vault.
 *
 * The contract cannot list its agents or allowlist, and old event logs are not
 * reachable on Arc's public RPCs, so the dashboard shows addresses it can discover from
 * payments plus the ones the owner added here. Every address is still checked against
 * the contract before it is shown, so this list can only add candidates, never claims.
 */

type Kind = 'agents' | 'payees'

const key = (chainId: number, vault: string, kind: Kind) => `leash-known-${kind}-${chainId}-${vault.toLowerCase()}`

export function getKnown(chainId: number, vault: string, kind: Kind): string[] {
  try {
    const raw = localStorage.getItem(key(chainId, vault, kind))
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((a): a is string => typeof a === 'string') : []
  } catch {
    return []
  }
}

export function addKnown(chainId: number, vault: string, kind: Kind, address: string): void {
  try {
    const set = new Set(getKnown(chainId, vault, kind).map((a) => a.toLowerCase()))
    set.add(address.toLowerCase())
    localStorage.setItem(key(chainId, vault, kind), JSON.stringify([...set]))
  } catch {
    /* storage may be blocked */
  }
}
