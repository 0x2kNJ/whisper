# ADR-003: Direct Agent Signing Over Smart Account Capabilities

## Status
Accepted

## Context
Whisper's AI agent needs to execute on-chain transactions (transfers, swaps, escrow creation). The agent must make decisions autonomously, sign transactions, and broadcast them to the network.

Two patterns exist for agent-controlled assets: direct key signing and capability-based smart accounts (ERC-4337 with smart account kernels like Safe modules). The choice affects how secure, auditable, and decentralized the system becomes.

## Decision
Use direct private key signing. The agent holds a private key, signs transactions directly, and broadcasts them. No ERC-4337 smart account. No capability-based kernel.

Rationale:
- **Hackathon timeline:** Smart accounts add 2-3 days of integration work with no visible demo benefit
- **Auditability:** Private key signatures are transparent and easy to verify
- **Simplicity:** One signing method, no account abstraction complexity
- **Clear responsibility:** The agent's actions are directly its own (not hidden behind account logic)
- **Proven pattern:** Most trading bots and agents work this way

## Alternatives Considered

**ERC-4337 Smart Account + Capability Kernel (Rejected)**
- Pros: Industry best practice for production systems; enables batched transactions; granular permission controls; recovery mechanisms; can revoke specific capabilities
- Cons: High complexity (4337 paymaster, bundler, entry point); requires Safe or custom kernel implementation; adds 2-3 days of integration; hard to debug in a hackathon; no visual benefit for demo; audit burden

**Hardware Wallet / Cold Storage Signing (Rejected)**
- Pros: Maximum security; private key never in memory
- Cons: Incompatible with AI agent autonomy; requires human approval per transaction; defeats the purpose of an autonomous agent

## Consequences

**Positive:**
- Fast integration and demo
- Easy to understand and audit (simple cryptographic signatures)
- Full transparency into agent actions
- Minimal dependencies (no bundler, no paymaster, no kernel)
- Clear error messages if signing fails

**Negative:**
- Single point of failure: if the private key is compromised, attacker can drain all assets
- No granular permission controls (agent can do anything with the funds)
- No transaction batching (each action is a separate transaction)
- No recovery mechanisms if key is lost
- Not production-ready security posture

**Security Notes:**
- Private key stored in environment variables (for demo)
- Future work: migrate to Safe module or kernel-based capabilities before mainnet
- Immediate recommendation: use with small test amounts only
- Plan: set up key rotation and monitoring

**Migration Path:**
- Once mainnet deployment is planned, implement ERC-4337 Safe module
- Safe module can sign on behalf of the agent with granular controls
- Seamless upgrade path: same agent code, different signing backend
