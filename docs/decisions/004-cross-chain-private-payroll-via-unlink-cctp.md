# ADR-004: Cross-Chain Private Payroll via Unlink + CCTP

## Status
Implemented — CCTP V2 (TokenMessengerV2, domain 26)

## Context
Whisper needs to execute payroll across chains (Base Sepolia → Arc Testnet). CCTP V2 enables native USDC transfers between chains. However, a standard CCTP transfer exposes the sender address on-chain.

Arc Testnet has CCTP V2 TokenMessengerV2 at `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA`.

## Decision
Use Unlink's `execute()` function to call CCTP's `depositForBurn()` from the private balance. This makes the CCTP sender appear as the Unlink pool contract, hiding the real sender.

### Flow
```
User deposits USDC → Unlink pool (Base Sepolia)
                       │
                       ▼
Unlink execute() withdraws USDC from private balance
                       │
                       ├─ calls USDC.approve(TokenMessenger, amount)
                       ├─ calls TokenMessenger.depositForBurn(amount, arcDomain, recipient, USDC)
                       │
                       ▼
CCTP burns USDC on Base Sepolia
                       │
                       ▼
CCTP mints USDC on Arc Testnet → recipient address
                       │
                       ▼
Recipient uses USDC on Arc (WhisperEscrow, direct spend, etc.)
```

### What's Private
- **Sender:** Hidden. On-chain sender is the Unlink pool contract, not the user.
- **Intent:** The fact that a cross-chain transfer is happening is visible (burn event on Base Sepolia, mint on Arc), but who initiated it is not.

### What's NOT Private
- **Recipient:** The Arc-side recipient address is visible in the CCTP mint event.
- **Amount:** The transferred amount is visible in both burn and mint events.
- **Destination chain:** The CCTP domain ID reveals the target chain.

### Implementation (agent tool)
```typescript
// private_cross_chain_transfer tool — CCTP V2 (TokenMessengerV2)
// depositForBurn has 7 params in V2: amount, destinationDomain, mintRecipient,
// burnToken, destinationCaller, maxFee, minFinalityThreshold
const cctpCall = encodeFunctionData({
  abi: TokenMessengerV2ABI,
  functionName: 'depositForBurn',
  args: [
    amount,
    26,                  // Arc Testnet domain
    mintRecipient,       // bytes32-padded recipient
    USDC,
    bytes32(0),          // destinationCaller: permissionless
    0,                   // maxFee: 0 for testnet
    0,                   // minFinalityThreshold: default
  ]
})

return unlink.execute({
  withdrawals: [{ token: USDC, amount }],
  calls: [
    approve(USDC, CCTP_TOKEN_MESSENGER_V2, amount),
    { to: CCTP_TOKEN_MESSENGER_V2, data: cctpCall }
  ],
  outputs: [],
  deadline: now + 3600
})
```

## Alternatives Considered

1. **Direct CCTP transfer (no privacy):** Simple but sender is fully exposed on-chain.
2. **Bermuda private messaging layer:** More comprehensive privacy (hides intent, routing, and amount) but requires integration with a separate protocol not available at hackathon.
3. **Bridge + Unlink on destination:** Deposit into Unlink on Arc instead of Base Sepolia. Arc doesn't have Unlink — not possible.

## Consequences

**Positive:**
- Cross-chain payroll with sender privacy using existing infrastructure
- No new protocol integration needed — Unlink execute() + CCTP are both live
- Enables "pay anyone on Arc privately from Base Sepolia" use case
- Strengthens Arc bounty narrative: private cross-border USDC payroll

**Negative:**
- Recipient and amount still visible on Arc side
- CCTP settlement time adds latency vs direct Arc transfer
- Unlink execute() gas costs are higher than direct CCTP calls
