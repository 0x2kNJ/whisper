# Whisper -- 3-Minute Demo Script

**Event:** ETHGlobal Cannes 2026
**Total runtime:** 3:00
**Format:** Live demo with voiceover

---

## 0:00-0:15 -- The Hook

**[VISUAL]** Open the Whisper dashboard. Treasury allocation bar, position cards, quick action buttons visible.

**[VO]**
> "Every on-chain payment is a public confession. Your competitors see your burn rate. Your employees know each other's salaries. Whisper makes that invisible."

---

## 0:15-0:45 -- Beat 1: The Result (pre-built)

**[VISUAL]** Point at the "Cross-Chain Engineering Payroll" card on the dashboard. 2 recipients, monthly, private. A and B avatars.

**[VO]**
> "This payroll already ran. Alice and Bob got paid. The sender is hidden -- on-chain, the transaction came from the Unlink ZK pool, not our wallet."

**[VISUAL]** Click "Verify Alice" on the position card. The verify page loads: Income Verified banner, payment details, ZK proof hash, verified vs hidden sections.

**[VO]**
> "Alice can share this link with anyone -- a landlord, a lender, a hiring manager. It proves she was paid without revealing the amount, the sender, or any other recipients. ZK proof, on-chain, verifiable by anyone."

---

## 0:45-1:30 -- Beat 2: Live Transfer

**[VISUAL]** Navigate back to dashboard. Click "Transfer Funds" quick action. Chat sidecar slides open with pre-filled prompt.

**[VO]**
> "Now watch it happen live."

**[VISUAL]** Send: "Pay alice.whisper.eth 0.001 USDC privately"

**[VISUAL]** Agent streams:
1. Tool call card: `private_transfer` fires
2. Result: table with Name, Amount, Status, Verify link
3. Privacy summary: "All payments ZK-shielded"

**[VO]**
> "One sentence. Claude resolves the ENS name, routes through Unlink's privacy pool, executes the ZK proof, and generates a verification link. The whole thing takes 10 seconds."

**[VISUAL]** Dashboard updates automatically -- balance changes, activity feed shows new transfer.

---

## 1:30-2:00 -- Beat 3: Run Payroll

**[VISUAL]** Click "Run Payroll" quick action. Sidecar pre-fills: "Run payroll: alice and bob -- 0.001 USDC each"

**[VISUAL]** Agent executes batch transfer. Results table shows both alice and bob with verify links.

**[VO]**
> "Multi-recipient payroll in one command. Both payments shielded in a single ZK proof. On-chain, an observer sees one pool transaction. They can't tell how many people got paid, how much, or who sent it."

---

## 2:00-2:20 -- Beat 4: Smart Escrow

**[VISUAL]** Click "Bonus Pay" quick action. Sidecar pre-fills: "Create escrow for alice: 0.01 USDC bonus, release when Alice hits $20 in sales"

**[VO]**
> "Conditional payroll. This locks funds in a smart contract on Arc Testnet. When the condition is met, it releases automatically."

**[VISUAL]** Agent creates escrow. Result table shows escrow ID, chain (Arc Testnet), conditions, tx hash linking to Arcscan.

---

## 2:20-2:40 -- The Architecture

**[VISUAL]** Quick flash of the architecture -- either the README diagram or a slide.

**[VO]**
> "Four layers. Claude agent with 25 tools. Unlink ZK pool for privacy. Circle CCTP V2 for cross-chain bridging. Arc Testnet for smart escrow. The agent chains them automatically based on what you ask."

---

## 2:40-3:00 -- Close

**[VISUAL]** Dashboard in full view.

**[VO]**
> "Private payments as simple as a conversation. Built on Claude, Unlink, Arc, Uniswap, and Base."

---

## Tips

- **Don't rush the tool call cards.** Let them render for 1-2 seconds. The streaming animation is the money shot for the Anthropic judges.
- **Pre-fund the Unlink pool** before the demo. Run `deposit_to_unlink` with 0.05 USDC.
- **Start on the dashboard**, not the chat page. The dashboard is more impressive as a first impression.
- **If CCTP is asked about:** "The cross-chain payroll tool bridges via CCTP V2, but attestation takes a few minutes on testnet, so we're showing a completed one."
- **Tone:** Calm, confident. Let the demo speak.
