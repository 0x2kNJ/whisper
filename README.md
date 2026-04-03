# Whisper — Private AI Treasury Agent

> Say what you want to pay in English. Whisper handles the privacy, routing, and execution.

## The Problem

Every USDC payment your DAO makes is public. Competitors see your burn rate. Employees know each other's salaries. Vendors see your payment patterns. On-chain transparency is a feature — until it isn't.

## The Solution

Whisper is an AI treasury agent that makes private payments as simple as a conversation. Tell it who to pay and how much. It handles the privacy, the routing, and the execution.

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

## Team

Built at ETHGlobal Cannes 2026.

## License

MIT
