/**
 * Shared vault-selection hook.
 *
 * Both OwnerDashboard and AgentConsole import this so they always agree on which
 * vault is active, including after the owner uses the switcher.
 *
 * Selection rules:
 *   1. Default to the most-recent vault (last element of vaults[]).
 *   2. If a choice was stored in localStorage for this owner+chain, honour it
 *      only when it is still present in the current vaults list.
 *   3. Selecting a vault writes to localStorage so the other screen reacts on
 *      the next render.
 */

import { useState, useEffect } from 'react'

const STORAGE_PREFIX = 'leash-selected-vault'

function storageKey(chainId: number, owner: string): string {
  return `${STORAGE_PREFIX}-${chainId}-${owner.toLowerCase()}`
}

function loadStored(chainId: number, owner: string): string | null {
  try { return localStorage.getItem(storageKey(chainId, owner)) } catch { return null }
}

function saveStored(chainId: number, owner: string, vault: string): void {
  try { localStorage.setItem(storageKey(chainId, owner), vault) } catch {}
}

export interface UseSelectedVaultResult {
  /** The active vault address, or undefined when the list is empty. */
  selectedVault: `0x${string}` | undefined
  /** Call this to change the active vault and persist the choice. */
  selectVault: (vault: string) => void
}

/**
 * @param vaults   List of vault addresses for this owner, in creation order.
 * @param chainId  Chain the vaults live on.
 * @param owner    Owner address. Pass undefined when no wallet is connected.
 */
export function useSelectedVault(
  vaults: `0x${string}`[],
  chainId: number,
  owner: string | undefined,
): UseSelectedVaultResult {
  const [selectedVault, setSelectedVault] = useState<`0x${string}` | undefined>(undefined)

  // Derive from vaults + localStorage whenever either changes.
  useEffect(() => {
    if (vaults.length === 0) {
      setSelectedVault(undefined)
      return
    }
    const mostRecent = vaults[vaults.length - 1]
    if (!owner) {
      setSelectedVault(mostRecent)
      return
    }
    const stored = loadStored(chainId, owner)
    const matched = stored ? vaults.find((v) => v.toLowerCase() === stored.toLowerCase()) : undefined
    setSelectedVault(matched ?? mostRecent)
  // Re-run only when the vault list changes length, owner, or chain -- not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaults.length, chainId, owner])

  function selectVault(vault: string) {
    setSelectedVault(vault as `0x${string}`)
    if (owner) saveStored(chainId, owner, vault)
  }

  return { selectedVault, selectVault }
}

// Re-export helpers so callers that stored vaults themselves can also read the key.
export { loadStored as loadStoredVault, saveStored as saveStoredVault }
