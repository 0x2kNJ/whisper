# Whisper — Private AI Treasury Agent

> Say what you want to pay in English. Whisper handles the privacy, routing, and execution.

## The Problem

Every USDC payment your DAO makes is public. Competitors see your burn rate. Employees know each other's salaries. Vendors see your payment patterns. On-chain transparency is a feature — until it isn't.

## The Solution

Whisper is an AI treasury agent that makes private payments as simple as a conversation. Tell it who to pay and how much. It handles the privacy, the routing, and the execution.

## Why Privacy Matters

Every Whisper recipient who receives a private transfer gets an Unlink address. They can now send private payments themselves — even without Whisper. The privacy network grows with every payment.

## What We Heard

> "Everyone can see our burn rate. When we hired 3 engineers last quarter, our competitors knew before the announcement." — DAO treasury contributor

## How It Works

```
User (plain English) → Claude AI Agent (visible reasoning)
                          │
                          ├─ check_balance      → Unlink private balance
                          ├─ get_quote          → Uniswap Trading API
                          ├─ private_transfer   → Unlink (sender hidden)
                          ├─ private_swap       → Unlink execute() → Uniswap
                          ├─ create_escrow      → WhisperEscrow on Arc
                          └─ schedule_payroll   → Recurring private payments
```

## Built With

- **Unlink SDK** — Zero-knowledge privacy for all payments
- **Uniswap Trading API** — Optimal token routing and UniswapX gasless orders
- **Arc Testnet** — Programmable USDC payroll escrow with milestones
- **Claude AI (Anthropic)** — Natural language understanding with tool_use
- **Base Sepolia** — Testnet for privacy layer operations

## Quick Start

```bash
# Clone
git clone https://github.com/0x2kNJ/whisper.git
cd whisper

# Set up environment
cp .env.example .env
# Fill in your API keys

# Install agent dependencies
cd agent && npm install

# Run integration tests
npm run test-integrations

# Start the chat UI
cd ../app && npm install && npm run dev
```

## Project Structure

```
whisper/
├── contracts/          Foundry — WhisperVault + WhisperEscrow
├── agent/              AI agent — Claude tool_use + Unlink + Uniswap
├── app/                Next.js chat UI with streaming tool calls
└── docs/               Architecture decisions + plans
```

## Deployed Contracts

| Contract | Address | Chain | Explorer |
|----------|---------|-------|----------|
| WhisperVault | `0x86848019781cfd56A0483C17904a80Ca7C4F09B1` | Base Sepolia | [View](https://sepolia.basescan.org/address/0x86848019781cfd56A0483C17904a80Ca7C4F09B1) |
| WhisperEscrow | `0xf4e13a7d98A8Eb7945D937Fa33e5BBa287329eD6` | Arc Testnet | [View](https://testnet.arcscan.app/address/0xf4e13a7d98A8Eb7945D937Fa33e5BBa287329eD6) |

## Transaction Proof

Example operations executed on-chain:

| Operation | Tx Hash | Chain |
|-----------|---------|-------|
| WhisperEscrow Deploy | [`0x456920...`](https://testnet.arcscan.app/tx/0x456920048561473645ab154bff913a19a0b6385717e0de4434810948ef98ff13) | Arc Testnet |
| USDC Approval | [`0x7c96ed...`](https://testnet.arcscan.app/tx/0x7c96ed31157952d41da41a16be9259f82ac9b47bc46e72634016e9c0e429c3b2) | Arc Testnet |
| Escrow Payroll Creation | [`0x4919ff...`](https://testnet.arcscan.app/tx/0x4919ffe66f56814cae1b9ebb6720d75a0d7cad58d501da6d6ce06ed38342b8b0) | Arc Testnet |

## Future Work

- **Mainnet Deployment:** Migrate to Ethereum mainnet with production-grade key management
- **Multi-Sig Support:** Enable team control over treasury with threshold signatures
- **Cross-Chain Privacy:** Extend to other chains (Polygon, Arbitrum, Optimism) with atomic settlement
- **Mobile App:** Native iOS/Android app for receiving and sending private payments
- **Smart Account Migration:** Upgrade agent signing to Safe modules before production
- **Batch Payments:** Enable single transaction for multiple recipients

## Team

Built at ETHGlobal Cannes 2026.

## License

MIT
