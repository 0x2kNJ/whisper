// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/// @title  WhisperVault
/// @notice Simple USDC vault for the Whisper private AI treasury agent.
///         The owner deposits USDC; authorized agents can spend on behalf of the vault.
contract WhisperVault {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    address public immutable owner;
    IERC20  public immutable usdc;

    /// @notice Returns true if `agent` is authorized to call `spend`.
    mapping(address => bool) public agents;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Deposited(address indexed from, uint256 amount);
    event Authorized(address indexed agent);
    event Revoked(address indexed agent);
    event Spent(address indexed agent, address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error OnlyOwner();
    error OnlyAgent();
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyAgent() {
        if (!agents[msg.sender]) revert OnlyAgent();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _usdc) {
        owner = msg.sender;
        usdc  = IERC20(_usdc);
    }

    // -------------------------------------------------------------------------
    // Owner actions
    // -------------------------------------------------------------------------

    /// @notice Pull `amount` of USDC from the owner into this vault.
    ///         Caller must have approved this contract beforehand.
    function deposit(uint256 amount) external onlyOwner {
        bool ok = usdc.transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();
        emit Deposited(msg.sender, amount);
    }

    /// @notice Grant `agent` permission to call `spend`.
    function authorize(address agent) external onlyOwner {
        agents[agent] = true;
        emit Authorized(agent);
    }

    /// @notice Remove `agent`'s permission to call `spend`.
    function revoke(address agent) external onlyOwner {
        agents[agent] = false;
        emit Revoked(agent);
    }

    // -------------------------------------------------------------------------
    // Agent actions
    // -------------------------------------------------------------------------

    /// @notice Transfer `amount` of USDC from the vault to `to`.
    ///         Reverts if the vault balance is insufficient (ERC-20 will revert).
    function spend(address to, uint256 amount) external onlyAgent {
        bool ok = usdc.transfer(to, amount);
        if (!ok) revert TransferFailed();
        emit Spent(msg.sender, to, amount);
    }
}
