import { useAccount, useSwitchChain } from 'wagmi'
import { isSupported, SUPPORTED_CHAIN_IDS } from '../contracts/addresses'

export function useChainSupport() {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const supported = isSupported(chainId)

  function switchToTestnet() {
    switchChain({ chainId: SUPPORTED_CHAIN_IDS[0] })
  }

  return { chainId, isConnected, supported, isSwitching, switchToTestnet }
}
