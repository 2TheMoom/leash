import { useCallback, useSyncExternalStore } from 'react'
import { SUPPORTED_CHAIN_IDS } from '../contracts/addresses'

const KEY = 'leash-preferred-chain'
const DEFAULT_CHAIN: number = SUPPORTED_CHAIN_IDS[0]
const listeners = new Set<() => void>()

/** Pure: accept only chains Leash supports, else the default. */
export function parsePreferredChain(raw: string | null | undefined): number {
  const n = Number(raw)
  return (SUPPORTED_CHAIN_IDS as readonly number[]).includes(n) ? n : DEFAULT_CHAIN
}

function read(): number {
  try {
    return parsePreferredChain(localStorage.getItem(KEY))
  } catch {
    return DEFAULT_CHAIN
  }
}

function write(id: number) {
  try {
    localStorage.setItem(KEY, String(id))
  } catch {
    /* storage may be blocked */
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

/** The network the owner last chose, shared by every component and remembered across visits. */
export function usePreferredChain(): [number, (id: number) => void] {
  const chain = useSyncExternalStore(subscribe, read, () => DEFAULT_CHAIN)
  const set = useCallback((id: number) => write(parsePreferredChain(String(id))), [])
  return [chain, set]
}
