/**
 * Live integration check against Arc Testnet.
 * Uses the app's own ABI, address constants, and formatting helpers.
 * Run: bun run scripts/live-check.ts
 *
 * Asserts the known state of vault 0x2155fb0D6882D75714110B8FBEE376b33e16Dcbd:
 *   owner  0x3e74AF9456016427D5efc200C04E4CC0Dd8719b4
 *   balance 3.00 USDC, reserved 2.00, available 1.00, nextPaymentId 3
 *   payment id 1: Pending, 1.25 USDC, ref inv-0042
 *   payment id 2: Pending, 0.75 USDC, ref rsch-007
 *   agent 0x1F4fB0D87999C0A7dB1e3B8c63D9F0335f877142: perPaymentCap 2.00, dailyCap 3.00
 *   allowed payee 0xD81145868710b228C9efdA234b89BFad40A47eE5
 */

import { createPublicClient, http, fallback, erc20Abi } from 'viem'
import { LEASH_FACTORY_ABI, LEASH_VAULT_ABI } from '../src/contracts/abi'
import { formatUsdc, bytes32ToString } from '../src/lib/format'

// Known constants
const FACTORY   = '0x6b890344f30c87edb362900591770967a3a7f8c7' as const
const OWNER     = '0x3e74AF9456016427D5efc200C04E4CC0Dd8719b4' as const
const VAULT     = '0x2155fb0D6882D75714110B8FBEE376b33e16Dcbd' as const
const USDC      = '0x3600000000000000000000000000000000000000' as const
const AGENT     = '0x1F4fB0D87999C0A7dB1e3B8c63D9F0335f877142' as const
const PAYEE     = '0xD81145868710b228C9efdA234b89BFad40A47eE5' as const
const CHAIN_ID  = 5042002

// Arc Testnet RPC endpoints (fallback order)
const RPC_URLS = [
  'https://rpc.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
]

const arcTestnet = {
  id: CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: RPC_URLS } },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' as const },
  },
} as const

const client = createPublicClient({
  chain: arcTestnet,
  transport: fallback(RPC_URLS.map((url) => http(url))),
})

let passed = 0
let failed = 0

function assert(label: string, actual: unknown, expected: unknown) {
  const ok = String(actual).toLowerCase() === String(expected).toLowerCase()
  if (ok) {
    console.log(`  PASS  ${label}: ${String(actual)}`)
    passed++
  } else {
    console.error(`  FAIL  ${label}: got ${String(actual)}, want ${String(expected)}`)
    failed++
  }
}

function assertBigInt(label: string, actual: bigint, expected: bigint) {
  const ok = actual === expected
  if (ok) {
    console.log(`  PASS  ${label}: ${actual}`)
    passed++
  } else {
    console.error(`  FAIL  ${label}: got ${actual}, want ${expected}`)
    failed++
  }
}

async function main() {
  console.log('Live check against Arc Testnet...\n')

  // 1. Factory: owner has >= 3 vaults, first is VAULT
  console.log('--- Factory ---')
  const vaults = await client.readContract({
    address: FACTORY,
    abi: LEASH_FACTORY_ABI,
    functionName: 'vaultsOf',
    args: [OWNER],
  })
  assert('vaultsOf length >= 3', (vaults as string[]).length >= 3, true)
  assert('vaultsOf[0] is VAULT', (vaults as string[])[0], VAULT)

  // 2. Vault state
  console.log('\n--- Vault state ---')
  const [frozen, reserved, available, nextPaymentId, autoReleaseDelay] = await Promise.all([
    client.readContract({ address: VAULT, abi: LEASH_VAULT_ABI, functionName: 'frozen' }),
    client.readContract({ address: VAULT, abi: LEASH_VAULT_ABI, functionName: 'reserved' }),
    client.readContract({ address: VAULT, abi: LEASH_VAULT_ABI, functionName: 'available' }),
    client.readContract({ address: VAULT, abi: LEASH_VAULT_ABI, functionName: 'nextPaymentId' }),
    client.readContract({ address: VAULT, abi: LEASH_VAULT_ABI, functionName: 'autoReleaseDelay' }),
  ])
  assert('frozen', frozen, false)
  assert('reserved', formatUsdc(reserved), '2.00')
  assert('available', formatUsdc(available), '1.00')
  assertBigInt('nextPaymentId', nextPaymentId, 3n)
  assert('autoReleaseDelay', autoReleaseDelay, 0)

  // 3. USDC balance
  console.log('\n--- USDC balance ---')
  const balance = await client.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [VAULT],
  })
  assert('usdcBalance', formatUsdc(balance), '3.00')

  // 4. Payments
  console.log('\n--- Payments ---')
  const [pay0, pay1, pay2] = await Promise.all([
    client.readContract({ address: VAULT, abi: LEASH_VAULT_ABI, functionName: 'getPayment', args: [0n] }),
    client.readContract({ address: VAULT, abi: LEASH_VAULT_ABI, functionName: 'getPayment', args: [1n] }),
    client.readContract({ address: VAULT, abi: LEASH_VAULT_ABI, functionName: 'getPayment', args: [2n] }),
  ])

  type Payment = { agent: string; payee: string; amount: bigint; queuedAt: number; ref: `0x${string}`; status: number }
  const p0 = pay0 as Payment
  const p1 = pay1 as Payment
  const p2 = pay2 as Payment

  // id 0 is the zero-value (not created yet or was id 0 and is settled)
  console.log(`  INFO  payment id 0 status: ${p0.status}`)

  // id 1: Pending, 1.25 USDC, ref inv-0042
  assert('payment[1].status', p1.status, 1)  // 1 = Pending
  assert('payment[1].amount', formatUsdc(BigInt(p1.amount)), '1.25')
  assert('payment[1].ref', bytes32ToString(p1.ref), 'inv-0042')
  assert('payment[1].payee', p1.payee.toLowerCase(), '0x00000000000000000000000000000000c0ffee01')
  assert('payment[1].agent', p1.agent.toLowerCase(), AGENT.toLowerCase())

  // id 2: Pending, 0.75 USDC, ref rsch-007
  assert('payment[2].status', p2.status, 1)
  assert('payment[2].amount', formatUsdc(BigInt(p2.amount)), '0.75')
  assert('payment[2].ref', bytes32ToString(p2.ref), 'rsch-007')
  assert('payment[2].payee', p2.payee.toLowerCase(), '0x00000000000000000000000000000000c0ffee01')
  assert('payment[2].agent', p2.agent.toLowerCase(), AGENT.toLowerCase())

  // 5. Agent config
  console.log('\n--- Agent config ---')
  const agentCfg = await client.readContract({
    address: VAULT,
    abi: LEASH_VAULT_ABI,
    functionName: 'getAgent',
    args: [AGENT],
  })

  assert('agent.active', agentCfg.active, true)
  assert('agent.perPaymentCap', formatUsdc(BigInt(agentCfg.perPaymentCap)), '2.00')
  assert('agent.dailyCap', formatUsdc(BigInt(agentCfg.dailyCap)), '3.00')
  // windowStart is a uint48 -- viem may return it as number; BigInt() must not throw
  const ws = BigInt(agentCfg.windowStart)
  assert('agent.windowStart BigInt() does not throw', typeof ws, 'bigint')

  // 6. Allowed payee
  console.log('\n--- Allowed payee ---')
  const isAllowed = await client.readContract({
    address: VAULT,
    abi: LEASH_VAULT_ABI,
    functionName: 'allowedPayees',
    args: [PAYEE],
  })
  assert('allowedPayees[PAYEE]', isAllowed, true)

  // Summary
  console.log(`\n${'='.repeat(40)}`)
  console.log(`Passed: ${passed}  Failed: ${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => { console.error('live-check error:', err); process.exit(1) })
