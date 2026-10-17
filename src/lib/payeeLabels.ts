/**
 * Payee labels stored in localStorage per vault per chain.
 * Key: leash-payee-labels-{chainId}-{vaultAddress}
 * Value: JSON object mapping lowercase address to label string.
 */

function storageKey(chainId: number, vault: string): string {
  return `leash-payee-labels-${chainId}-${vault.toLowerCase()}`
}

export function getPayeeLabels(chainId: number, vault: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(chainId, vault))
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function setPayeeLabel(chainId: number, vault: string, address: string, label: string): void {
  try {
    const labels = getPayeeLabels(chainId, vault)
    if (label.trim()) {
      labels[address.toLowerCase()] = label.trim()
    } else {
      delete labels[address.toLowerCase()]
    }
    localStorage.setItem(storageKey(chainId, vault), JSON.stringify(labels))
  } catch {}
}

export function removePayeeLabel(chainId: number, vault: string, address: string): void {
  try {
    const labels = getPayeeLabels(chainId, vault)
    delete labels[address.toLowerCase()]
    localStorage.setItem(storageKey(chainId, vault), JSON.stringify(labels))
  } catch {}
}

export function getLabel(chainId: number, vault: string, address: string): string {
  return getPayeeLabels(chainId, vault)[address.toLowerCase()] ?? ''
}
