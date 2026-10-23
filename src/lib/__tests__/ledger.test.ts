import { describe, expect, it } from 'bun:test'
import { buildLedger, type LedgerPayment } from '../ledger'

const agentA = '0x6f074DeEeb80B45c50B886008EEBc1AaFd55088F'
const agentB = '0x1F4fB0D87999C0A7dB1e3B8c63D9F0335f877142'
const meridian = '0x091708D2394A3EF87792c71773A9C4ed70AA7969'
const stranger = '0x1a870eA7c2AEC156ff84c83fa4fD30bf9D6be5fb'
const NOW = 1_792_800_000

const pay = (id: number, p: Partial<LedgerPayment>): LedgerPayment => ({
  id: BigInt(id), agent: agentA, payee: meridian, amount: 200_000n, queuedAt: NOW - 100, ref: '', status: 2, ...p,
})

describe('buildLedger', () => {
  it('returns an empty ledger for no payments', () => {
    const l = buildLedger([], NOW)
    expect(l.activity).toEqual([])
    expect(l.paidLast24hRaw).toBe(0n)
    expect(l.agents).toEqual([])
    expect(l.payees).toEqual([])
  })

  it('lists newest first and maps statuses to PAID, HELD and CANCELLED', () => {
    const l = buildLedger([pay(0, { status: 2 }), pay(1, { status: 1, ref: 'inv-7' }), pay(2, { status: 3 })], NOW)
    expect(l.activity.map((a) => a.kind)).toEqual(['CANCELLED', 'HELD', 'PAID'])
    expect(l.activity[1].text).toContain('ref: inv-7')
    expect(l.activity[0].txHash).toBe('')
  })

  it('sums only Executed payments from the last 24 hours, exactly', () => {
    const l = buildLedger(
      [
        pay(0, { amount: 1_250_000n, queuedAt: NOW - 3_600 }),
        pay(1, { amount: 750_000n, queuedAt: NOW - 86_400 }), // boundary, inside
        pay(2, { amount: 999_000n, queuedAt: NOW - 86_401 }), // just outside
        pay(3, { amount: 5_000_000n, queuedAt: NOW - 60, status: 1 }), // pending, not paid
        pay(4, { amount: 7_000_000n, queuedAt: NOW - 60, status: 3 }), // cancelled
      ],
      NOW,
    )
    expect(l.paidLast24hRaw).toBe(2_000_000n)
  })

  it('collects distinct lowercase agents and payees', () => {
    const l = buildLedger([pay(0, {}), pay(1, { agent: agentB, payee: stranger }), pay(2, { agent: agentA.toLowerCase() })], NOW)
    expect(l.agents.sort()).toEqual([agentA.toLowerCase(), agentB.toLowerCase()].sort())
    expect(l.payees.sort()).toEqual([meridian.toLowerCase(), stranger.toLowerCase()].sort())
  })

  it('skips ids that never existed (status 0)', () => {
    expect(buildLedger([pay(0, { status: 0 })], NOW).activity).toEqual([])
  })

  it('keeps raw amounts as exact decimal strings', () => {
    const l = buildLedger([pay(0, { amount: 123_456_789_012_345_678n })], NOW)
    expect(l.activity[0].rawAmount).toBe('123456789012345678')
  })
})
