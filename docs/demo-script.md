# Whisper — 3-Minute Demo Video Script

**Event:** ETHGlobal Cannes 2026
**Total runtime:** 3:00
**Format:** Screen recording with voiceover

---

## 0:00–0:15 — The Hook

**[VISUAL]** Split-screen. Left: raw Basescan transaction — a wall of hex, `0x012b697a55077aadcf983147f7da4c496ee8b2d607f95c84b3c89474fa81d920`. Right: the same transaction, decrypted — "Pay Alice 2,000 USDC."

**[VO]**
> "This is the same transaction. Two very different views. This is Whisper."

---

## 0:15–0:45 — The Problem

**[VISUAL]** Slowly pan over a public Etherscan page. Address labels. Transfer amounts. Timestamps. Nothing hidden.

**[VO]**
> "Every on-chain payment is a public confession. Your competitors see your burn rate. Your employees know each other's salaries. Your vendors can map every relationship in your treasury.
>
> On-chain transparency is a feature — until it isn't."

---

## 0:45–1:30 — Live Agent Demo

**[VISUAL]** Switch to the Whisper `/chat` interface. Cursor appears in the input field.

**[VO]**
> "Here's Whisper in action."

**[VISUAL]** User types and submits:
> "Pay my team privately: Alice 2k USDC, Bob 1.5k USDC, Charlie 1k USDC"

**[VISUAL — Agent reasoning streams live on screen]**

1. **Contact lookup** — Agent resolves "Alice," "Bob," "Charlie" from the on-chain address book. Three wallet addresses populate.

2. **Execution plan appears** — A three-step plan card renders:
   - Step 1: Transfer 2,000 USDC to Alice — `ON-CHAIN`
   - Step 2: Transfer 1,500 USDC to Bob — `ON-CHAIN`
   - Step 3: Transfer 1,000 USDC to Charlie — `ON-CHAIN`

**[VO]**
> "The agent shows its work before touching any funds. You confirm once."

3. **User clicks Confirm.**

4. **Tool call cards stream in sequence:**
   - `check_balance` — balance confirmed
   - `private_transfer` → Alice ✓
   - `private_transfer` → Bob ✓
   - `private_transfer` → Charlie ✓

5. **Privacy summary renders:**
   > "3 payments sent. Total: 4,500 USDC. On-chain, all anyone sees is a pool deposit."

---

## 1:30–2:00 — The Privacy Proof

**[VISUAL]** Open Basescan for the batch transaction. Zoom in on the key fields.

**[VO]**
> "Here's the transaction on Base Sepolia. Notice what you *don't* see.
>
> No sender. No recipient. No amount. The payment entered Unlink's privacy pool — and that's all the chain recorded.
>
> That's Unlink."

**[VISUAL]** Cut back to the `/privacy` page. Split-screen returns — encrypted hex on the left, decrypted payroll instruction on the right. Full-circle visual.

---

## 2:00–2:20 — Arc Escrow

**[VISUAL]** Switch to the `/chat` interface. User types:
> "Release Dave's 5k bonus when ETH crosses $4,000"

**[VO]**
> "But what about conditional payroll? Whisper supports that too."

**[VISUAL]** Agent creates an escrow on Arc Testnet. An escrow card appears in the UI showing:
- Recipient: Dave
- Amount: 5,000 USDC
- Release condition: ETH/USD > $4,000
- Status: LOCKED

**[VISUAL]** Switch to Arcscan. The live `WhisperEscrow` contract at `0xf4e13a7d98A8Eb7945D937Fa33e5BBa287329eD6` is visible with the new escrow entry.

**[VO]**
> "The escrow is live on-chain. When the condition is met, it releases automatically — no one has to remember."

---

## 2:20–2:40 — Encrypted Messaging

**[VISUAL]** Show the raw transaction on Basescan: `0x012b697a55077aadcf983147f7da4c496ee8b2d607f95c84b3c89474fa81d920`. The `input data` field shows a long hex blob — ciphertext.

**[VO]**
> "The payroll instruction itself is encrypted and stored on-chain. An observer sees ciphertext. Only the treasurer with the correct keypair can decrypt it."

**[VISUAL]** Decrypt button pressed in the `/privacy` UI. The hex resolves instantly to readable text: "Pay Alice 2,000 USDC."

**[VO]**
> "NaCl asymmetric encryption — the same cryptography securing Signal. On-chain. Permanent. Yours."

---

## 2:40–2:55 — The Stack

**[VISUAL]** Quick flash montage — each technology logo or name appears for ~2 seconds with a one-line label:

- **Unlink** — Privacy layer (sender, recipient, amount hidden)
- **Uniswap Trading API** — Optimal token routing + UniswapX gasless orders
- **Arc Testnet** — Programmable USDC escrow with release conditions
- **Claude AI (Anthropic)** — Natural language → tool_use → execution
- **Base Sepolia** — Settlement chain

**[VISUAL]** Code snippet flashes on screen — three snippets in sequence, each for ~1.5 seconds:

```ts
// The agentic loop — 5 lines
for await (const event of agent.stream(message)) {
  if (event.type === "tool_use") yield formatToolCard(event);
  if (event.type === "text") yield formatText(event);
}
```

```ts
// Execute a private transfer
await unlink.execute({ to: alice, amount: 2000n, token: USDC });
```

```ts
// Encrypt a payroll instruction
const cipher = nacl.box(message, nonce, recipientPubKey, senderSecretKey);
```

---

## 2:55–3:00 — Close

**[VISUAL]** Whisper wordmark fades in. Clean dark background.

**[VO]**
> "Whisper. Private payments as simple as a conversation."
>
> "Built at ETHGlobal Cannes."

**[VISUAL]** Three lines appear on screen:

- GitHub: `github.com/0x2kNJ/whisper`
- Live Demo: `app-gamma-one-12.vercel.app`
- Team: [team names]

**[VISUAL]** Fade to black.

---

## Production Notes

- **Tone:** Calm, confident. No hype. Let the demo speak.
- **Pacing:** Give each tool card 1–2 seconds to render visibly — don't rush the streaming animation.
- **Privacy page split-screen:** Use the actual `/privacy` route at `https://app-gamma-one-12.vercel.app/privacy`. The visual contrast is the core of the hook and the close.
- **Basescan link for proof segment:** `https://sepolia.basescan.org/tx/0x012b697a55077aadcf983147f7da4c496ee8b2d607f95c84b3c89474fa81d920`
- **Music:** Sparse, lo-fi. Nothing that competes with the VO.
