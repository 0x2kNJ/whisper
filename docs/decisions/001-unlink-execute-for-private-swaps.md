# ADR-001: Use Unlink execute() for Private DeFi Swaps

## Status
Accepted

## Context
Whisper needs to execute token swaps on behalf of users while maintaining privacy of the transaction sender. The system must swap tokens via Uniswap to enable payroll in any token, but the on-chain visibility of swap transactions creates a privacy leakage risk.

Without a privacy solution, the transaction sender's address would be publicly visible on-chain, defeating the purpose of a private treasury agent.

## Decision
Use Unlink's `execute()` function to route swaps through the privacy layer. The function:
1. Withdraws tokens from the user's private balance in the Unlink contract
2. Calls external contracts (Uniswap router) on behalf of the user
3. Deposits swap outputs back into the user's private balance

This keeps the sender hidden from external contract observers while allowing interaction with public DeFi protocols.

## Alternatives Considered

**Direct Uniswap Swap (Rejected)**
- Pros: Simple, no additional contract calls
- Cons: Sender address is fully visible on-chain; competitors can track payment patterns; no privacy benefit

**Custom ZK Circuit (Rejected)**
- Pros: Maximum privacy, custom optimizations
- Cons: Hackathon timeline doesn't support circuit design; high complexity; introduces audit burden; Unlink already provides this capability

## Consequences

**Positive:**
- Sender identity hidden from on-chain observers
- Works with existing Uniswap router infrastructure
- All privacy logic lives in Unlink contract (audited, proven)
- Agent integration is straightforward (single tool call)

**Negative:**
- Recipient address, swap amount, and tokens remain visible in the swap transaction
- Pool contract appears as the sender on block explorers (may cause confusion)
- Depends on Unlink availability and correctness
- Swap routes through Unlink before hitting Uniswap (adds one contract call)

**Future Considerations:**
- Monitor gas costs of the extra contract call
- Consider batch swaps if privacy volume increases
- Evaluate private swap aggregators as alternatives mature
