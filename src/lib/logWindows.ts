/**
 * Utilities for scanning event logs in bounded windows.
 * Arc public RPC rejects eth_getLogs when the requested block span is 10,000
 * or more (error -32012). We use windows of at most MAX_WINDOW blocks.
 */

export const MAX_WINDOW = 4000n

/**
 * Build a list of [fromBlock, toBlock] scan windows covering [startBlock,
 * endBlock] in MAX_WINDOW-sized slices, ordered newest-first.
 *
 * Both bounds are inclusive. The range is clamped so that no window is empty.
 */
export function buildWindows(
  startBlock: bigint,
  endBlock: bigint,
): Array<[bigint, bigint]> {
  if (endBlock < startBlock) return []
  const windows: Array<[bigint, bigint]> = []
  let hi = endBlock
  while (hi >= startBlock) {
    const lo = hi - MAX_WINDOW + 1n < startBlock ? startBlock : hi - MAX_WINDOW + 1n
    windows.push([lo, hi])
    if (lo <= startBlock) break
    hi = lo - 1n
  }
  return windows
}
