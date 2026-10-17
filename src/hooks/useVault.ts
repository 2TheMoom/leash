import { useReadContract, useReadContracts } from 'wagmi'
import { erc20Abi } from 'viem'
import { LEASH_VAULT_ABI } from '../contracts/abi'
import { USDC_ADDRESS } from '../contracts/addresses'
import { leftToday } from '../lib/format'

export interface AgentOnchain {
  address: string
  active: boolean
  perPaymentCap: bigint
  dailyCap: bigint
  spentInWindow: bigint
  windowStart: bigint
  pendingCount: number
  leftToday: bigint
}

/** Read core vault state: frozen, reserved, available, nextPaymentId. */
export function useVaultState(vaultAddress: `0x${string}` | undefined, chainId: number) {
  const enabled = !!vaultAddress

  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { address: vaultAddress!, abi: LEASH_VAULT_ABI, functionName: 'frozen', chainId },
      { address: vaultAddress!, abi: LEASH_VAULT_ABI, functionName: 'reserved', chainId },
      { address: vaultAddress!, abi: LEASH_VAULT_ABI, functionName: 'available', chainId },
      { address: vaultAddress!, abi: LEASH_VAULT_ABI, functionName: 'nextPaymentId', chainId },
      { address: vaultAddress!, abi: LEASH_VAULT_ABI, functionName: 'autoReleaseDelay', chainId },
      { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [vaultAddress!], chainId },
    ],
    query: { enabled, refetchInterval: 8000 },
  })

  return {
    frozen: (data?.[0]?.result) ?? false,
    reserved: (data?.[1]?.result) ?? 0n,
    available: (data?.[2]?.result) ?? 0n,
    nextPaymentId: (data?.[3]?.result) ?? 0n,
    // autoReleaseDelay is uint32 - viem may return it as number; normalise
    autoReleaseDelay: Number(data?.[4]?.result ?? 0),
    usdcBalance: (data?.[5]?.result) ?? 0n,
    refetch,
    isLoading,
  }
}

/** Read a single agent config from the vault. */
export function useAgentConfig(
  vaultAddress: `0x${string}` | undefined,
  agentAddress: `0x${string}` | undefined,
  chainId: number,
) {
  const enabled = !!vaultAddress && !!agentAddress
  const { data, refetch, isLoading } = useReadContract({
    address: vaultAddress!,
    abi: LEASH_VAULT_ABI,
    functionName: 'getAgent',
    args: [agentAddress!],
    chainId,
    query: { enabled, refetchInterval: 8000 },
  })

  // viem returns uint48 and uint32 as JavaScript numbers, not bigint.
  // Normalise all numeric fields to bigint at the boundary.
  type RawCfg = {
    active: boolean
    perPaymentCap: bigint | number
    dailyCap: bigint | number
    spentInWindow: bigint | number
    windowStart: bigint | number
    pendingCount: bigint | number
  }

  const raw = data as RawCfg | undefined

  const active = raw?.active ?? false
  const perPaymentCap = raw ? BigInt(raw.perPaymentCap) : 0n
  const dailyCap = raw ? BigInt(raw.dailyCap) : 0n
  const spentInWindow = raw ? BigInt(raw.spentInWindow) : 0n
  // windowStart is uint48 - viem returns it as a number
  const windowStart = raw ? BigInt(raw.windowStart) : 0n
  // pendingCount is uint32 - viem returns it as a number
  const pendingCount = raw ? Number(raw.pendingCount) : 0

  const left = leftToday(dailyCap, spentInWindow, windowStart)

  return {
    active,
    perPaymentCap,
    dailyCap,
    spentInWindow,
    windowStart,
    pendingCount,
    leftToday: left,
    refetch,
    isLoading,
  }
}

/** Read a single payment by id. */
export function usePayment(
  vaultAddress: `0x${string}` | undefined,
  id: bigint,
  chainId: number,
) {
  const enabled = !!vaultAddress
  return useReadContract({
    address: vaultAddress!,
    abi: LEASH_VAULT_ABI,
    functionName: 'getPayment',
    args: [id],
    chainId,
    query: { enabled },
  })
}
