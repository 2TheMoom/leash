/**
 * wagmi configuration
 * Built with Arc Studio - https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'

/** Arc mainnet - chain id 5042, USDC as native gas */
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
})

export const config = createConfig({
  chains: [arcTestnet, arcMainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.io'),
    [arcMainnet.id]: http('https://rpc.mainnet.arc.io'),
  },
})
