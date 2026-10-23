# Leash security model

This document says what Leash protects, from whom, what it trusts, and where the
limits are. Every claim in the "Enforced by the contract" section is covered by a
test named next to it. Nothing here has had a professional third-party audit.

## What is being protected

USDC held in a `LeashVault`, and the owner's ability to stop an agent at any time.

## Actors

| Actor | Trusted with | Not trusted with |
|---|---|---|
| Owner | Everything: agents, payees, approvals, withdrawals, ownership | n/a (the owner key is the root of trust) |
| Agent | `pay` within its caps, cancelling its own queued payments | Anything else. Assume the agent key or software can be fully compromised |
| Anyone | Depositing, calling `execute` once an owner-enabled delay has passed | Everything else |
| Frontend host | Serving the app | Moving funds. The app only builds transactions the owner signs |
| RPC providers | Returning chain data | Truth. See "Frontend trust" below |

The headline design goal: **a fully compromised agent can lose the owner at most
`dailyCap` per 24h window, and in the default approval-only mode it can lose
nothing to an address the owner has not allowlisted.**

## Enforced by the contract

| Property | Test |
|---|---|
| In approval-only mode (delay 0) an agent can never get USDC to a non-allowlisted address without the owner's `approve` | `LeashVault_CompromisedAgent_ApprovalOnly.invariant_strangersReceiveNothing` |
| In every mode, an agent's total outflow over any period is at most `dailyCap * (floor(elapsed / 1 day) + 1)` | `CompromisedAgentBase.invariant_agentOutflowIsBoundedByDailyCapPerWindow` (both modes) |
| `reserved` is always covered by the vault's balance, and equals the sum of Pending payments | `invariant_reservedAlwaysCoveredByBalance`, `invariant_reservedEqSumPending`, `testFuzz_ReservedEquality` |
| `pendingCount` always equals the number of Pending payments | `testFuzz_PendingCountMatchesPendingPayments` |
| An agent can never spend funds reserved for a queued payment | `test_Withdraw_CannotTouchReserved`, `LeashVault_Fuzz` |
| The owner can always cancel, approve and withdraw, even when frozen | `test_Approve_WorksWhileFrozen`, `test_Withdraw_WorksWhileFrozen` |
| A blocklisted payee cannot brick the vault | `LeashVault_BlocklistUSDC` |
| No re-entry into any guarded function through a token hook | `LeashVault_Reentrancy` |
| A pending owner has no powers until it accepts, an old owner has none after, and a mistaken proposal can be overwritten | `test_Owner_*` |
| A queued payment cannot be settled twice, and unknown ids revert | `test_Replay_*` |
| Lowering caps or deactivating an agent blocks auto-release but never the owner's approval or cancel | `test_Lifecycle_*` |
| The daily window boundary is exact | `test_Window_BoundaryIsExact` |
| Extreme values (uint128 max) revert cleanly instead of overflowing | `test_Extremes_*` |
| Externally added balance only increases `available()` | `test_Funding_*` |

The invariant tests were mutation-checked: removing the daily-allowance charge from
`execute()` makes the loss-bound invariant fail, and treating every payee as
allowlisted makes the no-strangers invariant fail.

## Known contract limits (by design, documented)

1. **Auto-release trusts the delay.** With `autoReleaseDelay > 0`, a queued payment
   to any address pays out after the delay unless the owner cancels or freezes. The
   daily cap still bounds the loss. The app creates vaults with the delay off.
2. **Fixed daily windows.** A burst of up to `2 x dailyCap` is possible across a
   window boundary. The bound above already accounts for this.
3. **Owner approval bypasses caps.** Caps bind agents, not the owner.
4. **The owner key is a single point of failure.** Use a hardware wallet or a Safe.
   Ownership moves in two steps. To cancel a mistaken proposal, propose the current
   owner address (the proposal slot cannot be set to zero).
5. **No on-chain enumeration of agents or payees.** The contract cannot list them, and
   Arc's public RPCs cannot serve old event logs (they rate-limit `eth_getLogs`, cap the
   range and prune history). The dashboard therefore rebuilds its ledger from contract
   state: every payment is stored by id, so one multicall recovers the activity, the
   agents that have paid and the payees that were paid. Each candidate address is then
   confirmed with `getAgent` and `allowedPayees` before it is shown. An agent or payee
   that was configured but never used, by an owner on a different device, will not
   appear for other viewers. Check a specific address with `getAgent` and
   `allowedPayees`. The activity list shows payments only, dated by when they were
   queued or paid, and links to the explorer for the full event history.
6. **Deposits are plain ERC-20 transfers.** Tokens sent by mistake cannot be recovered.
7. **Payee can be the token contract itself.** An owner who approves that loses the
   funds. The approval card shows the full address so this is visible.
8. **Blocklist risk on the vault itself.** If the USDC issuer blocklists the vault
   address, nothing can move. No contract can prevent that.

## Frontend trust

The app is a convenience, not a security boundary. The contract enforces the rules
even if the app is malicious, but a malicious or compromised app could try to trick
an owner into signing the wrong thing. Mitigations in place:

- The approval card shows the **full checksummed payee address**, the agent, the
  amount and the reference, and warns when the payee looks like an allowlisted
  address (matching first and last four characters, the address-poisoning pattern).
- References chosen by an agent are decoded as UTF-8 and stripped of control and
  bidirectional characters.
- Amount inputs are strictly validated. Bad input shows a message and sends nothing.
- Writes are blocked unless the wallet is on the vault's chain.
- Read-only watch mode (`/app?vault=...&chain=...`) renders no write controls.
- The factory address per chain is fixed in the build, verified on the explorer.
- Security headers, all verified on the live site: a content security policy that
  allows scripts, styles, fonts and images only from the app itself and network calls
  only to the eight Arc RPC endpoints, plus `frame-ancestors 'none'` and
  `X-Frame-Options: DENY` (no clickjacking), `nosniff`, no-referrer and HSTS.
- No analytics, no tracking and no third-party scripts. Fonts are bundled with the
  app. The connect step uses the wallets the browser announces itself (EIP-6963), so
  there is no wallet-kit dependency and no WalletConnect or other outside service.
- Wallet icons from the browser are only rendered if they are `data:image` URIs.

Residual risks to be aware of:

- **A dishonest RPC can lie about what a queued payment is.** The transaction the
  owner signs is `approve(id)`, which settles whatever is stored on chain for that
  id. The app re-reads the payment from independent RPC endpoints before sending
  and refuses to proceed if they disagree with what is on screen.
- **Wallet prompts show only `approve(id)`.** The wallet cannot show the payee, so
  the in-app card is the review surface.
- **The demo burner agent key lives in browser storage.** It is for demos, limited
  by the caps you set, and should hold only dust for gas. Run real agents with their
  own key management.
- **Supply chain.** The dependency set was cut to what the app imports (about 450
  packages installed, none of them wallet SDKs). Builds use a lockfile.

## Reporting

Open an issue on the repository. For anything that could put funds at risk, please
describe it privately first.
