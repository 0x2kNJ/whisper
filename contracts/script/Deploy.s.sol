// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {WhisperVault}    from "../src/WhisperVault.sol";

/// @notice Deploys WhisperVault (and records the future WhisperEscrow address).
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL \
///     --broadcast \
///     --verify \
///     -vvvv
///
/// Environment variables:
///   USDC_ADDRESS   — USDC token on the target network
///                    Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
contract Deploy is Script {
    // Base Sepolia USDC (circle test token)
    address constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        address usdc = vm.envOr("USDC_ADDRESS", BASE_SEPOLIA_USDC);

        vm.startBroadcast();

        WhisperVault vault = new WhisperVault(usdc);
        console.log("WhisperVault deployed at:", address(vault));

        // WhisperEscrow is a placeholder for the next contract in the suite.
        // Deploy it here when the implementation is ready and authorize it as
        // an agent so it can request funds from the vault:
        //
        //   WhisperEscrow escrow = new WhisperEscrow(address(vault), usdc);
        //   vault.authorize(address(escrow));
        //   console.log("WhisperEscrow deployed at:", address(escrow));

        vm.stopBroadcast();
    }
}
