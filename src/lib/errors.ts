/**
 * Decode LeashVault custom errors into plain-language messages.
 * No em dashes. Honest, direct.
 */

const ERROR_MESSAGES: Record<string, string> = {
  NotOwner: 'Only the vault owner can do that.',
  NotAgent: 'Your address is not registered as an agent on this vault.',
  NotOwnerOrAgent: 'Only the vault owner or the agent that queued this payment can cancel it.',
  Frozen: 'This vault is frozen. The owner has paused agent payments.',
  AlreadyFrozen: 'The vault is already frozen.',
  NotFrozen: 'The vault is not frozen.',
  ZeroAddress: 'Cannot use the zero address.',
  SelfPayee: 'Cannot pay to the vault itself.',
  ZeroAmount: 'Amount must be greater than zero.',
  AmountExceedsCap: 'This amount is over the per-payment cap set by the vault owner.',
  DailyCapExceeded: 'This payment would exceed the daily spending cap. Try again tomorrow or ask the owner to raise the cap.',
  InsufficientAvailable: 'The vault does not have enough free USDC. Some funds may be reserved for other pending payments.',
  AgentNotActive: 'This agent is not active on the vault.',
  AgentPerCapTooHigh: 'The per-payment cap cannot exceed the daily cap.',
  PendingCapReached: 'This agent already has 20 payments waiting for approval. Cancel or wait for some to settle first.',
  PaymentNotPending: 'This payment is not in a pending state.',
  AutoReleaseNotEnabled: 'Auto-release is not enabled on this vault. Only the owner can approve payments.',
  TooEarly: 'The auto-release delay has not passed yet.',
  NoPendingOwner: 'No ownership transfer is in progress.',
  NotPendingOwner: 'Only the proposed new owner can accept ownership.',
  SafeERC20FailedOperation: 'The USDC transfer failed. The receiving address may be blocked by USDC.',
  ReentrancyGuardReentrantCall: 'Reentrant call detected. This should never happen; please report it.',
}

/**
 * Match a custom error name on whole-word boundaries so that
 * "NotFrozen" does not match the "Frozen" entry, and
 * "NotOwnerOrAgent" does not match "NotOwner".
 * The error name appears either as a bare word, or inside a selector
 * string like `Frozen()`, so we check for non-alphanumeric (or start/end)
 * on both sides.
 */
function matchesErrorName(msg: string, name: string): boolean {
  // Matches: start-of-string or non-word char, then the name, then
  // end-of-string, non-word char, or '(' (selector syntax).
  const pattern = new RegExp(`(?:^|[^A-Za-z0-9_])${name}(?:$|[^A-Za-z0-9_])`)
  return pattern.test(msg)
}

/** Parse a wagmi/viem error into a user-friendly string. */
export function decodeLeashError(err: unknown): string {
  if (!err) return 'Something went wrong.'
  const msg = typeof (err as Error)?.message === 'string'
    ? (err as Error).message
    : JSON.stringify(err)
  const lower = msg.toLowerCase()

  // User rejected
  if (lower.includes('user rejected') || lower.includes('user denied') || (err as { code?: number })?.code === 4001) {
    return 'Transaction cancelled.'
  }

  // Custom error name match -- whole-word so names cannot bleed into each other
  for (const [name, friendly] of Object.entries(ERROR_MESSAGES)) {
    if (matchesErrorName(msg, name)) return friendly
  }

  // Generic revert
  if (lower.includes('reverted')) {
    const reasonMatch = msg.match(/reason="([^"]+)"/) ?? msg.match(/Error: ([A-Z][a-zA-Z]+)\(\)/)
    if (reasonMatch) {
      const key = reasonMatch[1]
      return ERROR_MESSAGES[key] ?? `Transaction reverted: ${reasonMatch[1]}`
    }
    return 'Transaction reverted. Check your inputs and try again.'
  }

  if (lower.includes('insufficient funds')) return 'Insufficient funds in your wallet for gas.'
  if (lower.includes('network') || lower.includes('timeout')) return 'Network error. Check your connection and retry.'

  return 'Something went wrong. Check the console for details.'
}

/** Describe what will happen before sending, based on a simulate result or pre-check. */
export type SimulateOutcome =
  | { kind: 'paid'; message: string }
  | { kind: 'queued'; message: string }
  | { kind: 'rejected'; message: string }
