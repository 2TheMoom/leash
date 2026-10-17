/**
 * Pre-approval cross-check.
 *
 * The owner signs approve(id), which settles whatever is stored on chain for that
 * id. The approval card is built from one RPC endpoint, so a dishonest endpoint
 * could show a different payee or amount than the chain holds. Before sending
 * approve, re-read the payment from several independent endpoints and require
 * them to agree with what the owner is looking at.
 */

import { createPublicClient, getAddress, http } from 'viem'
import { LEASH_VAULT_ABI } from '../contracts/abi'
import { rpcUrls } from './rpcClient'

export interface ShownPayment {
  agent: string
  payee: string
  amount: bigint
}

export interface OnChainPayment extends ShownPayment {
  /** 1 = Pending in the contract's PaymentStatus enum. */
  status: number
}

export type Verdict =
  | { ok: true; endpoints: number }
  | { ok: false; kind: 'mismatch' | 'not-pending' | 'too-few'; message: string }

const MIN_AGREEING_ENDPOINTS = 2

function sameAddress(a: string, b: string): boolean {
  try {
    return getAddress(a) === getAddress(b)
  } catch {
    return false
  }
}

/** Pure comparison, unit tested. `results` holds one entry per endpoint that answered. */
export function judgePayment(shown: ShownPayment, results: OnChainPayment[]): Verdict {
  if (results.length < MIN_AGREEING_ENDPOINTS) {
    return {
      ok: false,
      kind: 'too-few',
      message: `Could only verify with ${results.length} RPC endpoint${results.length === 1 ? '' : 's'}. Try again in a moment.`,
    }
  }
  for (const r of results) {
    if (!sameAddress(r.payee, shown.payee) || !sameAddress(r.agent, shown.agent) || r.amount !== shown.amount) {
      return {
        ok: false,
        kind: 'mismatch',
        message: 'An RPC endpoint reports different payment details than the ones on screen. Do not approve. Reload and compare with the explorer.',
      }
    }
  }
  if (results.some((r) => r.status !== 1)) {
    return { ok: false, kind: 'not-pending', message: 'This payment is no longer pending.' }
  }
  return { ok: true, endpoints: results.length }
}

async function readFrom(url: string, chainId: number, vault: `0x${string}`, id: bigint): Promise<OnChainPayment | null> {
  try {
    const client = createPublicClient({ transport: http(url, { timeout: 8_000, retryCount: 0 }) })
    const p = (await client.readContract({
      address: vault,
      abi: LEASH_VAULT_ABI,
      functionName: 'getPayment',
      args: [id],
    })) as { agent: string; payee: string; amount: bigint; status: number }
    return { agent: p.agent, payee: p.payee, amount: BigInt(p.amount), status: Number(p.status) }
  } catch (err) {
    console.error(`[verify] ${url} (chain ${chainId}) failed`, err)
    return null
  }
}

/** Read the payment from every configured endpoint in parallel (at most 4) and judge. */
export async function verifyPaymentBeforeApproval(
  chainId: number,
  vault: `0x${string}`,
  id: bigint,
  shown: ShownPayment,
): Promise<Verdict> {
  const urls = rpcUrls(chainId).slice(0, 4)
  const answers = await Promise.all(urls.map((u) => readFrom(u, chainId, vault, id)))
  return judgePayment(shown, answers.filter((a): a is OnChainPayment => a !== null))
}
