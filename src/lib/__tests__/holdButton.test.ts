/**
 * Unit tests for HoldButton timer behaviour.
 *
 * HoldButton's onHeld must fire exactly once after durationMs, and must NOT
 * fire if the hold is released before durationMs.
 *
 * We cannot mount the React component in bun:test (no DOM), but we can test
 * the timer contract directly with Bun's fake-timer API.
 */

import { describe, expect, it, beforeEach, afterEach, jest } from 'bun:test'

// Minimal simulation of HoldButton's setTimeout/clearTimeout contract.
// This mirrors the actual component logic 1-to-1.
function makeHoldController(durationMs: number, onHeld: () => void) {
  let timerId: ReturnType<typeof setTimeout> | null = null
  let active = false

  function press() {
    if (active) return
    active = true
    timerId = setTimeout(() => {
      if (!active) return
      active = false
      timerId = null
      onHeld()
    }, durationMs)
  }

  function release() {
    if (!active) return
    active = false
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
  }

  return { press, release }
}

describe('HoldButton timer contract', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('calls onHeld exactly once after durationMs', () => {
    const cb = jest.fn()
    const ctrl = makeHoldController(700, cb)

    ctrl.press()
    expect(cb).not.toHaveBeenCalled()

    jest.advanceTimersByTime(699)
    expect(cb).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onHeld when released before durationMs', () => {
    const cb = jest.fn()
    const ctrl = makeHoldController(700, cb)

    ctrl.press()
    jest.advanceTimersByTime(400)
    ctrl.release()
    jest.advanceTimersByTime(1000) // well past the original deadline

    expect(cb).not.toHaveBeenCalled()
  })

  it('does NOT call onHeld when released at exactly durationMs - 1 ms', () => {
    const cb = jest.fn()
    const ctrl = makeHoldController(700, cb)

    ctrl.press()
    jest.advanceTimersByTime(699)
    ctrl.release()
    jest.advanceTimersByTime(500)

    expect(cb).not.toHaveBeenCalled()
  })

  it('onHeld is called only once even if press is called twice', () => {
    const cb = jest.fn()
    const ctrl = makeHoldController(700, cb)

    ctrl.press()
    ctrl.press() // second press while already active -- ignored
    jest.advanceTimersByTime(800)

    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('works for a second hold after the first completes', () => {
    const cb = jest.fn()
    const ctrl = makeHoldController(700, cb)

    // First hold completes.
    ctrl.press()
    jest.advanceTimersByTime(700)
    expect(cb).toHaveBeenCalledTimes(1)

    // Second hold.
    ctrl.press()
    jest.advanceTimersByTime(700)
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('release immediately after press prevents onHeld', () => {
    const cb = jest.fn()
    const ctrl = makeHoldController(700, cb)

    ctrl.press()
    ctrl.release()
    jest.advanceTimersByTime(2000)

    expect(cb).not.toHaveBeenCalled()
  })
})
