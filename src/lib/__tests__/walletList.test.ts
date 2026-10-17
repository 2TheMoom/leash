import { describe, expect, it } from 'bun:test'
import { describeConnectError, pickWallets, safeIcon } from '../walletList'
import { parsePreferredChain } from '../preferredChain'

const c = (id: string, name: string, icon?: string) => ({ uid: id + '-uid', id, name, icon })

describe('pickWallets', () => {
  it('hides the generic injected connector when wallets announced themselves', () => {
    const list = pickWallets([c('injected', 'Injected'), c('io.metamask', 'MetaMask'), c('io.rabby', 'Rabby Wallet')])
    expect(list.map((w) => w.name)).toEqual(['MetaMask', 'Rabby Wallet'])
  })

  it('keeps the generic connector when nothing announced itself', () => {
    expect(pickWallets([c('injected', 'Injected')]).map((w) => w.name)).toEqual(['Injected'])
  })

  it('dedupes by id and sorts by name', () => {
    const list = pickWallets([c('b', 'Zed'), c('a', 'Alpha'), c('a', 'Alpha again')])
    expect(list.map((w) => w.name)).toEqual(['Alpha', 'Zed'])
  })

  it('returns an empty list for no connectors', () => {
    expect(pickWallets([])).toEqual([])
  })
})

describe('safeIcon', () => {
  it('allows data:image URIs only', () => {
    expect(safeIcon('data:image/svg+xml;base64,PHN2Zz4=')).toBeDefined()
    expect(safeIcon('data:image/png;base64,AAAA')).toBeDefined()
  })
  it('rejects remote, javascript and html data URIs', () => {
    expect(safeIcon('https://evil.example/x.png')).toBeUndefined()
    expect(safeIcon('javascript:alert(1)')).toBeUndefined()
    expect(safeIcon('data:text/html;base64,PGh0bWw+')).toBeUndefined()
    expect(safeIcon(undefined)).toBeUndefined()
  })
})

describe('describeConnectError', () => {
  it('recognises a rejection by name or EIP-1193 code', () => {
    expect(describeConnectError({ name: 'UserRejectedRequestError' }, 'Rabby').kind).toBe('rejected')
    expect(describeConnectError({ code: 4001 }, 'Rabby').kind).toBe('rejected')
  })
  it('explains a request that is already open', () => {
    const r = describeConnectError({ code: -32002 }, 'MetaMask')
    expect(r.kind).toBe('error')
    expect(r.message).toContain('already has a request open')
  })
  it('falls back to the error message', () => {
    expect(describeConnectError(new Error('boom'), 'X').message).toBe('boom')
    expect(describeConnectError(undefined, 'X').message).toContain('Could not connect')
  })
})

describe('parsePreferredChain', () => {
  it('accepts supported chains and defaults otherwise', () => {
    expect(parsePreferredChain('5042')).toBe(5042)
    expect(parsePreferredChain('5042002')).toBe(5042002)
    expect(parsePreferredChain('1')).toBe(5042002)
    expect(parsePreferredChain(null)).toBe(5042002)
    expect(parsePreferredChain('abc')).toBe(5042002)
  })
})
