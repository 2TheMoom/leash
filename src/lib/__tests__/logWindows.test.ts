/**
 * Unit tests for buildWindows (log window planner).
 */

import { describe, expect, it } from 'bun:test'
import { buildWindows, MAX_WINDOW } from '../logWindows'

describe('buildWindows', () => {
  it('returns empty array when endBlock < startBlock', () => {
    expect(buildWindows(100n, 50n)).toEqual([])
  })

  it('returns a single window for a range smaller than MAX_WINDOW', () => {
    const windows = buildWindows(0n, 100n)
    expect(windows).toHaveLength(1)
    expect(windows[0]).toEqual([0n, 100n])
  })

  it('returns a single window for an exact MAX_WINDOW range', () => {
    const windows = buildWindows(0n, MAX_WINDOW - 1n)
    expect(windows).toHaveLength(1)
    expect(windows[0]).toEqual([0n, MAX_WINDOW - 1n])
  })

  it('windows never exceed MAX_WINDOW blocks', () => {
    const start = 0n
    const end = 50000n
    const windows = buildWindows(start, end)
    for (const [lo, hi] of windows) {
      const span = hi - lo + 1n
      expect(span).toBeLessThanOrEqual(MAX_WINDOW)
    }
  })

  it('windows are ordered newest-first', () => {
    const windows = buildWindows(0n, 20000n)
    for (let i = 0; i < windows.length - 1; i++) {
      // Each window starts after the next window ends
      expect(windows[i][0]).toBeGreaterThan(windows[i + 1][1])
    }
  })

  it('windows cover the range exactly with no gaps', () => {
    const start = 1000n
    const end = 15000n
    const windows = buildWindows(start, end)

    // Sorted low to high for gap check
    const sorted = [...windows].sort((a, b) => (a[0] < b[0] ? -1 : 1))

    expect(sorted[0][0]).toBe(start)
    expect(sorted[sorted.length - 1][1]).toBe(end)

    for (let i = 0; i < sorted.length - 1; i++) {
      // Adjacent windows touch exactly: next starts where previous ended + 1
      expect(sorted[i + 1][0]).toBe(sorted[i][1] + 1n)
    }
  })

  it('windows have no overlap', () => {
    const windows = buildWindows(0n, 30000n)
    const sorted = [...windows].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i][1]).toBeLessThan(sorted[i + 1][0])
    }
  })

  it('handles a single-block range', () => {
    const windows = buildWindows(42n, 42n)
    expect(windows).toHaveLength(1)
    expect(windows[0]).toEqual([42n, 42n])
  })
})
