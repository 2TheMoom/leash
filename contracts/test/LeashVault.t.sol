// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LeashVault} from "../LeashVault.sol";
import {LeashFactory} from "../LeashFactory.sol";
import {MockERC20, BlocklistMockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
//  Shared base - deploy fresh vault + mint USDC before every test
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVaultBase is Test {
    MockERC20 internal usdc;
    LeashVault internal vault;

    address internal owner  = makeAddr("owner");
    address internal agent  = makeAddr("agent");
    address internal alice  = makeAddr("alice");   // allowlisted payee
    address internal bob    = makeAddr("bob");     // unknown payee
    address internal carol  = makeAddr("carol");   // third party
    address internal dan    = makeAddr("dan");     // second agent

    // caps
    uint128 internal constant PER_CAP   = 100e6;  // 100 USDC
    uint128 internal constant DAILY_CAP = 500e6;  // 500 USDC
    uint32  internal constant DELAY     = 1 days;

    // funding
    uint256 internal constant VAULT_FUND = 10_000e6;

    function setUp() public virtual {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        vm.prank(owner);
        vault = new LeashVault(owner, address(usdc), DELAY);

        // fund the vault
        usdc.mint(address(vault), VAULT_FUND);

        // configure agent
        vm.prank(owner);
        vault.setAgent(agent, true, PER_CAP, DAILY_CAP);

        // allowlist alice
        vm.prank(owner);
        vault.setPayee(alice, true);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /// Queue a payment from `agent` to `bob` and return the payment id.
    function _queueBob(uint128 amount) internal returns (uint256 id) {
        vm.prank(agent);
        (, id) = vault.pay(bob, amount, bytes32("ref"));
    }

    /// Queue `n` payments of `amount` each from `agent` to `bob`.
    function _queueN(uint128 amount, uint256 n) internal {
        for (uint256 i = 0; i < n; i++) {
            vm.prank(agent);
            vault.pay(bob, amount, bytes32("ref"));
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. Deployment & initialization
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_Deployment is LeashVaultBase {

    function test_ConstructorSetsOwner() public view {
        assertEq(vault.owner(), owner);
    }

    function test_ConstructorSetsUsdc() public view {
        assertEq(address(vault.usdc()), address(usdc));
    }

    function test_ConstructorSetsAutoReleaseDelay() public view {
        assertEq(vault.autoReleaseDelay(), DELAY);
    }

    function test_ConstructorZeroOwnerReverts() public {
        vm.expectRevert(LeashVault.ZeroAddress.selector);
        new LeashVault(address(0), address(usdc), DELAY);
    }

    function test_ConstructorZeroUsdcReverts() public {
        vm.expectRevert(LeashVault.ZeroAddress.selector);
        new LeashVault(owner, address(0), DELAY);
    }

    function test_InitialStateZero() public view {
        assertEq(vault.reserved(), 0);
        assertEq(vault.nextPaymentId(), 0);
        assertFalse(vault.frozen());
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. setAgent
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_SetAgent is LeashVaultBase {

    function test_SetAgent_HappyPath() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(vault));
        emit LeashVault.AgentSet(agent, true, PER_CAP, DAILY_CAP);
        vault.setAgent(agent, true, PER_CAP, DAILY_CAP);

        LeashVault.AgentConfig memory cfg = vault.getAgent(agent);
        assertTrue(cfg.active);
        assertEq(cfg.perPaymentCap, PER_CAP);
        assertEq(cfg.dailyCap, DAILY_CAP);
    }

    // test 25
    function test_SetAgent_ZeroAddressReverts() public {
        vm.prank(owner);
        vm.expectRevert(LeashVault.ZeroAddress.selector);
        vault.setAgent(address(0), true, PER_CAP, DAILY_CAP);
    }

    // test 26
    function test_SetAgent_PerCapGtDailyCapReverts() public {
        vm.prank(owner);
        vm.expectRevert(LeashVault.AgentPerCapTooHigh.selector);
        vault.setAgent(agent, true, DAILY_CAP + 1, DAILY_CAP);
    }

    // test 29
    function test_SetAgent_NonOwnerReverts() public {
        vm.prank(carol);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.setAgent(agent, true, PER_CAP, DAILY_CAP);
    }

    function test_SetAgent_Deactivate() public {
        vm.prank(owner);
        vault.setAgent(agent, false, PER_CAP, DAILY_CAP);
        assertFalse(vault.getAgent(agent).active);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. setPayee
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_SetPayee is LeashVaultBase {

    function test_SetPayee_HappyPath() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(vault));
        emit LeashVault.PayeeSet(bob, true);
        vault.setPayee(bob, true);
        assertTrue(vault.allowedPayees(bob));
    }

    function test_SetPayee_ZeroAddressReverts() public {
        vm.prank(owner);
        vm.expectRevert(LeashVault.ZeroAddress.selector);
        vault.setPayee(address(0), true);
    }

    // test 29
    function test_SetPayee_NonOwnerReverts() public {
        vm.prank(carol);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.setPayee(bob, true);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  4. pay() - allowlisted payee (instant)
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_PayAllowlisted is LeashVaultBase {

    // test 1
    function test_Pay_AllowlistedInstant() public {
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 vaultBefore = usdc.balanceOf(address(vault));

        vm.prank(agent);
        vm.expectEmit(true, true, true, true, address(vault));
        emit LeashVault.PaymentExecuted(0, agent, alice, 50e6);
        (bool executed, uint256 id) = vault.pay(alice, 50e6, bytes32("r1"));

        assertTrue(executed);
        assertEq(id, 0);
        assertEq(usdc.balanceOf(alice), aliceBefore + 50e6);
        assertEq(usdc.balanceOf(address(vault)), vaultBefore - 50e6);
        // reserved stays 0
        assertEq(vault.reserved(), 0);
    }

    // test 2
    function test_Pay_OverPerPaymentCapReverts() public {
        vm.prank(agent);
        vm.expectRevert(LeashVault.AmountExceedsCap.selector);
        vault.pay(alice, PER_CAP + 1, bytes32("r"));
    }

    // test 3 - daily cap: exact succeeds, one more reverts
    function test_Pay_DailyCapExactSucceeds() public {
        // Fill daily cap in PER_CAP chunks (5 x 100 = 500)
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent);
            vault.pay(alice, PER_CAP, bytes32("r"));
        }
        // Exactly at cap - no revert (already spent above)
        assertEq(vault.getAgent(agent).spentInWindow, DAILY_CAP);
    }

    function test_Pay_OverDailyCapReverts() public {
        // Fill daily cap
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent);
            vault.pay(alice, PER_CAP, bytes32("r"));
        }
        // One more unit
        vm.prank(agent);
        vm.expectRevert(LeashVault.DailyCapExceeded.selector);
        vault.pay(alice, 1, bytes32("r"));
    }

    // test 4 - window reset
    function test_Pay_WindowResetAfter1Day() public {
        // Fill daily cap
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent);
            vault.pay(alice, PER_CAP, bytes32("r"));
        }
        // Advance > 1 day
        vm.warp(block.timestamp + 1 days + 1);

        // Should succeed and reset spentInWindow
        vm.prank(agent);
        vault.pay(alice, PER_CAP, bytes32("r"));
        assertEq(vault.getAgent(agent).spentInWindow, PER_CAP);
    }

    // test 21
    function test_Pay_ZeroPayeeReverts() public {
        vm.prank(agent);
        vm.expectRevert(LeashVault.ZeroAddress.selector);
        vault.pay(address(0), 10e6, bytes32("r"));
    }

    // test 22
    function test_Pay_SelfPayeeReverts() public {
        vm.prank(agent);
        vm.expectRevert(LeashVault.SelfPayee.selector);
        vault.pay(address(vault), 10e6, bytes32("r"));
    }

    // test 23 - non-payable: pay() with ETH value
    function test_Pay_NativeValueReverts() public {
        // fund agent with ETH
        vm.deal(agent, 1 ether);
        vm.prank(agent);
        (bool ok,) = address(vault).call{value: 1}(
            abi.encodeWithSelector(vault.pay.selector, alice, 10e6, bytes32("r"))
        );
        assertFalse(ok, "Expected revert when sending ETH to non-payable pay()");
    }

    // test 28 - inactive agent
    function test_Pay_InactiveAgentReverts() public {
        vm.prank(owner);
        vault.setAgent(agent, false, PER_CAP, DAILY_CAP);

        vm.prank(agent);
        vm.expectRevert(LeashVault.AgentNotActive.selector);
        vault.pay(alice, 10e6, bytes32("r"));
    }

    // test 9 - frozen blocks pay
    function test_Pay_FrozenReverts() public {
        vm.prank(owner);
        vault.freeze();

        vm.prank(agent);
        vm.expectRevert(LeashVault.Frozen.selector);
        vault.pay(alice, 10e6, bytes32("r"));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. pay() - unknown payee (queue)
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_PayQueue is LeashVaultBase {

    // test 5
    function test_Pay_UnknownPayeeQueued() public {
        uint256 reservedBefore = vault.reserved();

        vm.prank(agent);
        vm.expectEmit(true, true, true, true, address(vault));
        emit LeashVault.PaymentQueued(0, agent, bob, 50e6, bytes32("ref1"));
        (bool executed, uint256 id) = vault.pay(bob, 50e6, bytes32("ref1"));

        assertFalse(executed);
        assertEq(id, 0);
        assertEq(vault.reserved(), reservedBefore + 50e6);
        assertEq(vault.getAgent(agent).pendingCount, 1);

        LeashVault.Payment memory p = vault.getPayment(id);
        assertEq(p.agent, agent);
        assertEq(p.payee, bob);
        assertEq(p.amount, 50e6);
        assertEq(uint8(p.status), uint8(LeashVault.PaymentStatus.Pending));
    }

    // test 18 - pending cap of 20
    function test_Pay_PendingCapReached() public {
        // Queue 20 payments (1 USDC each to be well within daily cap)
        _queueN(1e6, 20);
        assertEq(vault.getAgent(agent).pendingCount, 20);

        // 21st must revert
        vm.prank(agent);
        vm.expectRevert(LeashVault.PendingCapReached.selector);
        vault.pay(bob, 1e6, bytes32("ref"));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  6. cancel()
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_Cancel is LeashVaultBase {

    // test 6 - owner cancels
    function test_Cancel_OwnerUnreserves() public {
        uint256 id = _queueBob(50e6);
        uint256 reservedBefore = vault.reserved();

        vm.prank(owner);
        vm.expectEmit(true, true, true, true, address(vault));
        emit LeashVault.PaymentCancelled(id, agent, bob, 50e6);
        vault.cancel(id);

        assertEq(vault.reserved(), reservedBefore - 50e6);
        assertEq(vault.getAgent(agent).pendingCount, 0);
        // No USDC transferred to bob
        assertEq(usdc.balanceOf(bob), 0);

        LeashVault.Payment memory p = vault.getPayment(id);
        assertEq(uint8(p.status), uint8(LeashVault.PaymentStatus.Cancelled));
    }

    // test 17 - agent cancels its own
    function test_Cancel_AgentCancelOwnPayment() public {
        uint256 id = _queueBob(50e6);

        vm.prank(agent);
        vault.cancel(id);

        assertEq(uint8(vault.getPayment(id).status), uint8(LeashVault.PaymentStatus.Cancelled));
    }

    // test 16 - agent cannot cancel another agent's payment
    function test_Cancel_AnotherAgentReverts() public {
        // set up dan as an agent
        vm.prank(owner);
        vault.setAgent(dan, true, PER_CAP, DAILY_CAP);

        uint256 id = _queueBob(50e6); // queued by `agent`

        vm.prank(dan);
        vm.expectRevert(LeashVault.NotOwnerOrAgent.selector);
        vault.cancel(id);
    }

    // test 13 - cancelled payment cannot be executed
    function test_Cancel_CannotExecuteAfterCancel() public {
        uint256 id = _queueBob(50e6);
        vm.prank(owner);
        vault.cancel(id);

        vm.warp(block.timestamp + DELAY + 1);

        vm.expectRevert(LeashVault.PaymentNotPending.selector);
        vault.execute(id);
    }

    // third party cannot cancel
    function test_Cancel_ThirdPartyReverts() public {
        uint256 id = _queueBob(50e6);

        vm.prank(carol);
        vm.expectRevert(LeashVault.NotOwnerOrAgent.selector);
        vault.cancel(id);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  7. approve()
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_Approve is LeashVaultBase {

    // test 7
    function test_Approve_OwnerPaysOut() public {
        uint256 id = _queueBob(50e6);
        uint256 reservedBefore = vault.reserved();

        vm.prank(owner);
        vm.expectEmit(true, true, true, true, address(vault));
        emit LeashVault.PaymentExecuted(id, agent, bob, 50e6);
        vault.approve(id);

        assertEq(usdc.balanceOf(bob), 50e6);
        assertEq(vault.reserved(), reservedBefore - 50e6);
        assertEq(vault.getAgent(agent).pendingCount, 0);
        assertEq(uint8(vault.getPayment(id).status), uint8(LeashVault.PaymentStatus.Executed));
    }

    // test 8 - approve works while frozen
    function test_Approve_WorksWhileFrozen() public {
        uint256 id = _queueBob(50e6);

        vm.prank(owner);
        vault.freeze();

        // approve should NOT revert even though frozen
        vm.prank(owner);
        vault.approve(id);
        assertEq(usdc.balanceOf(bob), 50e6);
    }

    // approve does NOT consume daily allowance
    function test_Approve_DoesNotConsumeDailyAllowance() public {
        uint256 id = _queueBob(50e6);
        vm.prank(owner);
        vault.approve(id);
        // spentInWindow should remain 0 (approve path, consumeAllowance=false)
        assertEq(vault.getAgent(agent).spentInWindow, 0);
    }

    // test 29
    function test_Approve_NonOwnerReverts() public {
        uint256 id = _queueBob(50e6);
        vm.prank(carol);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.approve(id);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  8. execute()
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_Execute is LeashVaultBase {

    // test 11 - too early
    function test_Execute_TooEarlyReverts() public {
        uint256 id = _queueBob(50e6);

        vm.expectRevert(LeashVault.TooEarly.selector);
        vault.execute(id);
    }

    // test 12 - anyone can execute after delay
    function test_Execute_AnyoneAfterDelay() public {
        uint256 id = _queueBob(50e6);
        vm.warp(block.timestamp + DELAY + 1);

        vm.prank(carol); // unrelated caller
        vm.expectEmit(true, true, true, true, address(vault));
        emit LeashVault.PaymentExecuted(id, agent, bob, 50e6);
        vault.execute(id);

        assertEq(usdc.balanceOf(bob), 50e6);
    }

    // test 10 - frozen blocks execute
    function test_Execute_FrozenReverts() public {
        uint256 id = _queueBob(50e6);
        vm.warp(block.timestamp + DELAY + 1);

        vm.prank(owner);
        vault.freeze();

        vm.expectRevert(LeashVault.Frozen.selector);
        vault.execute(id);
    }

    // test 14 - daily cap applies on execute path.
    //
    // Strategy: use a vault with a very short autoReleaseDelay (60 s) so we can
    // advance time past the release delay WITHOUT crossing the 1-day window boundary.
    // Fill the daily cap via instant pays, queue a payment, advance 61 s (< 1 day),
    // then execute() - it should revert DailyCapExceeded because the window hasn't reset.
    function test_Execute_DailyCapApplied() public {
        // Deploy a scratch vault with a 60-second release delay so we can pass
        // the delay without rolling the daily window.
        MockERC20 u2 = new MockERC20("USDC2", "U2", 6);
        LeashVault v2 = new LeashVault(owner, address(u2), 60 /* 60 s delay */);
        u2.mint(address(v2), VAULT_FUND);

        vm.prank(owner);
        v2.setAgent(agent, true, PER_CAP, DAILY_CAP);
        vm.prank(owner);
        v2.setPayee(alice, true);

        // Fill daily cap (5 × 100 USDC = 500 USDC)
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent);
            v2.pay(alice, PER_CAP, bytes32("r"));
        }

        // Queue a payment to bob
        vm.prank(agent);
        (, uint256 id) = v2.pay(bob, 1e6, bytes32("ref"));

        // Advance 61 seconds - past the 60 s release delay, but well within the 1-day window
        vm.warp(block.timestamp + 61);

        // execute() consumes daily allowance - should revert because cap exhausted
        vm.expectRevert(LeashVault.DailyCapExceeded.selector);
        v2.execute(id);
    }

    // test 15 - deactivated agent blocks execute
    function test_Execute_DeactivatedAgentReverts() public {
        uint256 id = _queueBob(50e6);
        vm.warp(block.timestamp + DELAY + 1);

        vm.prank(owner);
        vault.setAgent(agent, false, PER_CAP, DAILY_CAP);

        vm.expectRevert(LeashVault.AgentNotActive.selector);
        vault.execute(id);
    }

    // test 27 - autoReleaseDelay=0 disables execute
    function test_Execute_AutoReleaseDisabledReverts() public {
        vm.prank(owner);
        vault.setAutoReleaseDelay(0);

        uint256 id = _queueBob(50e6);
        vm.warp(block.timestamp + 365 days);

        vm.expectRevert(LeashVault.AutoReleaseNotEnabled.selector);
        vault.execute(id);
    }

    // execute consumed daily allowance - spentInWindow increases
    function test_Execute_ConsumesDailyAllowance() public {
        uint256 id = _queueBob(50e6);
        vm.warp(block.timestamp + DELAY + 1);
        vault.execute(id);
        assertEq(vault.getAgent(agent).spentInWindow, 50e6);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  9. freeze / unfreeze
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_Freeze is LeashVaultBase {

    function test_Freeze_SetsFlag() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, false, address(vault));
        emit LeashVault.VaultFrozen();
        vault.freeze();
        assertTrue(vault.frozen());
    }

    function test_Freeze_AlreadyFrozenReverts() public {
        vm.prank(owner);
        vault.freeze();
        vm.prank(owner);
        vm.expectRevert(LeashVault.AlreadyFrozen.selector);
        vault.freeze();
    }

    function test_Unfreeze_ClearsFlag() public {
        vm.prank(owner);
        vault.freeze();
        vm.prank(owner);
        vm.expectEmit(false, false, false, false, address(vault));
        emit LeashVault.VaultUnfrozen();
        vault.unfreeze();
        assertFalse(vault.frozen());
    }

    function test_Unfreeze_NotFrozenReverts() public {
        vm.prank(owner);
        vm.expectRevert(LeashVault.NotFrozen.selector);
        vault.unfreeze();
    }

    // test 29
    function test_Freeze_NonOwnerReverts() public {
        vm.prank(carol);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.freeze();
    }

    // test 29
    function test_Unfreeze_NonOwnerReverts() public {
        vm.prank(owner);
        vault.freeze();
        vm.prank(carol);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.unfreeze();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. withdraw()
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_Withdraw is LeashVaultBase {

    function test_Withdraw_HappyPath() public {
        uint256 ownerBefore = usdc.balanceOf(owner);
        uint256 available   = vault.available();

        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(vault));
        emit LeashVault.Withdrawn(owner, uint128(available));
        vault.withdraw(owner, uint128(available));

        assertEq(usdc.balanceOf(owner), ownerBefore + available);
        assertEq(vault.available(), 0);
    }

    // test 19 - cannot touch reserved
    function test_Withdraw_CannotTouchReserved() public {
        uint256 id = _queueBob(50e6);
        uint256 avail = vault.available();

        // Withdraw everything available - fine
        vm.prank(owner);
        vault.withdraw(owner, uint128(avail));

        // Drain committed balance even though reserved is set
        // One wei over reserved should revert
        // At this point available() == 0 (vault balance == reserved == 50e6)
        vm.prank(owner);
        vm.expectRevert(LeashVault.InsufficientAvailable.selector);
        vault.withdraw(owner, 1);

        // cancel to free reserved
        vm.prank(owner);
        vault.cancel(id);
        // now available == 50e6
        assertEq(vault.available(), 50e6);
    }

    function test_Withdraw_ZeroToReverts() public {
        vm.prank(owner);
        vm.expectRevert(LeashVault.ZeroAddress.selector);
        vault.withdraw(address(0), 100e6);
    }

    function test_Withdraw_ZeroAmountReverts() public {
        vm.prank(owner);
        vm.expectRevert(LeashVault.ZeroAmount.selector);
        vault.withdraw(owner, 0);
    }

    // test 29
    function test_Withdraw_NonOwnerReverts() public {
        vm.prank(carol);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.withdraw(carol, 100e6);
    }

    // test 8 variant - withdraw works while frozen
    function test_Withdraw_WorksWhileFrozen() public {
        vm.prank(owner);
        vault.freeze();
        vm.prank(owner);
        vault.withdraw(owner, 100e6);
        // No revert expected
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  11. Two-step ownership
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_Ownership is LeashVaultBase {

    // test 20
    function test_ProposeAndAcceptOwner() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(vault));
        emit LeashVault.OwnerProposed(carol);
        vault.proposeOwner(carol);

        assertEq(vault.pendingOwner(), carol);

        vm.prank(carol);
        vm.expectEmit(true, false, false, false, address(vault));
        emit LeashVault.OwnerAccepted(carol);
        vault.acceptOwner();

        assertEq(vault.owner(), carol);
        assertEq(vault.pendingOwner(), address(0));
    }

    function test_ProposeOwner_ZeroAddressReverts() public {
        vm.prank(owner);
        vm.expectRevert(LeashVault.ZeroAddress.selector);
        vault.proposeOwner(address(0));
    }

    function test_AcceptOwner_WrongCallerReverts() public {
        vm.prank(owner);
        vault.proposeOwner(carol);

        vm.prank(alice);
        vm.expectRevert(LeashVault.NotPendingOwner.selector);
        vault.acceptOwner();
    }

    function test_AcceptOwner_NoPendingOwnerReverts() public {
        vm.expectRevert(LeashVault.NoPendingOwner.selector);
        vault.acceptOwner();
    }

    // test 29
    function test_ProposeOwner_NonOwnerReverts() public {
        vm.prank(carol);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.proposeOwner(alice);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  12. setAutoReleaseDelay
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_AutoReleaseDelay is LeashVaultBase {

    function test_SetAutoReleaseDelay_HappyPath() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(vault));
        emit LeashVault.AutoReleaseDelaySet(2 days);
        vault.setAutoReleaseDelay(2 days);
        assertEq(vault.autoReleaseDelay(), 2 days);
    }

    function test_SetAutoReleaseDelay_NonOwnerReverts() public {
        vm.prank(carol);
        vm.expectRevert(LeashVault.NotOwner.selector);
        vault.setAutoReleaseDelay(2 days);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  13. BlocklistUSDC - test 24
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_BlocklistUSDC is Test {
    BlocklistMockERC20 internal blusdc;
    LeashVault internal vault;

    address internal owner  = makeAddr("blOwner");
    address internal agent_ = makeAddr("blAgent");
    address internal alice_ = makeAddr("blAlice");   // allowlisted, NOT blocklisted
    address internal blocked = makeAddr("blocked");   // blocklisted payee

    uint128 internal constant PER_CAP   = 200e6;
    uint128 internal constant DAILY_CAP = 1000e6;
    uint32  internal constant DELAY     = 1 days;

    function setUp() public {
        blusdc = new BlocklistMockERC20("Blocklist USDC", "blUSDC", 6, blocked);
        vault  = new LeashVault(owner, address(blusdc), DELAY);
        blusdc.mint(address(vault), 10_000e6);

        vm.prank(owner);
        vault.setAgent(agent_, true, PER_CAP, DAILY_CAP);
        vm.prank(owner);
        vault.setPayee(alice_, true);
    }

    // (a) Queueing a payment to blocklisted address works
    function test_Blocklist_QueueWorks() public {
        vm.prank(agent_);
        (bool executed, uint256 id) = vault.pay(blocked, 50e6, bytes32("r"));
        assertFalse(executed);
        assertEq(uint8(vault.getPayment(id).status), uint8(LeashVault.PaymentStatus.Pending));
    }

    // (b) approve/execute on blocklisted payment reverts on transfer
    function test_Blocklist_ApproveReverts() public {
        vm.prank(agent_);
        (, uint256 id) = vault.pay(blocked, 50e6, bytes32("r"));

        vm.prank(owner);
        vm.expectRevert(); // BlocklistMockERC20.Blocklisted (via SafeERC20)
        vault.approve(id);
    }

    function test_Blocklist_ExecuteReverts() public {
        vm.prank(agent_);
        (, uint256 id) = vault.pay(blocked, 50e6, bytes32("r"));
        vm.warp(block.timestamp + DELAY + 1);

        vm.expectRevert(); // BlocklistMockERC20.Blocklisted (via SafeERC20)
        vault.execute(id);
    }

    // (c) cancel() still works (no transfer)
    function test_Blocklist_CancelSucceeds() public {
        vm.prank(agent_);
        (, uint256 id) = vault.pay(blocked, 50e6, bytes32("r"));
        uint256 reservedBefore = vault.reserved();

        vm.prank(owner);
        vault.cancel(id);

        assertEq(vault.reserved(), reservedBefore - 50e6);
        assertEq(uint8(vault.getPayment(id).status), uint8(LeashVault.PaymentStatus.Cancelled));
    }

    // (d) withdraw still works after blocklisted payment queued
    function test_Blocklist_WithdrawWorks() public {
        vm.prank(agent_);
        vault.pay(blocked, 50e6, bytes32("r")); // reserves 50
        uint256 avail = vault.available();

        vm.prank(owner);
        vault.withdraw(owner, uint128(avail));
        assertEq(usdc_balance(), avail); // owner received it

        // reserved unchanged
        assertEq(vault.reserved(), 50e6);
    }

    // (d) other payments (non-blocklisted payee) still work
    function test_Blocklist_OtherPaymentsWork() public {
        vm.prank(agent_);
        vault.pay(blocked, 50e6, bytes32("r")); // queue blocked

        vm.prank(agent_);
        (bool ok,) = vault.pay(alice_, 30e6, bytes32("r2")); // instant to alice
        assertTrue(ok);
        assertEq(blusdc.balanceOf(alice_), 30e6);
    }

    function usdc_balance() internal view returns (uint256) {
        return blusdc.balanceOf(owner);
    }
}

// Silence unused variable warning
function _ignore(uint256) pure {}

// ─────────────────────────────────────────────────────────────────────────────
//  14. LeashFactory
// ─────────────────────────────────────────────────────────────────────────────
contract LeashFactory_Tests is Test {
    MockERC20   internal usdc;
    LeashFactory internal factory;

    address internal alice = makeAddr("fAlice");
    address internal bob   = makeAddr("fBob");

    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        factory = new LeashFactory(address(usdc));
    }

    function test_Factory_StoresUsdc() public view {
        assertEq(factory.usdc(), address(usdc));
    }

    function test_Factory_ZeroUsdcReverts() public {
        vm.expectRevert(LeashFactory.ZeroUSDC.selector);
        new LeashFactory(address(0));
    }

    function test_Factory_CreateVault_EmitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        // We don't know vault address ahead of time; only check topic1 (owner)
        emit LeashFactory.VaultCreated(alice, address(0));
        address v = factory.createVault(1 days);
        assertTrue(v != address(0));
    }

    function test_Factory_CreateVault_SetsOwner() public {
        vm.prank(alice);
        address v = factory.createVault(1 days);
        assertEq(LeashVault(v).owner(), alice);
    }

    function test_Factory_CreateVault_SetsDelay() public {
        vm.prank(alice);
        address v = factory.createVault(2 hours);
        assertEq(LeashVault(v).autoReleaseDelay(), 2 hours);
    }

    function test_Factory_VaultsOf_TracksMultiple() public {
        vm.startPrank(alice);
        address v1 = factory.createVault(0);
        address v2 = factory.createVault(1 days);
        vm.stopPrank();

        address[] memory vaults = factory.vaultsOf(alice);
        assertEq(vaults.length, 2);
        assertEq(vaults[0], v1);
        assertEq(vaults[1], v2);
    }

    function test_Factory_VaultsOf_Empty() public view {
        address[] memory vaults = factory.vaultsOf(bob);
        assertEq(vaults.length, 0);
    }

    function test_Factory_DifferentOwners() public {
        vm.prank(alice);
        factory.createVault(0);
        vm.prank(bob);
        factory.createVault(0);

        assertEq(factory.vaultsOf(alice).length, 1);
        assertEq(factory.vaultsOf(bob).length, 1);
    }

    function test_Factory_CreateVaultWithZeroDelay() public {
        vm.prank(alice);
        address v = factory.createVault(0);
        assertEq(LeashVault(v).autoReleaseDelay(), 0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  15. Fuzz: reserved equality  (test fuzz_reservedEquality)
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_Fuzz is LeashVaultBase {

    /// @dev Fuzz sequences of queue + cancel, assert reserved == sum of Pending amounts.
    function testFuzz_ReservedEquality(uint8[10] memory amounts, bool[10] memory cancelFlags) public {
        uint256[] memory ids = new uint256[](10);

        for (uint256 i = 0; i < 10; i++) {
            uint128 amt = uint128(bound(amounts[i], 1, 10e6)); // 1..10 USDC each
            vm.prank(agent);
            (, ids[i]) = vault.pay(bob, amt, bytes32(i));
        }

        // Optionally cancel some
        for (uint256 i = 0; i < 10; i++) {
            if (cancelFlags[i] && vault.getPayment(ids[i]).status == LeashVault.PaymentStatus.Pending) {
                vm.prank(owner);
                vault.cancel(ids[i]);
            }
        }

        // Compute sum of remaining pending amounts
        uint256 sumPending = 0;
        for (uint256 i = 0; i < 10; i++) {
            LeashVault.Payment memory p = vault.getPayment(ids[i]);
            if (p.status == LeashVault.PaymentStatus.Pending) {
                sumPending += p.amount;
            }
        }

        assertEq(vault.reserved(), sumPending, "reserved != sum of pending");
    }

    /// @dev Fuzz multiple pay() calls to allowlisted payee, assert cumulative spend never exceeds dailyCap.
    function testFuzz_AgentDailyCap(uint8[8] memory amounts) public {
        uint256 totalSpent = 0;
        for (uint256 i = 0; i < 8; i++) {
            uint128 amt = uint128(bound(amounts[i], 1, PER_CAP));
            if (totalSpent + amt > DAILY_CAP) {
                // Expect revert
                vm.prank(agent);
                vm.expectRevert(LeashVault.DailyCapExceeded.selector);
                vault.pay(alice, amt, bytes32(i));
            } else {
                vm.prank(agent);
                (bool ok,) = vault.pay(alice, amt, bytes32(i));
                assertTrue(ok);
                totalSpent += amt;
            }
        }
        assertLe(vault.getAgent(agent).spentInWindow, DAILY_CAP, "spentInWindow exceeds dailyCap");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  16. Invariant: reserved <= balance  &  reserved == sum of pending
// ─────────────────────────────────────────────────────────────────────────────

/// @dev Handler contract drives state changes for the invariant test.
contract VaultHandler is Test {
    LeashVault internal vault;
    MockERC20  internal usdc;

    address internal owner_;
    address internal agent_;
    address internal bob_;

    uint256[] internal pendingIds;
    // ghost: sum of all currently-Pending payment amounts
    uint256 public ghost_sumPending;

    constructor(LeashVault v, MockERC20 u, address o, address a, address b) {
        vault  = v;
        usdc   = u;
        owner_ = o;
        agent_ = a;
        bob_   = b;
    }

    function queuePayment(uint128 amt) external {
        uint128 amount = uint128(bound(amt, 1, 10e6));
        // ensure sufficient free balance
        if (vault.available() < amount) return;
        if (vault.getAgent(agent_).pendingCount >= 20) return;

        vm.prank(agent_);
        (, uint256 id) = vault.pay(bob_, amount, bytes32(pendingIds.length));
        pendingIds.push(id);
        ghost_sumPending += amount;
    }

    function cancelPayment(uint256 idx) external {
        if (pendingIds.length == 0) return;
        idx = bound(idx, 0, pendingIds.length - 1);
        uint256 id = pendingIds[idx];
        if (vault.getPayment(id).status != LeashVault.PaymentStatus.Pending) return;

        uint128 amt = vault.getPayment(id).amount;
        vm.prank(owner_);
        vault.cancel(id);
        ghost_sumPending -= amt;
    }

    function approvePayment(uint256 idx) external {
        if (pendingIds.length == 0) return;
        idx = bound(idx, 0, pendingIds.length - 1);
        uint256 id = pendingIds[idx];
        if (vault.getPayment(id).status != LeashVault.PaymentStatus.Pending) return;

        uint128 amt = vault.getPayment(id).amount;
        vm.prank(owner_);
        vault.approve(id);
        ghost_sumPending -= amt;
    }

    function depositMore(uint256 amt) external {
        uint256 amount = bound(amt, 0, 50_000e6);
        usdc.mint(address(vault), amount);
    }
}

contract LeashVault_Invariant is Test {
    MockERC20    internal usdc;
    LeashVault   internal vault;
    VaultHandler internal handler;

    address internal owner_ = makeAddr("invOwner");
    address internal agent_ = makeAddr("invAgent");
    address internal bob_   = makeAddr("invBob");

    uint128 internal constant PER_CAP   = 100e6;
    uint128 internal constant DAILY_CAP = 500e6;

    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        vault   = new LeashVault(owner_, address(usdc), 1 days);
        usdc.mint(address(vault), 100_000e6);

        vm.prank(owner_);
        vault.setAgent(agent_, true, PER_CAP, DAILY_CAP);

        handler = new VaultHandler(vault, usdc, owner_, agent_, bob_);

        // Scope fuzzing to handler functions only
        targetContract(address(handler));
    }

    /// reserved must never exceed the vault's token balance.
    function invariant_reservedLteBalance() public view {
        assertLe(vault.reserved(), usdc.balanceOf(address(vault)), "reserved > balance");
    }

    /// reserved must equal the ghost sum of all pending payment amounts.
    function invariant_reservedEqSumPending() public view {
        assertEq(vault.reserved(), handler.ghost_sumPending(), "reserved != ghost_sumPending");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  17. available() helper
// ─────────────────────────────────────────────────────────────────────────────
contract LeashVault_Available is LeashVaultBase {

    function test_Available_FullBalance() public view {
        assertEq(vault.available(), VAULT_FUND);
    }

    function test_Available_AfterReserve() public {
        _queueBob(100e6);
        assertEq(vault.available(), VAULT_FUND - 100e6);
    }

    function test_Available_AfterWithdraw() public {
        vm.prank(owner);
        vault.withdraw(owner, 1000e6);
        assertEq(vault.available(), VAULT_FUND - 1000e6);
    }
}

// Suppress unused local variable warning for blocklist test
uint256 constant _SUPPRESS = 0;
