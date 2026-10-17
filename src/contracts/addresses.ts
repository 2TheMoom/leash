/** LeashFactory addresses per chain. Empty string means not deployed. */
export const LEASH_FACTORY_ADDRESSES: Record<number, string> = {
  5042002: '0x6b890344f30c87edb362900591770967a3a7f8c7', // Arc Testnet
  5042: '',    // Arc Mainnet - not yet deployed
}

/** USDC ERC-20 address (same on both Arc chains) */
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

/** Arc chain IDs supported by this app */
export const SUPPORTED_CHAIN_IDS = [5042002, 5042] as const
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]

export function factoryAddress(chainId: number): string {
  return LEASH_FACTORY_ADDRESSES[chainId] ?? ''
}

export function isSupported(chainId: number | undefined): chainId is SupportedChainId {
  return SUPPORTED_CHAIN_IDS.includes(chainId as SupportedChainId)
}
