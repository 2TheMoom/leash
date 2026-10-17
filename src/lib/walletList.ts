/**
 * Turn the connectors wagmi exposes into the list the wallet tag shows.
 *
 * wagmi discovers browser wallets through the standard EIP-6963 announcement, so each
 * one arrives with its own name, id (reverse domain) and icon. The generic
 * "Injected" connector (window.ethereum) is only kept when nothing announced itself.
 */

export interface ConnectorLike {
  uid: string
  id: string
  name: string
  icon?: string
}

export interface WalletOption<C extends ConnectorLike = ConnectorLike> {
  connector: C
  name: string
  /** Only ever a data:image URI taken from the wallet's announcement, else undefined. */
  icon: string | undefined
}

/** Wallet icons are untrusted strings. Allow data:image URIs only (inert inside <img>). */
export function safeIcon(icon: string | undefined): string | undefined {
  if (!icon) return undefined
  return /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml)[;,]/i.test(icon) ? icon : undefined
}

export function pickWallets<C extends ConnectorLike>(connectors: readonly C[]): WalletOption<C>[] {
  const announced = connectors.filter((c) => c.id !== 'injected')
  const source = announced.length > 0 ? announced : connectors
  const seen = new Set<string>()
  const out: WalletOption<C>[] = []
  for (const c of source) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    out.push({ connector: c, name: c.name || 'Browser wallet', icon: safeIcon(c.icon) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Map a thrown connect error to a short message for the status line. */
export function describeConnectError(err: unknown, walletName: string): { kind: 'rejected' | 'error'; message: string } {
  const e = err as { name?: string; code?: number; shortMessage?: string; message?: string } | undefined
  if (e?.name === 'UserRejectedRequestError' || e?.code === 4001) {
    return { kind: 'rejected', message: `${walletName} rejected the request. Nothing was shared. Try again when you are ready.` }
  }
  if (e?.code === -32002) {
    return { kind: 'error', message: `${walletName} already has a request open. Open the extension and finish or dismiss it.` }
  }
  return { kind: 'error', message: e?.shortMessage || e?.message || `Could not connect to ${walletName}.` }
}
