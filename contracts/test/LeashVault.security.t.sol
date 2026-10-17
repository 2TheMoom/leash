// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LeashVault} from "../LeashVault.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// Adversarial and property tests that go beyond the functional suite in
// LeashVault.t.sol. The threat model they encode is in docs/SECURITY.md.

// ─────────────────────────────────────────────────────────────────────────────
//  Re-entrancy: an ERC-777 style token calls a hook on the recipient. The vault
//  only ever sees the real Arc USDC (no hooks), but it must stay safe anyway.
// ─────────────────────────────────────────────────────────────────────────────
interface IHookReceiver {
    function onTokenReceived() external;
}

contract HookERC20 is ERC20 {
    constructor() ERC20("Hook USDC", "hUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to.code.length > 0) {
            try IHookReceiver(to).onTokenReceived() {} catch {}
        }
    }
}

/// Acts as owner, agent and payee at once so every guarded entry point can be
/// attempted from inside the token hook.
contract Reenterer is IHookReceiver {
    LeashVault public vault;
    bool public armed;
    bool public hookRan;
    bytes4[6] public reasons; // selector returned by each attempted re-entry

    function setVault(LeashVault v) external {
        vault = v;
    }

    function arm() external {
        armed = true;
    }

    function onTokenReceived() external override {
        if (!armed) return;
        armed = false; // one shot, otherwise the failed re-entries would recurse
        hookRan = true;

        reasons[0] = _try(abi.encodeCall(vault.pay, (address(this), 1e6, bytes32("re"))));
        reasons[1] = _try(abi.encodeCall(vault.withdraw, (address(this), 1e6)));
        reasons[2] = _try(abi.encodeCall(vault.approve, (0)));
        reasons[3] = _try(abi.encodeCall(vault.cancel, (0)));
        reasons[4] = _try(abi.encodeCall(vault.execute, (0)));
        reasons[5] = _try(abi.encodeCall(vault.pay, (address(0xBEEF), 1e6, bytes32("re2"))));
    }

    function _try(bytes memory data) internal returns (bytes4 sel) {
        (bool ok, bytes memory ret) = address(vault).call(data);
        if (ok) return bytes4(0xffffffff);
        if (ret.length < 4) return bytes4(0);
        assembly {
            sel := mload(add(ret, 32))
        }
    }

    function payViaAgent(uint128 amt) external {
        vault.pay(address(this), amt, bytes32("go"));
    }

    function withdrawViaOwner(uint128 amt) external {
        vault.withdraw(address(this), amt);
    }
}

contract LeashVault_Reentrancy is Test {
    HookERC20 internal token;
    LeashVault internal vault;
    Reenterer internal re;

    function setUp() public {
        token = new HookERC20();
        re = new Reenterer();
        vault = new LeashVault(address(re), address(token), 0);
        re.setVault(vault);
        token.mint(address(vault), 1_000e6);

        vm.startPrank(address(re));
        vault.setAgent(address(re), true, 100e6, 500e6);
        vault.setPayee(address(re), true);
        vm.stopPrank();
    }

    function _assertAllBlocked() internal view {
        assertTrue(re.hookRan(), "hook never ran, test is vacuous");
        for (uint256 i = 0; i < 6; i++) {
            assertEq(re.reasons(i), ReentrancyGuard.ReentrancyGuardReentrantCall.selector, "re-entry not blocked");
        }
    }

    function test_Reentry_DuringInstantPay() public {
        re.arm();
        re.payViaAgent(10e6);
        _assertAllBlocked();
        assertEq(token.balanceOf(address(vault)), 990e6);
    }

    function test_Reentry_DuringWithdraw() public {
        re.arm();
        re.withdrawViaOwner(10e6);
        _assertAllBlocked();
        assertEq(token.balanceOf(address(vault)), 990e6);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Targeted adversarial scenarios
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_Adversarial is Test {
    MockERC20 internal usdc;
    LeashVault internal vault;

    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal alice = makeAddr("alice"); // allowlisted
    address internal bob = makeAddr("bob"); // unknown
    address internal mallory = makeAddr("mallory");

    uint128 internal constant PER = 100e6;
    uint128 internal constant DAILY = 300e6;

    function setUp() public {
        vm.warp(1_790_000_000); // realistic timestamp: forge starts at 1, below WINDOW
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        vault = new LeashVault(owner, address(usdc), 1 hours);
        usdc.mint(address(vault), 10_000e6);
        vm.startPrank(owner);
        vault.setAgent(agent, true, PER, DAILY);
        vault.setPayee(alice, true);
        vm.stopPrank();
    }

    // ── ownership ────────────────────────────────────────────────────────────

    function test_Owner_PendingOwnerHasNoPowersBeforeAccepting() public {
        vm.prank(owner);
        vault.proposeOwner(mallory);

        vm.startPrank(mallory);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.withdraw(mallory, 1e6);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.setAgent(mallory, true, 1, 1);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.setPayee(mallory, true);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.proposeOwner(mallory);
        vm.stopPrank();
    }

    function test_Owner_OverwritingProposalKillsTheOldOne() public {
        vm.startPrank(owner);
        vault.proposeOwner(mallory); // typo or compromised address
        vault.proposeOwner(owner); // owner's way to clear a mistaken proposal
        vm.stopPrank();

        vm.prank(mallory);
        vm.expectRevert(LeashVault.NotPendingOwner.selector);
        vault.acceptOwner();
        assertEq(vault.owner(), owner);
    }

    function test_Owner_OldOwnerLosesEverythingAfterHandover() public {
        vm.prank(owner);
        vault.proposeOwner(mallory);
        vm.prank(mallory);
        vault.acceptOwner();

        vm.startPrank(owner);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.withdraw(owner, 1e6);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.freeze();
        vm.stopPrank();
        assertEq(vault.pendingOwner(), address(0));
    }

    function test_Owner_AcceptCannotBeReplayed() public {
        vm.prank(owner);
        vault.proposeOwner(mallory);
        vm.prank(mallory);
        vault.acceptOwner();
        vm.prank(mallory);
        vm.expectRevert(LeashVault.NoPendingOwner.selector);
        vault.acceptOwner();
    }

    // ── agent identity edge cases ────────────────────────────────────────────

    function test_Agent_CanBeItsOwnAllowlistedPayeeWithinCaps() public {
        vm.prank(owner);
        vault.setPayee(agent, true);
        vm.prank(agent);
        (bool executed,) = vault.pay(agent, PER, bytes32("self"));
        assertTrue(executed);
        assertEq(usdc.balanceOf(agent), PER);
        // still bound by the per-payment cap
        vm.prank(agent);
        vm.expectRevert(LeashVault.AmountExceedsCap.selector);
        vault.pay(agent, PER + 1, bytes32("self"));
    }

    function test_Agent_OwnerActingAsAgentGainsNoExtraPower() public {
        vm.prank(owner);
        vault.setAgent(owner, true, 1e6, 2e6);
        vm.startPrank(owner);
        vm.expectRevert(LeashVault.AmountExceedsCap.selector);
        vault.pay(bob, 2e6, bytes32("x")); // owner-as-agent is still capped as an agent
        vm.stopPrank();
    }

    function test_Agent_NonAgentCannotPayEvenToAllowlisted() public {
        vm.prank(mallory);
        vm.expectRevert(LeashVault.AgentNotActive.selector);
        vault.pay(alice, 1e6, bytes32("x"));
    }

    function test_Agent_UnknownAddressCannotCancelOrExecuteForOthers() public {
        vm.prank(agent);
        (, uint256 id) = vault.pay(bob, 10e6, bytes32("q"));
        vm.prank(mallory);
        vm.expectRevert(LeashVault.NotOwnerOrAgent.selector);
        vault.cancel(id);
        vm.prank(mallory);
        vm.expectRevert(LeashVault.TooEarly.selector);
        vault.execute(id);
    }

    // ── agent lifecycle ──────────────────────────────────────────────────────

    function test_Lifecycle_DeactivatedAgentCanStillCancelItsOwnPending() public {
        vm.prank(agent);
        (, uint256 id) = vault.pay(bob, 10e6, bytes32("q"));
        vm.prank(owner);
        vault.setAgent(agent, false, PER, DAILY);

        vm.prank(agent);
        vault.cancel(id);
        assertEq(vault.reserved(), 0);
        assertEq(vault.getAgent(agent).pendingCount, 0);
    }

    function test_Lifecycle_DeactivationBlocksAutoReleaseButNotOwnerApproval() public {
        vm.prank(agent);
        (, uint256 id) = vault.pay(bob, 10e6, bytes32("q"));
        vm.prank(owner);
        vault.setAgent(agent, false, PER, DAILY);

        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(LeashVault.AgentNotActive.selector);
        vault.execute(id);

        vm.prank(owner);
        vault.approve(id);
        assertEq(usdc.balanceOf(bob), 10e6);
    }

    function test_Lifecycle_LoweredCapAfterQueueBlocksAutoReleaseNotApproval() public {
        vm.prank(agent);
        (, uint256 id) = vault.pay(bob, 80e6, bytes32("q"));
        vm.prank(owner);
        vault.setAgent(agent, true, 10e6, DAILY);

        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(LeashVault.AmountExceedsCap.selector);
        vault.execute(id);

        vm.prank(owner);
        vault.approve(id);
        assertEq(usdc.balanceOf(bob), 80e6);
    }

    function test_Lifecycle_LoweringDailyCapBelowSpendBlocksUntilWindowEnds() public {
        vm.prank(agent);
        vault.pay(alice, 100e6, bytes32("a"));
        vm.prank(agent);
        vault.pay(alice, 100e6, bytes32("b"));
        vm.prank(owner);
        vault.setAgent(agent, true, 50e6, 100e6); // spent 200 > new cap 100

        vm.prank(agent);
        vm.expectRevert(LeashVault.DailyCapExceeded.selector);
        vault.pay(alice, 1e6, bytes32("c"));

        vm.warp(block.timestamp + 1 days);
        vm.prank(agent);
        vault.pay(alice, 50e6, bytes32("d"));
    }

    // ── replay and double settlement ─────────────────────────────────────────

    function test_Replay_ApproveThenApproveOrCancelOrExecuteReverts() public {
        vm.prank(agent);
        (, uint256 id) = vault.pay(bob, 10e6, bytes32("q"));
        vm.startPrank(owner);
        vault.approve(id);
        vm.expectRevert(LeashVault.PaymentNotPending.selector);
        vault.approve(id);
        vm.expectRevert(LeashVault.PaymentNotPending.selector);
        vault.cancel(id);
        vm.stopPrank();
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(LeashVault.PaymentNotPending.selector);
        vault.execute(id);
        assertEq(usdc.balanceOf(bob), 10e6);
    }

    function test_Replay_InstantPaymentRecordCannotBeSettledAgain() public {
        vm.prank(agent);
        (bool executed, uint256 id) = vault.pay(alice, 10e6, bytes32("i"));
        assertTrue(executed);
        vm.prank(owner);
        vm.expectRevert(LeashVault.PaymentNotPending.selector);
        vault.approve(id);
    }

    function test_Replay_NonexistentIdsRevert() public {
        vm.startPrank(owner);
        vm.expectRevert(LeashVault.PaymentNotPending.selector);
        vault.approve(12345);
        vm.expectRevert(LeashVault.PaymentNotPending.selector);
        vault.cancel(12345);
        vm.stopPrank();
    }

    // ── daily window precision ───────────────────────────────────────────────

    function test_Window_BoundaryIsExact() public {
        vm.prank(agent);
        vault.pay(alice, 100e6, bytes32("1"));
        vm.prank(agent);
        vault.pay(alice, 100e6, bytes32("2"));
        vm.prank(agent);
        vault.pay(alice, 100e6, bytes32("3")); // 300 = cap, window opened at T

        uint256 t0 = block.timestamp;
        vm.warp(t0 + 1 days - 1);
        vm.prank(agent);
        vm.expectRevert(LeashVault.DailyCapExceeded.selector);
        vault.pay(alice, 1e6, bytes32("late"));

        vm.warp(t0 + 1 days);
        vm.prank(agent);
        vault.pay(alice, 100e6, bytes32("new-window"));
    }

    // ── numeric extremes ─────────────────────────────────────────────────────

    function test_Extremes_MaxCapsAndHugePaymentRevertCleanly() public {
        vm.prank(owner);
        vault.setAgent(agent, true, type(uint128).max, type(uint128).max);

        vm.prank(agent);
        vm.expectRevert(LeashVault.InsufficientAvailable.selector);
        vault.pay(alice, type(uint128).max, bytes32("max"));

        vm.prank(agent);
        vm.expectRevert(LeashVault.InsufficientAvailable.selector);
        vault.pay(bob, type(uint128).max, bytes32("max"));
        assertEq(vault.reserved(), 0);
    }

    function test_Extremes_ExactBalanceCanBePaidAndNothingMore() public {
        vm.prank(owner);
        vault.setAgent(agent, true, 10_000e6, 10_000e6);
        vm.prank(agent);
        vault.pay(alice, 10_000e6, bytes32("all"));
        assertEq(usdc.balanceOf(address(vault)), 0);
        vm.prank(agent);
        vm.expectRevert(LeashVault.InsufficientAvailable.selector);
        vault.pay(alice, 1, bytes32("dust"));
    }

    // ── accounting under hostile funding ─────────────────────────────────────

    function test_Funding_ForceAddedBalanceOnlyIncreasesAvailable() public {
        vm.prank(agent);
        vault.pay(bob, 40e6, bytes32("q"));
        uint256 reservedBefore = vault.reserved();
        usdc.mint(address(vault), 5e6); // anyone can top up
        assertEq(vault.reserved(), reservedBefore);
        assertEq(vault.available(), 10_000e6 + 5e6 - 40e6);
    }

    function test_Funding_BalanceBelowReservedFloorsAvailableAtZero() public {
        // Cannot happen through the vault's own paths. Simulate an external
        // balance reduction (e.g. a token admin burn) and check no underflow.
        vm.prank(agent);
        vault.pay(bob, 40e6, bytes32("q"));
        usdc.burn(address(vault), usdc.balanceOf(address(vault)));
        assertEq(vault.available(), 0);
        vm.prank(owner);
        vm.expectRevert(LeashVault.InsufficientAvailable.selector);
        vault.withdraw(owner, 1);
        // owner can still cancel to restore a consistent view
        vm.prank(owner);
        vault.cancel(0);
        assertEq(vault.reserved(), 0);
    }

    // ── the token itself as a payee (documented behaviour) ───────────────────

    function test_Payee_TokenContractIsAcceptedByTheVaultSoOwnersMustReview() public {
        vm.prank(agent);
        (bool executed, uint256 id) = vault.pay(address(usdc), 1e6, bytes32("burn"));
        assertFalse(executed); // not allowlisted, so it waits for the owner
        vm.prank(owner);
        vault.cancel(id);
    }

    // ── fuzz: pendingCount always equals the number of Pending payments ──────

    function testFuzz_PendingCountMatchesPendingPayments(uint8[12] memory ops) public {
        uint256 pendingTracked;
        for (uint256 i = 0; i < ops.length; i++) {
            uint8 op = ops[i] % 3;
            if (op == 0) {
                vm.prank(agent);
                (bool executed,) = vault.pay(bob, 1e6, bytes32(i));
                if (!executed) pendingTracked++;
            } else if (op == 1 && vault.nextPaymentId() > 0) {
                uint256 id = uint256(ops[i]) % vault.nextPaymentId();
                if (vault.getPayment(id).status == LeashVault.PaymentStatus.Pending) {
                    vm.prank(owner);
                    vault.cancel(id);
                    pendingTracked--;
                }
            } else if (op == 2 && vault.nextPaymentId() > 0) {
                uint256 id = uint256(ops[i]) % vault.nextPaymentId();
                if (vault.getPayment(id).status == LeashVault.PaymentStatus.Pending) {
                    vm.prank(owner);
                    vault.approve(id);
                    pendingTracked--;
                }
            }
            assertEq(vault.getAgent(agent).pendingCount, pendingTracked);
            assertEq(vault.reserved(), pendingTracked * 1e6);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Stateful property: a compromised agent against a PASSIVE owner.
//  Run once with approval-only mode and once with auto-release enabled.
// ─────────────────────────────────────────────────────────────────────────────
contract CompromisedAgentHandler is Test {
    LeashVault public vault;
    MockERC20 public usdc;
    address public agent;
    address[] public allowlisted;
    address[] public strangers;
    uint256[] public queuedIds;

    uint256 public instantPays;
    uint256 public queuedPays;
    uint256 public executes;
    uint256 public cancels;

    constructor(LeashVault v, MockERC20 u, address agent_, address[] memory allow, address[] memory strange) {
        vault = v;
        usdc = u;
        agent = agent_;
        allowlisted = allow;
        strangers = strange;
    }

    function payAllowlisted(uint256 who, uint128 amt) external {
        amt = uint128(bound(amt, 1, 120e6));
        vm.prank(agent);
        try vault.pay(allowlisted[who % allowlisted.length], amt, bytes32("a")) returns (bool executed, uint256 id) {
            if (executed) instantPays++;
            else {
                queuedPays++;
                queuedIds.push(id);
            }
        } catch {}
    }

    function payStranger(uint256 who, uint128 amt) external {
        amt = uint128(bound(amt, 1, 120e6));
        vm.prank(agent);
        try vault.pay(strangers[who % strangers.length], amt, bytes32("s")) returns (bool executed, uint256 id) {
            if (executed) instantPays++;
            else {
                queuedPays++;
                queuedIds.push(id);
            }
        } catch {}
    }

    function executeSome(uint256 which) external {
        if (queuedIds.length == 0) return;
        uint256 id = queuedIds[which % queuedIds.length];
        // anyone may call execute; use a third party to show it needs no authority
        vm.prank(address(0xE1E1));
        try vault.execute(id) {
            executes++;
        } catch {}
    }

    function cancelOwn(uint256 which) external {
        if (queuedIds.length == 0) return;
        uint256 id = queuedIds[which % queuedIds.length];
        vm.prank(agent);
        try vault.cancel(id) {
            cancels++;
        } catch {}
    }

    /// Mostly short hops so many actions land inside one 24h window (this is what
    /// makes the loss bound bite); an occasional multi-day jump covers rollover.
    function warp(uint256 secs) external {
        if (secs % 25 == 0) vm.warp(block.timestamp + bound(secs, 1 days, 3 days));
        else vm.warp(block.timestamp + bound(secs, 1 minutes, 30 minutes));
    }

    function strangersTotal() external view returns (uint256 total) {
        for (uint256 i = 0; i < strangers.length; i++) {
            total += usdc.balanceOf(strangers[i]);
        }
    }

    function allowlistedTotal() external view returns (uint256 total) {
        for (uint256 i = 0; i < allowlisted.length; i++) {
            total += usdc.balanceOf(allowlisted[i]);
        }
    }

    function interactions() external view returns (uint256) {
        return instantPays + queuedPays + executes + cancels;
    }
}

abstract contract CompromisedAgentBase is Test {
    MockERC20 internal usdc;
    LeashVault internal vault;
    CompromisedAgentHandler internal handler;

    address internal owner = makeAddr("passiveOwner");
    address internal agent = makeAddr("compromisedAgent");

    uint128 internal constant PER = 100e6;
    uint128 internal constant DAILY = 250e6;
    uint256 internal constant FUND = 100_000e6;

    uint256 internal startTime;

    function _delay() internal view virtual returns (uint32);

    function setUp() public {
        vm.warp(1_790_000_000);
        startTime = block.timestamp;
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        vault = new LeashVault(owner, address(usdc), _delay());
        usdc.mint(address(vault), FUND);

        address[] memory allow = new address[](2);
        allow[0] = makeAddr("vendorA");
        allow[1] = makeAddr("vendorB");
        address[] memory strange = new address[](3);
        strange[0] = makeAddr("strangerX");
        strange[1] = makeAddr("strangerY");
        strange[2] = makeAddr("strangerZ");

        vm.startPrank(owner);
        vault.setAgent(agent, true, PER, DAILY);
        vault.setPayee(allow[0], true);
        vault.setPayee(allow[1], true);
        vm.stopPrank();

        handler = new CompromisedAgentHandler(vault, usdc, agent, allow, strange);
        targetContract(address(handler));
    }

    /// Fixed windows never overlap and each lasts at least WINDOW, so the number
    /// of windows touched in `elapsed` seconds is at most floor(elapsed/WINDOW)+1.
    function _lossBound() internal view returns (uint256) {
        uint256 elapsed = block.timestamp - startTime;
        return uint256(DAILY) * (elapsed / 1 days + 1);
    }

    function invariant_agentOutflowIsBoundedByDailyCapPerWindow() public view {
        uint256 outflow = FUND - usdc.balanceOf(address(vault));
        assertLe(outflow, _lossBound(), "agent drained more than dailyCap per window");
    }

    function invariant_reservedAlwaysCoveredByBalance() public view {
        assertLe(vault.reserved(), usdc.balanceOf(address(vault)));
    }

    function invariant_noAgentPrivilegeEscalation() public view {
        assertEq(vault.owner(), owner);
        assertEq(vault.pendingOwner(), address(0));
        assertTrue(vault.allowedPayees(handler.allowlisted(0)));
        assertFalse(vault.allowedPayees(handler.strangers(0)));
    }

    /// Guard against a vacuous pass: every run must actually exercise the vault.
    function afterInvariant() public view {
        assertGt(handler.interactions(), 0, "run made no successful agent calls");
    }
}

/// Approval-only vault (the default the UI creates): strangers can NEVER be paid
/// unless the owner approves, and the owner here never does.
contract LeashVault_CompromisedAgent_ApprovalOnly is CompromisedAgentBase {
    function _delay() internal pure override returns (uint32) {
        return 0;
    }

    function invariant_strangersReceiveNothing() public view {
        assertEq(handler.strangersTotal(), 0, "an un-approved payment reached a stranger");
    }
}

/// Auto-release vault: strangers CAN be paid after the delay (documented risk),
/// but never more than the agent's daily cap per window.
contract LeashVault_CompromisedAgent_AutoRelease is CompromisedAgentBase {
    function _delay() internal pure override returns (uint32) {
        return 1 hours;
    }
}
