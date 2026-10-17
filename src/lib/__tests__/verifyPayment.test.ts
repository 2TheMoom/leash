import { describe, expect, it } from 'bun:test'
import { judgePayment } from '../verifyPayment'

const payee = '0xD81145868710b228C9efdA234b89BFad40A47eE5'
const agent = '0x1F4fB0D87999C0A7dB1e3B8c63D9F0335f877142'
const shown = { agent, payee, amount: 300000n }
const good = { ...shown, status: 1 }

describe('judgePayment', () => {
  it('accepts when two or more endpoints agree with what is shown', () => {
    expect(judgePayment(shown, [good, good])).toEqual({ ok: true, endpoints: 2 })
    expect(judgePayment(shown, [good, good, good, good])).toEqual({ ok: true, endpoints: 4 })
  })

  it('is case-insensitive about addresses', () => {
    const lower = { ...good, payee: payee.toLowerCase(), agent: agent.toLowerCase() }
    expect(judgePayment(shown, [lower, good]).ok).toBe(true)
  })

  it('refuses when fewer than two endpoints answered', () => {
    const v = judgePayment(shown, [good])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.kind).toBe('too-few')
    expect(judgePayment(shown, []).ok).toBe(false)
  })

  it('refuses when any endpoint disagrees on the payee', () => {
    const evil = { ...good, payee: '0x00000000000000000000000000000000c0ffee01' }
    const v = judgePayment(shown, [good, evil, good])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.kind).toBe('mismatch')
  })

  it('refuses when any endpoint disagrees on the amount or agent', () => {
    expect(judgePayment(shown, [good, { ...good, amount: 3000000n }]).ok).toBe(false)
    expect(judgePayment(shown, [good, { ...good, agent: payee }]).ok).toBe(false)
  })

  it('refuses a payment that is no longer pending', () => {
    const v = judgePayment(shown, [good, { ...good, status: 2 }])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.kind).toBe('not-pending')
  })

  it('treats malformed addresses as a mismatch', () => {
    expect(judgePayment(shown, [good, { ...good, payee: 'nonsense' }]).ok).toBe(false)
  })
})
