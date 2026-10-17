// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LeashVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_PENDING_PER_AGENT = 20;
    uint256 public constant WINDOW = 1 days;

    error NotOwner();
    error NotAgent();
    error NotOwnerOrAgent();
    error Frozen();
    error AlreadyFrozen();
    error NotFrozen();
    error ZeroAddress();
    error SelfPayee();
    error ZeroAmount();
    error AmountExceedsCap();
    error DailyCapExceeded();
    error InsufficientAvailable();
    error AgentNotActive();
    error AgentPerCapTooHigh();
    error PendingCapReached();
    error PaymentNotPending();
    error AutoReleaseNotEnabled();
    error TooEarly();
    error NoPendingOwner();
    error NotPendingOwner();
    error NativeValueRejected();
    error InvalidAutoReleaseDelay();

    enum PaymentStatus {
        None,
        Pending,
        Executed,
        Cancelled
    }

    struct AgentConfig {
        bool active;
        uint128 perPaymentCap;
        uint128 dailyCap;
        uint128 spentInWindow;
        uint48 windowStart;
        uint32 pendingCount;
    }

    struct Payment {
        address agent;
        address payee;
        uint128 amount;
        uint48 queuedAt;
        bytes32 ref;
        PaymentStatus status;
    }

    address public owner;
    address public pendingOwner;
    IERC20 public immutable usdc;
    bool public frozen;
    uint32 public autoReleaseDelay;
    uint256 public reserved;
    uint256 public nextPaymentId;

    mapping(address => AgentConfig) public agents;
    mapping(address => bool) public allowedPayees;
    mapping(uint256 => Payment) public payments;

    event AgentSet(address indexed agent, bool active, uint128 perPaymentCap, uint128 dailyCap);
    event PayeeSet(address indexed payee, bool allowed);
    event PaymentQueued(uint256 indexed id, address indexed agent, address indexed payee, uint128 amount, bytes32 ref);
    event PaymentExecuted(uint256 indexed id, address indexed agent, address indexed payee, uint128 amount);
    event PaymentCancelled(uint256 indexed id, address indexed agent, address indexed payee, uint128 amount);
    event VaultFrozen();
    event VaultUnfrozen();
    event Withdrawn(address indexed to, uint128 amount);
    event OwnerProposed(address indexed proposedOwner);
    event OwnerAccepted(address indexed newOwner);
    event AutoReleaseDelaySet(uint32 delay);

    constructor(address owner_, address usdc_, uint32 autoReleaseDelay_) {
        if (owner_ == address(0) || usdc_ == address(0)) {
            revert ZeroAddress();
        }

        owner = owner_;
        usdc = IERC20(usdc_);
        autoReleaseDelay = autoReleaseDelay_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner();
        }
        _;
    }

    function _consumeDailyAllowance(AgentConfig storage cfg, uint128 amount) internal {
        if (block.timestamp >= uint256(cfg.windowStart) + WINDOW) {
            cfg.windowStart = uint48(block.timestamp);
            cfg.spentInWindow = 0;
        }

        uint256 nextSpent = uint256(cfg.spentInWindow) + amount;
        if (nextSpent > cfg.dailyCap) {
            revert DailyCapExceeded();
        }

        cfg.spentInWindow = uint128(nextSpent);
    }

    function _settle(uint256 id, bool consumeAllowance) internal {
        Payment storage p = payments[id];

        p.status = PaymentStatus.Executed;
        reserved -= p.amount;
        agents[p.agent].pendingCount -= 1;

        if (consumeAllowance) {
            _consumeDailyAllowance(agents[p.agent], p.amount);
        }

        usdc.safeTransfer(p.payee, p.amount);

        emit PaymentExecuted(id, p.agent, p.payee, p.amount);
    }

    function _available() internal view returns (uint256) {
        uint256 bal = usdc.balanceOf(address(this));
        return bal > reserved ? bal - reserved : 0;
    }

    /// @notice Sets agent permissions and spending caps.
    /// @param agent Agent address to configure.
    /// @param active Whether the agent is active.
    /// @param perPaymentCap Maximum amount per payment.
    /// @param dailyCap Maximum aggregate spend per rolling 24h window.
    function setAgent(address agent, bool active, uint128 perPaymentCap, uint128 dailyCap) external onlyOwner {
        if (agent == address(0)) {
            revert ZeroAddress();
        }
        if (perPaymentCap > dailyCap) {
            revert AgentPerCapTooHigh();
        }

        AgentConfig storage cfg = agents[agent];
        cfg.active = active;
        cfg.perPaymentCap = perPaymentCap;
        cfg.dailyCap = dailyCap;

        emit AgentSet(agent, active, perPaymentCap, dailyCap);
    }

    /// @notice Sets whether a payee can be paid instantly.
    /// @param payee Payee address.
    /// @param allowed Whether the payee is allowlisted.
    function setPayee(address payee, bool allowed) external onlyOwner {
        if (payee == address(0)) {
            revert ZeroAddress();
        }

        allowedPayees[payee] = allowed;

        emit PayeeSet(payee, allowed);
    }

    /// @notice Updates the global auto-release delay for queued payments.
    /// @param delay Delay in seconds; 0 disables public execution.
    function setAutoReleaseDelay(uint32 delay) external onlyOwner {
        autoReleaseDelay = delay;

        emit AutoReleaseDelaySet(delay);
    }

    /// @notice Freezes agent-initiated pay and execute paths.
    function freeze() external onlyOwner {
        if (frozen) {
            revert AlreadyFrozen();
        }

        frozen = true;

        emit VaultFrozen();
    }

    /// @notice Unfreezes agent-initiated pay and execute paths.
    function unfreeze() external onlyOwner {
        if (!frozen) {
            revert NotFrozen();
        }

        frozen = false;

        emit VaultUnfrozen();
    }

    /// @notice Owner-approves a pending payment for settlement.
    /// @param id Pending payment id.
    function approve(uint256 id) external onlyOwner nonReentrant {
        if (payments[id].status != PaymentStatus.Pending) {
            revert PaymentNotPending();
        }

        _settle(id, false);
    }

    /// @notice Cancels a pending payment.
    /// @param id Pending payment id.
    function cancel(uint256 id) external nonReentrant {
        Payment storage p = payments[id];

        if (msg.sender != owner && msg.sender != p.agent) {
            revert NotOwnerOrAgent();
        }
        if (p.status != PaymentStatus.Pending) {
            revert PaymentNotPending();
        }

        p.status = PaymentStatus.Cancelled;
        reserved -= p.amount;
        agents[p.agent].pendingCount -= 1;

        emit PaymentCancelled(id, p.agent, p.payee, p.amount);
    }

    /// @notice Withdraws available, unreserved USDC from the vault.
    /// @param to Recipient of withdrawn USDC.
    /// @param amount Amount to withdraw.
    function withdraw(address to, uint128 amount) external onlyOwner nonReentrant {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }
        if (amount > _available()) {
            revert InsufficientAvailable();
        }

        usdc.safeTransfer(to, amount);

        emit Withdrawn(to, amount);
    }

    /// @notice Proposes a new owner that must explicitly accept ownership.
    /// @param proposed Address proposed as new owner.
    function proposeOwner(address proposed) external onlyOwner {
        if (proposed == address(0)) {
            revert ZeroAddress();
        }

        pendingOwner = proposed;

        emit OwnerProposed(proposed);
    }

    /// @notice Accepts ownership by the pending owner.
    function acceptOwner() external {
        address proposed = pendingOwner;
        if (proposed == address(0)) {
            revert NoPendingOwner();
        }
        if (msg.sender != proposed) {
            revert NotPendingOwner();
        }

        owner = proposed;
        pendingOwner = address(0);

        emit OwnerAccepted(proposed);
    }

    /// @notice Requests a payment to a payee, executing instantly if allowlisted.
    /// @param payee Recipient address.
    /// @param amount USDC amount.
    /// @param ref Off-chain reference identifier.
    /// @return executed True when transferred instantly, false when queued.
    /// @return id Payment id.
    function pay(address payee, uint128 amount, bytes32 ref)
        external
        nonReentrant
        returns (bool executed, uint256 id)
    {
        AgentConfig storage cfg = agents[msg.sender];

        if (!cfg.active) {
            revert AgentNotActive();
        }
        if (frozen) {
            revert Frozen();
        }
        if (payee == address(0)) {
            revert ZeroAddress();
        }
        if (payee == address(this)) {
            revert SelfPayee();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }
        if (amount > cfg.perPaymentCap) {
            revert AmountExceedsCap();
        }

        if (allowedPayees[payee]) {
            if (amount > _available()) {
                revert InsufficientAvailable();
            }

            _consumeDailyAllowance(cfg, amount);

            id = nextPaymentId++;
            payments[id] = Payment({
                agent: msg.sender,
                payee: payee,
                amount: amount,
                queuedAt: uint48(block.timestamp),
                ref: ref,
                status: PaymentStatus.Executed
            });

            usdc.safeTransfer(payee, amount);
            emit PaymentExecuted(id, msg.sender, payee, amount);

            return (true, id);
        }

        if (cfg.pendingCount >= MAX_PENDING_PER_AGENT) {
            revert PendingCapReached();
        }
        if (amount > _available()) {
            revert InsufficientAvailable();
        }

        reserved += amount;
        id = nextPaymentId++;
        payments[id] = Payment({
            agent: msg.sender,
            payee: payee,
            amount: amount,
            queuedAt: uint48(block.timestamp),
            ref: ref,
            status: PaymentStatus.Pending
        });
        cfg.pendingCount += 1;

        emit PaymentQueued(id, msg.sender, payee, amount, ref);

        return (false, id);
    }

    /// @notice Executes a pending payment once the auto-release delay has elapsed.
    /// @param id Pending payment id.
    function execute(uint256 id) external nonReentrant {
        if (autoReleaseDelay == 0) {
            revert AutoReleaseNotEnabled();
        }
        if (frozen) {
            revert Frozen();
        }

        Payment storage p = payments[id];
        if (p.status != PaymentStatus.Pending) {
            revert PaymentNotPending();
        }
        if (block.timestamp < uint256(p.queuedAt) + autoReleaseDelay) {
            revert TooEarly();
        }

        AgentConfig storage cfg = agents[p.agent];
        if (!cfg.active) {
            revert AgentNotActive();
        }
        if (p.amount > cfg.perPaymentCap) {
            revert AmountExceedsCap();
        }

        _settle(id, true);
    }

    /// @notice Returns currently withdrawable USDC balance.
    /// @return amount Available USDC amount.
    function available() external view returns (uint256 amount) {
        return _available();
    }

    /// @notice Returns payment data for a given id.
    /// @param id Payment id.
    /// @return payment Stored payment struct.
    function getPayment(uint256 id) external view returns (Payment memory payment) {
        return payments[id];
    }

    /// @notice Returns current config for a given agent.
    /// @param agent Agent address.
    /// @return cfg Agent configuration.
    function getAgent(address agent) external view returns (AgentConfig memory cfg) {
        return agents[agent];
    }
}
