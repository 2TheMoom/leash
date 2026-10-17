# Leash

A spending-policy vault for AI agents, on Arc. You hold USDC in your own vault. Your agents can spend it, but only inside rules you set and the chain enforces.

- **Per-agent caps.** A per-payment cap and a daily cap for every agent.
- **Payee allowlist.** Allowlisted payees are paid instantly. Anyone else is queued, the funds are reserved, and nothing moves until you approve it.
- **You stay in control.** Cancel a queued payment (the agent can cancel its own), freeze all agents in one transaction, withdraw whatever is not reserved.
- **No protocol owner.** A factory deploys one non-upgradeable vault per owner. No admin key, no proxy, no fees.

Built with [Arc Studio](https://studio.arc.io/app/b1487e97-5c74-40ed-a77e-d3fe19690659). The contracts and frontend were generated there, then independently reviewed, tested and fixed against the real Arc RPC outside of Studio.

## Deployments

| Network | Chain id | LeashFactory |
|---|---|---|
| Arc testnet | 5042002 | `0x6b890344f30c87edb362900591770967a3a7f8c7` |
| Arc mainnet | 5042 | see `src/contracts/addresses.ts` |

USDC on both networks is `0x3600000000000000000000000000000000000000` (ERC-20 interface, 6 decimals).

## How it works

```
LeashFactory  (no owner, no fees)
  createVault(autoReleaseDelay)  ->  LeashVault  (one per owner)

owner  : setAgent, setPayee, approve, cancel, freeze, withdraw, setAutoReleaseDelay, proposeOwner
agent  : pay(payee, amount, ref), cancel (own payments only)
anyone : execute(id) once autoReleaseDelay has passed (only if the owner enabled it)
```

`pay()` returns `(executed, id)`. If the payee is allowlisted and the amount fits both caps, USDC moves in the same transaction. Otherwise the payment is queued with its amount reserved, so the agent can never spend funds that are waiting on a decision.

## Security model

Invariants (covered by 83 Foundry tests, including fuzz tests and two invariant suites):

1. `reserved` always equals the sum of Pending payment amounts.
2. The vault's USDC balance is never below `reserved`.
3. An agent can never spend reserved funds, and `withdraw` is limited to `available()`.
4. Nothing leaves the vault without the owner's approval or an owner-configured policy.
5. `cancel()` never transfers, so a blocklisted payee cannot brick the vault.
6. `freeze` stops agents only. The owner can still approve, cancel and withdraw.

Known limitations and design choices:

- **Fixed daily window.** An agent can spend `dailyCap` just before a window closes and again just after, so worst case is `2 x dailyCap` across 24 hours. Size the cap with that in mind.
- **Owner approval bypasses caps.** The caps bind agents. The owner is trusted to review what they approve.
- **Auto-release trusts the delay.** With `autoReleaseDelay > 0`, a queued payment to any address pays out after the delay unless you cancel or freeze. The app defaults the delay to 0 (approval only).
- **Owner key is the root of trust.** There is no multisig or recovery inside the contract. Use a hardware wallet or a Safe as the owner. Ownership moves in two steps (`proposeOwner`, `acceptOwner`).
- **Deposits are plain ERC-20 transfers** to the vault address. Tokens sent by mistake are not recoverable.
- **Not professionally audited.** Slither reports two intentional low-severity timestamp findings. Get an independent audit before holding real value.

Arc specifics: only the ERC-20 interface of USDC is used (never `msg.value`), `available()` is `balanceOf - reserved` floored at zero so force-sent balance cannot break accounting, and `block.timestamp` is used for time windows only, never for ordering (payment ids order payments).

## Run it

```bash
npm install
git submodule update --init      # forge-std
npm run contracts:test           # forge test
npm run typecheck
npm test                         # unit tests (bun test)
npm run dev                      # frontend
npm run live-check               # asserts app logic against a live testnet vault
```

Read-only watch mode for any vault, no wallet needed: `/app?vault=0x...&chain=5042002`

## Deploy your own

```bash
cast wallet import deployer --interactive
forge create --rpc-url https://rpc.mainnet.arc.io --account deployer --broadcast \
  contracts/LeashFactory.sol:LeashFactory \
  --constructor-args 0x3600000000000000000000000000000000000000
```

Then put the address in `src/contracts/addresses.ts` and replace the `YOUR_DOMAIN` placeholders in `index.html`.

## License

MIT
