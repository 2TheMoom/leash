/**
 * Unit tests for decodeLeashError.
 * Verifies whole-word matching so that similar error names do not bleed
 * into each other.
 */

import { describe, expect, it } from 'bun:test'
import { decodeLeashError } from '../errors'

describe('decodeLeashError', () => {
  it('returns user-cancelled message on user rejected', () => {
    expect(decodeLeashError({ message: 'user rejected the request', code: 4001 })).toBe('Transaction cancelled.')
  })

  it('matches NotOwner without matching NotOwnerOrAgent for NotOwner', () => {
    const msg = decodeLeashError(new Error('Error: NotOwner()'))
    expect(msg).toBe('Only the vault owner can do that.')
  })

  it('matches NotOwnerOrAgent correctly', () => {
    const msg = decodeLeashError(new Error('Error: NotOwnerOrAgent()'))
    expect(msg).toBe('Only the vault owner or the agent that queued this payment can cancel it.')
  })

  it('NotOwnerOrAgent does not match as NotOwner', () => {
    const msg = decodeLeashError(new Error('Error: NotOwnerOrAgent()'))
    expect(msg).not.toBe('Only the vault owner can do that.')
  })

  it('matches Frozen without matching NotFrozen or AlreadyFrozen', () => {
    const msg = decodeLeashError(new Error('Error: Frozen()'))
    expect(msg).toBe('This vault is frozen. The owner has paused agent payments.')
  })

  it('matches NotFrozen without triggering the Frozen message', () => {
    const msg = decodeLeashError(new Error('Error: NotFrozen()'))
    expect(msg).toBe('The vault is not frozen.')
    expect(msg).not.toBe('This vault is frozen. The owner has paused agent payments.')
  })

  it('matches AlreadyFrozen without triggering the Frozen message', () => {
    const msg = decodeLeashError(new Error('Error: AlreadyFrozen()'))
    expect(msg).toBe('The vault is already frozen.')
    expect(msg).not.toBe('This vault is frozen. The owner has paused agent payments.')
  })

  it('matches SafeERC20FailedOperation', () => {
    const msg = decodeLeashError(new Error('execution reverted: Error: SafeERC20FailedOperation(0x3600000000000000000000000000000000000000)'))
    expect(msg).toContain('USDC transfer failed')
  })

  it('matches ReentrancyGuardReentrantCall', () => {
    const msg = decodeLeashError(new Error('Error: ReentrancyGuardReentrantCall()'))
    expect(msg).toContain('Reentrant call')
  })

  it('returns generic reverted message for unknown error names', () => {
    const msg = decodeLeashError(new Error('execution reverted'))
    expect(msg).toBe('Transaction reverted. Check your inputs and try again.')
  })

  it('returns something-went-wrong for null', () => {
    expect(decodeLeashError(null)).toBe('Something went wrong.')
  })
})
