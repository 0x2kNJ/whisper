// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title WhisperEscrow
 * @notice Programmable multi-milestone payroll escrow for the Whisper private AI treasury agent.
 *         Deployed on Arc testnet where USDC (0x3600000000000000000000000000000000000000)
 *         is the native gas token.
 *
 *         Each payroll holds a set of milestones. A milestone unlocks when ALL configured
 *         conditions are satisfied:
 *           1. Time lock  — block.timestamp >= unlockTime  (skipped when unlockTime == 0)
 *           2. Oracle     — latestAnswer() satisfies (price OP triggerPrice)  (skipped when oracle == address(0))
 *
 *         On release the milestone amount is split among recipients pro-rata by basis-point shares.
 */

// ─────────────────────────────────────────────
// External interface
// ─────────────────────────────────────────────

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Minimal Chainlink-compatible price feed interface used for oracle conditions.
interface IPriceFeed {
    function latestAnswer() external view returns (int256);
}

// ─────────────────────────────────────────────
// Data structures
// ─────────────────────────────────────────────

/// @dev A single payment gate. All non-zero conditions must be met simultaneously.
struct Milestone {
    uint256 amount;       // Token amount released when this milestone unlocks
    uint256 unlockTime;   // Unix timestamp; 0 = no time lock
    address oracle;       // IPriceFeed address; address(0) = no price condition
    uint256 triggerPrice; // Price threshold (unsigned, same decimals as the feed)
    uint8   operator;     // 0 = price must be > triggerPrice (GT), 1 = price must be < triggerPrice (LT)
    bool    released;     // True once this milestone has been paid out
}

/// @dev Top-level payroll record stored on-chain.
struct Payroll {
    address    creator;       // Address that funded this payroll
    address    token;         // ERC-20 token used for payment
    Milestone[] milestones;   // Ordered list of payment gates
    address[]  recipients;    // Payees
    uint256[]  shares;        // Basis points per recipient; must sum to 10 000
    uint256    totalAmount;   // Sum of all milestone amounts (for accounting)
    bool       cancelled;     // True once the creator has cancelled
}

// ─────────────────────────────────────────────
// Main contract
// ─────────────────────────────────────────────

contract WhisperEscrow {

    // ── Storage ──────────────────────────────

    /// @notice Incrementing payroll counter (0-indexed).
    uint256 public nextPayrollId;

    /// @notice Primary payroll registry.
    mapping(uint256 => Payroll) private _payrolls;

    // ── Events ───────────────────────────────

    event PayrollCreated(
        uint256 indexed payrollId,
        address indexed creator,
        address indexed token,
        uint256 totalAmount,
        uint256 milestoneCount
    );

    event MilestoneReleased(
        uint256 indexed payrollId,
        uint256 indexed milestoneIndex,
        uint256 amount
    );

    event PayrollCancelled(
        uint256 indexed payrollId,
        uint256 refundAmount
    );

    // ── Errors ───────────────────────────────

    error InvalidShares();
    error InvalidMilestones();
    error InvalidRecipients();
    error PayrollCancelledError();
    error NotCreator();
    error AlreadyReleased();
    error ConditionNotMet();
    error TransferFailed();

    // ─────────────────────────────────────────
    // Write functions
    // ─────────────────────────────────────────

    /**
     * @notice Create a new payroll and lock the total token amount in this contract.
     * @param token       ERC-20 token address for all payments.
     * @param recipients  Ordered list of payee addresses.
     * @param shares      Basis-point allocation per recipient (must sum to 10 000).
     * @param milestones  Payment gates, evaluated in order.
     * @return payrollId  The ID of the newly created payroll.
     */
    function createPayroll(
        address token,
        address[] calldata recipients,
        uint256[] calldata shares,
        Milestone[] calldata milestones
    ) external returns (uint256 payrollId) {
        // ── Validation ───────────────────────

        if (recipients.length == 0 || recipients.length != shares.length) {
            revert InvalidRecipients();
        }

        uint256 sharesSum;
        for (uint256 i; i < shares.length; ++i) {
            sharesSum += shares[i];
        }
        if (sharesSum != 10_000) revert InvalidShares();

        if (milestones.length == 0) revert InvalidMilestones();

        // ── Accounting ───────────────────────

        uint256 total;
        for (uint256 i; i < milestones.length; ++i) {
            total += milestones[i].amount;
        }

        // ── Persist ──────────────────────────

        payrollId = nextPayrollId++;

        Payroll storage p = _payrolls[payrollId];
        p.creator     = msg.sender;
        p.token       = token;
        p.totalAmount = total;
        p.cancelled   = false;

        // Copy dynamic arrays explicitly (Solidity can't assign calldata structs with
        // nested arrays directly into storage in one step).
        for (uint256 i; i < milestones.length; ++i) {
            p.milestones.push(milestones[i]);
        }
        for (uint256 i; i < recipients.length; ++i) {
            p.recipients.push(recipients[i]);
            p.shares.push(shares[i]);
        }

        // ── Pull tokens into escrow ──────────

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), total);
        if (!ok) revert TransferFailed();

        emit PayrollCreated(payrollId, msg.sender, token, total, milestones.length);
    }

    /**
     * @notice Release a milestone if all conditions are satisfied.
     *         Anyone may call this — the recipients receive funds directly.
     * @param payrollId      Target payroll.
     * @param milestoneIndex Index inside the payroll's milestone array.
     */
    function release(uint256 payrollId, uint256 milestoneIndex) external {
        Payroll storage p = _payrolls[payrollId];

        if (p.cancelled) revert PayrollCancelledError();

        Milestone storage m = p.milestones[milestoneIndex];
        if (m.released) revert AlreadyReleased();

        // Verify conditions — reverts if not met.
        if (!_checkCondition(p, m)) revert ConditionNotMet();

        // Mark before distributing (re-entrancy guard via CEI pattern).
        m.released = true;

        _distribute(p, m.amount);

        emit MilestoneReleased(payrollId, milestoneIndex, m.amount);
    }

    /**
     * @notice Creator cancels the payroll and reclaims all unreleased funds.
     * @param payrollId Target payroll.
     */
    function cancelPayroll(uint256 payrollId) external {
        Payroll storage p = _payrolls[payrollId];

        if (msg.sender != p.creator) revert NotCreator();
        if (p.cancelled) revert PayrollCancelledError();

        p.cancelled = true;

        // Sum up unreleased milestone amounts.
        uint256 refund;
        for (uint256 i; i < p.milestones.length; ++i) {
            if (!p.milestones[i].released) {
                refund += p.milestones[i].amount;
            }
        }

        if (refund > 0) {
            bool ok = IERC20(p.token).transfer(p.creator, refund);
            if (!ok) revert TransferFailed();
        }

        emit PayrollCancelled(payrollId, refund);
    }

    // ─────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────

    /**
     * @notice Check whether a milestone's conditions are currently satisfied.
     * @param payrollId      Target payroll.
     * @param milestoneIndex Index inside the milestone array.
     * @return True if the milestone can be released right now.
     */
    function checkCondition(uint256 payrollId, uint256 milestoneIndex)
        external
        view
        returns (bool)
    {
        Payroll storage p = _payrolls[payrollId];
        Milestone storage m = p.milestones[milestoneIndex];
        return _checkCondition(p, m);
    }

    /**
     * @notice Retrieve the full Payroll record (minus the milestones array).
     *         Use getMilestone() to inspect individual milestones.
     */
    function getPayroll(uint256 payrollId)
        external
        view
        returns (
            address creator,
            address token,
            address[] memory recipients,
            uint256[] memory shares,
            uint256 totalAmount,
            bool cancelled,
            uint256 milestoneCount
        )
    {
        Payroll storage p = _payrolls[payrollId];
        return (
            p.creator,
            p.token,
            p.recipients,
            p.shares,
            p.totalAmount,
            p.cancelled,
            p.milestones.length
        );
    }

    /// @notice Retrieve a single milestone by payroll + index.
    function getMilestone(uint256 payrollId, uint256 milestoneIndex)
        external
        view
        returns (Milestone memory)
    {
        return _payrolls[payrollId].milestones[milestoneIndex];
    }

    // ─────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────

    /// @dev Core condition evaluator. Pure logic — does not mutate state.
    function _checkCondition(Payroll storage p, Milestone storage m)
        internal
        view
        returns (bool)
    {
        // Suppress unused-variable warning; p is available for future extension.
        p;

        // 1. Time lock
        if (m.unlockTime != 0 && block.timestamp < m.unlockTime) {
            return false;
        }

        // 2. Oracle price condition
        if (m.oracle != address(0)) {
            int256 price = IPriceFeed(m.oracle).latestAnswer();
            // Cast triggerPrice to int256 for comparison (feeds return signed values).
            int256 trigger = int256(m.triggerPrice);

            if (m.operator == 0) {
                // GT: price must be strictly greater than trigger
                if (!(price > trigger)) return false;
            } else {
                // LT: price must be strictly less than trigger
                if (!(price < trigger)) return false;
            }
        }

        return true;
    }

    /**
     * @dev Distribute `amount` among the payroll's recipients proportionally by shares.
     *      Uses integer division; any dust (from rounding) is sent to the last recipient.
     */
    function _distribute(Payroll storage p, uint256 amount) internal {
        uint256 len = p.recipients.length;
        uint256 distributed;

        for (uint256 i; i < len - 1; ++i) {
            uint256 portion = (amount * p.shares[i]) / 10_000;
            distributed += portion;
            bool okI = IERC20(p.token).transfer(p.recipients[i], portion);
            if (!okI) revert TransferFailed();
        }

        // Last recipient receives any remaining dust.
        uint256 remainder = amount - distributed;
        bool ok = IERC20(p.token).transfer(p.recipients[len - 1], remainder);
        if (!ok) revert TransferFailed();
    }
}
