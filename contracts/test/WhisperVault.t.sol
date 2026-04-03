// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {WhisperVault} from "../src/WhisperVault.sol";

// ---------------------------------------------------------------------------
// Minimal MockERC20 — no dependencies, no extra imports
// ---------------------------------------------------------------------------

contract MockERC20 {
    string  public name     = "Mock USDC";
    string  public symbol   = "USDC";
    uint8   public decimals = 6;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply    += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from]           >= amount, "ERC20: insufficient balance");
        require(allowance[from][msg.sender] >= amount, "ERC20: insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        return true;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

contract WhisperVaultTest is Test {
    MockERC20    internal usdc;
    WhisperVault internal vault;

    address internal owner  = address(this);
    address internal agent  = makeAddr("agent");
    address internal rando  = makeAddr("rando");
    address internal recipient = makeAddr("recipient");

    uint256 internal constant DEPOSIT_AMOUNT = 1_000e6;  // 1 000 USDC
    uint256 internal constant SPEND_AMOUNT   =   500e6;  //   500 USDC

    function setUp() public {
        usdc  = new MockERC20();
        vault = new WhisperVault(address(usdc));

        // Give the owner plenty of mock USDC and pre-approve the vault
        usdc.mint(owner, 10_000e6);
        usdc.approve(address(vault), type(uint256).max);
    }

    // -----------------------------------------------------------------------
    // test_deposit
    // -----------------------------------------------------------------------

    function test_deposit() public {
        vault.deposit(DEPOSIT_AMOUNT);

        assertEq(usdc.balanceOf(address(vault)), DEPOSIT_AMOUNT);
        assertEq(usdc.balanceOf(owner), 10_000e6 - DEPOSIT_AMOUNT);
    }

    // -----------------------------------------------------------------------
    // test_authorize_and_spend
    // -----------------------------------------------------------------------

    function test_authorize_and_spend() public {
        vault.deposit(DEPOSIT_AMOUNT);
        vault.authorize(agent);

        assertTrue(vault.agents(agent));

        vm.prank(agent);
        vault.spend(recipient, SPEND_AMOUNT);

        assertEq(usdc.balanceOf(address(vault)), DEPOSIT_AMOUNT - SPEND_AMOUNT);
        assertEq(usdc.balanceOf(recipient),      SPEND_AMOUNT);
    }

    // -----------------------------------------------------------------------
    // test_unauthorized_spend_reverts
    // -----------------------------------------------------------------------

    function test_unauthorized_spend_reverts() public {
        vault.deposit(DEPOSIT_AMOUNT);

        vm.prank(rando);
        vm.expectRevert(WhisperVault.OnlyAgent.selector);
        vault.spend(recipient, SPEND_AMOUNT);
    }

    // -----------------------------------------------------------------------
    // test_revoke_agent
    // -----------------------------------------------------------------------

    function test_revoke_agent() public {
        vault.deposit(DEPOSIT_AMOUNT);
        vault.authorize(agent);
        vault.revoke(agent);

        assertFalse(vault.agents(agent));

        vm.prank(agent);
        vm.expectRevert(WhisperVault.OnlyAgent.selector);
        vault.spend(recipient, SPEND_AMOUNT);
    }

    // -----------------------------------------------------------------------
    // test_spend_exceeds_balance_reverts
    // -----------------------------------------------------------------------

    function test_spend_exceeds_balance_reverts() public {
        vault.deposit(DEPOSIT_AMOUNT);
        vault.authorize(agent);

        vm.prank(agent);
        vm.expectRevert("ERC20: insufficient balance");
        vault.spend(recipient, DEPOSIT_AMOUNT + 1);
    }
}
