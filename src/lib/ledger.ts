/**
 * Builds the dashboard ledger from contract STATE instead of event logs.
 *
 * Why: Arc's public RPCs cannot serve old logs reliably. They rate-limit eth_getLogs,
 * cap the block range, and prune history, and blocks arrive every ~0.5 s, so a vault a
 * week old is over a million blocks deep. Every payment (instant, queued, approved or
 * cancelled) is stored on chain by id, so one multicall over getPayment rebuilds the
 * activity, the agents that have paid, the payees that were paid and the 24h total.
 *
 * Trade-off: no transaction hashes (the activity links to the explorer's event tab
 * instead) and owner-only events such as deposits, freezes and withdrawals are not listed.
 */

import { formatUsdc } from './format'

export interface ActivityEntry {
  /** Empty when unknown (state-based entries have no transaction hash). */
  txHash: string
  kind: 'PAID' | 'HELD' | 'APPROVED' | 'CANCELLED' | 'ALLOWED' | 'FROZEN' | 'UNFROZEN' | 'WITHDRAWN'
  text: string
  meta: string
  blockNumber: bigint
  /** Unix timestamp in seconds (0 if unknown). */
  timestamp: number
  /** Raw USDC amount as decimal string for bigint precision ("1250000" = 1.25 USDC). */
  rawAmount: string
}

export interface LedgerPayment {
  id: bigint
  agent: string
  payee: string
  amount: bigint
  /** uint48 seconds: when the payment was queued or paid. */
  queuedAt: number
  ref: string
  /** PaymentStatus enum: 1 Pending, 2 Executed, 3 Cancelled. */
  status: number
}

export interface Ledger {
  /** Newest first. */
  activity: ActivityEntry[]
  /** Sum of Executed payments whose queuedAt is within the last 24h. */
  paidLast24hRaw: bigint
  /** Distinct agent addresses seen in payments, lowercase. */
  agents: string[]
  /** Distinct payee addresses seen in payments, lowercase. */
  payees: string[]
}

const DAY = 86_400

export function buildLedger(payments: LedgerPayment[], nowSec: number): Ledger {
  const sorted = [...payments].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  const agents = new Set<string>()
  const payees = new Set<string>()
  const activity: ActivityEntry[] = []
  let paid24 = 0n

  for (const p of sorted) {
    if (p.status !== 1 && p.status !== 2 && p.status !== 3) continue // 0 = never existed
    agents.add(p.agent.toLowerCase())
    payees.add(p.payee.toLowerCase())
    const amt = formatUsdc(p.amount)
    const base = { txHash: '', meta: p.payee, blockNumber: 0n, timestamp: p.queuedAt, rawAmount: p.amount.toString() }
    if (p.status === 2) {
      if (p.queuedAt >= nowSec - DAY) paid24 += p.amount
      activity.push({ ...base, kind: 'PAID', text: `Paid ${amt} USDC to ${p.payee}${p.ref ? `, ref: ${p.ref}` : ''}` })
    } else if (p.status === 1) {
      activity.push({ ...base, kind: 'HELD', text: `Agent queued ${amt} USDC to ${p.payee}, ref: ${p.ref || '(none)'}` })
    } else {
      activity.push({ ...base, kind: 'CANCELLED', text: `Cancelled ${amt} USDC to ${p.payee}` })
    }
  }

  return { activity, paidLast24hRaw: paid24, agents: [...agents], payees: [...payees] }
}
