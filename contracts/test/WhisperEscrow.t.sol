// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WhisperEscrow, Milestone} from "../src/WhisperEscrow.sol";

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

/// @dev Minimal ERC-20 token used throughout the test suite.
contract MockERC20 {
    string public name   = "Mock USDC";
    string public symbol = "mUSDC";
    uint8  public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Simple price feed mock. Price is settable by the test.
contract MockPriceFeed {
    int256 public price;

    function setPrice(int256 _price) external {
        price = _price;
    }

    function latestAnswer() external view returns (int256) {
        return price;
    }
}

// ─────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────

contract WhisperEscrowTest is Test {

    WhisperEscrow internal escrow;
    MockERC20     internal token;
    MockPriceFeed internal feed;

    address internal creator   = makeAddr("creator");
    address internal alice     = makeAddr("alice");
    address internal bob       = makeAddr("bob");
    address internal carol     = makeAddr("carol");

    // Amounts are in 6-decimal USDC units.
    uint256 constant ONE_K  = 1_000e6;   // $1 000
    uint256 constant FIVE_K = 5_000e6;   // $5 000
    uint256 constant TEN_K  = 10_000e6;  // $10 000

    // ── Set-up ───────────────────────────────

    function setUp() public {
        escrow = new WhisperEscrow();
        token  = new MockERC20();
        feed   = new MockPriceFeed();

        // Fund creator with plenty of tokens.
        token.mint(creator, 100_000e6);

        // Pre-approve the escrow to pull from creator.
        vm.prank(creator);
        token.approve(address(escrow), type(uint256).max);
    }

    // ─────────────────────────────────────────
    // Helper builders
    // ─────────────────────────────────────────

    /// @dev Build a single immediate milestone (no lock, no oracle).
    function _immediateMilestone(uint256 amount) internal pure returns (Milestone[] memory) {
        Milestone[] memory ms = new Milestone[](1);
        ms[0] = Milestone({
            amount:       amount,
            unlockTime:   0,
            oracle:       address(0),
            triggerPrice: 0,
            operator:     0,
            released:     false
        });
        return ms;
    }

    /// @dev Build single-recipient (100 % share) arrays.
    function _singleRecipient(address r)
        internal
        pure
        returns (address[] memory recipients, uint256[] memory shares)
    {
        recipients = new address[](1);
        shares     = new uint256[](1);
        recipients[0] = r;
        shares[0]     = 10_000; // 100 %
    }

    // ─────────────────────────────────────────
    // Test 1 — immediate payroll (no conditions)
    // ─────────────────────────────────────────

    function test_create_immediate_payroll() public {
        (address[] memory recipients, uint256[] memory shares) = _singleRecipient(alice);
        Milestone[] memory ms = _immediateMilestone(ONE_K);

        vm.prank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        // Tokens should have moved into escrow.
        assertEq(token.balanceOf(address(escrow)), ONE_K, "escrow balance");

        // Condition should be met immediately (no locks).
        assertTrue(escrow.checkCondition(id, 0), "condition should be true");

        // Release and verify alice receives the funds.
        uint256 aliceBefore = token.balanceOf(alice);
        escrow.release(id, 0);
        assertEq(token.balanceOf(alice) - aliceBefore, ONE_K, "alice payout");
    }

    // ─────────────────────────────────────────
    // Test 2 — time-locked milestone
    // ─────────────────────────────────────────

    function test_release_vested_milestone() public {
        uint256 unlockAt = block.timestamp + 30 days;

        Milestone[] memory ms = new Milestone[](1);
        ms[0] = Milestone({
            amount:       FIVE_K,
            unlockTime:   unlockAt,
            oracle:       address(0),
            triggerPrice: 0,
            operator:     0,
            released:     false
        });

        (address[] memory recipients, uint256[] memory shares) = _singleRecipient(alice);

        vm.prank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        // Before unlock: condition not met, release reverts.
        assertFalse(escrow.checkCondition(id, 0), "should be locked");
        vm.expectRevert(WhisperEscrow.ConditionNotMet.selector);
        escrow.release(id, 0);

        // Warp past unlock time.
        vm.warp(unlockAt + 1);

        assertTrue(escrow.checkCondition(id, 0), "should be unlocked");

        uint256 aliceBefore = token.balanceOf(alice);
        escrow.release(id, 0);
        assertEq(token.balanceOf(alice) - aliceBefore, FIVE_K, "alice vested payout");
    }

    // ─────────────────────────────────────────
    // Test 3 — oracle-conditional milestone (GT, price above trigger)
    // ─────────────────────────────────────────

    function test_release_conditional_milestone() public {
        // Trigger: release when ETH price > 3000 USD (8-decimal Chainlink style).
        uint256 trigger = 3_000e8;
        feed.setPrice(int256(3_500e8)); // current price: $3 500 ✓

        Milestone[] memory ms = new Milestone[](1);
        ms[0] = Milestone({
            amount:       ONE_K,
            unlockTime:   0,
            oracle:       address(feed),
            triggerPrice: trigger,
            operator:     0, // GT
            released:     false
        });

        (address[] memory recipients, uint256[] memory shares) = _singleRecipient(bob);

        vm.prank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        assertTrue(escrow.checkCondition(id, 0), "price condition met");

        uint256 bobBefore = token.balanceOf(bob);
        escrow.release(id, 0);
        assertEq(token.balanceOf(bob) - bobBefore, ONE_K, "bob received payment");
    }

    // ─────────────────────────────────────────
    // Test 4 — oracle condition NOT met (should revert)
    // ─────────────────────────────────────────

    function test_release_condition_not_met_reverts() public {
        uint256 trigger = 3_000e8;
        feed.setPrice(int256(2_800e8)); // current price: $2 800 — below threshold ✗

        Milestone[] memory ms = new Milestone[](1);
        ms[0] = Milestone({
            amount:       ONE_K,
            unlockTime:   0,
            oracle:       address(feed),
            triggerPrice: trigger,
            operator:     0, // GT
            released:     false
        });

        (address[] memory recipients, uint256[] memory shares) = _singleRecipient(bob);

        vm.prank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        assertFalse(escrow.checkCondition(id, 0), "price condition not met");

        vm.expectRevert(WhisperEscrow.ConditionNotMet.selector);
        escrow.release(id, 0);
    }

    // ─────────────────────────────────────────
    // Test 5 — creator cancels, gets everything back
    // ─────────────────────────────────────────

    function test_cancel_payroll() public {
        Milestone[] memory ms = new Milestone[](2);
        ms[0] = Milestone({amount: ONE_K,  unlockTime: 0, oracle: address(0), triggerPrice: 0, operator: 0, released: false});
        ms[1] = Milestone({amount: FIVE_K, unlockTime: 0, oracle: address(0), triggerPrice: 0, operator: 0, released: false});

        (address[] memory recipients, uint256[] memory shares) = _singleRecipient(alice);

        vm.startPrank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        uint256 creatorBefore = token.balanceOf(creator);
        escrow.cancelPayroll(id);
        vm.stopPrank();

        uint256 refunded = token.balanceOf(creator) - creatorBefore;
        assertEq(refunded, ONE_K + FIVE_K, "full refund on cancel");
        assertEq(token.balanceOf(address(escrow)), 0, "escrow drained");
    }

    // ─────────────────────────────────────────
    // Test 6 — cancel after partial release
    // ─────────────────────────────────────────

    function test_cancel_after_partial_release() public {
        Milestone[] memory ms = new Milestone[](3);
        ms[0] = Milestone({amount: ONE_K,  unlockTime: 0, oracle: address(0), triggerPrice: 0, operator: 0, released: false});
        ms[1] = Milestone({amount: ONE_K,  unlockTime: 0, oracle: address(0), triggerPrice: 0, operator: 0, released: false});
        ms[2] = Milestone({amount: ONE_K,  unlockTime: 0, oracle: address(0), triggerPrice: 0, operator: 0, released: false});

        (address[] memory recipients, uint256[] memory shares) = _singleRecipient(alice);

        vm.prank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        // Release milestones 0 and 1.
        escrow.release(id, 0);
        escrow.release(id, 1);

        // Milestone 2 is still locked. Creator cancels.
        uint256 creatorBefore = token.balanceOf(creator);
        vm.prank(creator);
        escrow.cancelPayroll(id);

        uint256 refunded = token.balanceOf(creator) - creatorBefore;
        assertEq(refunded, ONE_K, "only unreleased milestone refunded");
    }

    // ─────────────────────────────────────────
    // Test 7 — three recipients, custom shares
    // ─────────────────────────────────────────

    function test_multi_recipient_shares() public {
        // Alice 50 %, Bob 30 %, Carol 20 %
        address[] memory recipients = new address[](3);
        uint256[] memory shares     = new uint256[](3);
        recipients[0] = alice;   shares[0] = 5_000;
        recipients[1] = bob;     shares[1] = 3_000;
        recipients[2] = carol;   shares[2] = 2_000;

        Milestone[] memory ms = new Milestone[](1);
        ms[0] = Milestone({
            amount:       TEN_K,
            unlockTime:   0,
            oracle:       address(0),
            triggerPrice: 0,
            operator:     0,
            released:     false
        });

        vm.prank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore   = token.balanceOf(bob);
        uint256 carolBefore = token.balanceOf(carol);

        escrow.release(id, 0);

        uint256 aliceGot = token.balanceOf(alice) - aliceBefore;
        uint256 bobGot   = token.balanceOf(bob)   - bobBefore;
        uint256 carolGot = token.balanceOf(carol) - carolBefore;

        assertEq(aliceGot, 5_000e6, "alice 50%");
        assertEq(bobGot,   3_000e6, "bob 30%");
        assertEq(carolGot, 2_000e6, "carol 20%");

        // Total distributed must equal milestone amount exactly.
        assertEq(aliceGot + bobGot + carolGot, TEN_K, "no dust lost");
    }

    // ─────────────────────────────────────────
    // Miscellaneous edge-case tests
    // ─────────────────────────────────────────

    /// @dev Releasing the same milestone twice should revert.
    function test_double_release_reverts() public {
        (address[] memory recipients, uint256[] memory shares) = _singleRecipient(alice);
        Milestone[] memory ms = _immediateMilestone(ONE_K);

        vm.prank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        escrow.release(id, 0);

        vm.expectRevert(WhisperEscrow.AlreadyReleased.selector);
        escrow.release(id, 0);
    }

    /// @dev Non-creator cannot cancel.
    function test_cancel_not_creator_reverts() public {
        (address[] memory recipients, uint256[] memory shares) = _singleRecipient(alice);
        Milestone[] memory ms = _immediateMilestone(ONE_K);

        vm.prank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        vm.prank(bob);
        vm.expectRevert(WhisperEscrow.NotCreator.selector);
        escrow.cancelPayroll(id);
    }

    /// @dev Cannot release from a cancelled payroll.
    function test_release_on_cancelled_reverts() public {
        (address[] memory recipients, uint256[] memory shares) = _singleRecipient(alice);
        Milestone[] memory ms = _immediateMilestone(ONE_K);

        vm.prank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        vm.prank(creator);
        escrow.cancelPayroll(id);

        vm.expectRevert(WhisperEscrow.PayrollCancelledError.selector);
        escrow.release(id, 0);
    }

    /// @dev LT operator: release when price drops below threshold.
    function test_oracle_lt_operator() public {
        uint256 trigger = 1_000e8; // release when price < $1 000
        feed.setPrice(int256(900e8)); // $900 ✓

        Milestone[] memory ms = new Milestone[](1);
        ms[0] = Milestone({
            amount:       ONE_K,
            unlockTime:   0,
            oracle:       address(feed),
            triggerPrice: trigger,
            operator:     1, // LT
            released:     false
        });

        (address[] memory recipients, uint256[] memory shares) = _singleRecipient(alice);

        vm.prank(creator);
        uint256 id = escrow.createPayroll(address(token), recipients, shares, ms);

        assertTrue(escrow.checkCondition(id, 0), "LT condition met");
        escrow.release(id, 0);
        assertEq(token.balanceOf(alice), ONE_K, "alice payout via LT oracle");
    }

    /// @dev Shares that don't sum to 10 000 should revert.
    function test_invalid_shares_reverts() public {
        address[] memory recipients = new address[](2);
        uint256[] memory shares     = new uint256[](2);
        recipients[0] = alice; shares[0] = 5_000;
        recipients[1] = bob;   shares[1] = 4_000; // only 9 000

        Milestone[] memory ms = _immediateMilestone(ONE_K);

        vm.prank(creator);
        vm.expectRevert(WhisperEscrow.InvalidShares.selector);
        escrow.createPayroll(address(token), recipients, shares, ms);
    }
}
