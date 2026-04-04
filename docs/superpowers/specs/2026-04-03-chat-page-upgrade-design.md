# Chat Page Upgrade: Real Balances, Chat History, Glass UI

**Date:** 2026-04-03
**Status:** Approved

## Overview

Upgrade the Whisper treasury agent chat page with three improvements:
1. Real balances fetched via agent's `getBalances()` through a dedicated API route
2. Persistent chat history stored in SQLite with full CRUD
3. Glassmorphism UI overhaul for a premium "liquid" feel

## Layout: Two-Column with Smart Sidebar

**Left sidebar (280px):**
- Top: Whisper logo (clickable, links to `/dashboard`) + "New Chat" button
- Middle: Chat history list (scrollable, primary interaction area)
- Bottom: Real balances panel (compact, always visible)

**Main area:**
- Header bar: "Treasury Agent" + network badge + online status
- Chat messages area (unchanged structure, enhanced styling)
- Input bar (unchanged)

**Mobile:**
- Sidebar becomes a slide-out drawer (hamburger trigger in header)
- Balances collapse into horizontal scroll strip at top of chat

## Real Balances — `/api/balances`

**New route:** `app/src/app/api/balances/route.ts`

- Imports `getBalances()` directly from `agent/src/unlink.ts` using the same dynamic import pattern as `/api/agent/route.ts`
- Returns: `{ wallet: string, balances: [{ symbol: string, balance: string, chain: string }] }`
- Wallet address read from agent's `PRIVATE_KEY` env var (derived via viem `privateKeyToAccount`)
- No caching — always fresh (testnet)
- No LLM round-trip, no token cost

**Frontend fetch triggers:**
- On component mount
- After every agent `done` SSE event (balances may change after transfers/swaps)

**Balance display:**
- Compact cards in sidebar bottom section
- Brief opacity fade animation when values refresh

## Chat History — SQLite

**Package:** `better-sqlite3` (synchronous, zero-config, file-based)

**DB file:** `app/data/whisper.db` (gitignored)

**Schema:**

```sql
CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text            TEXT NOT NULL DEFAULT '',
  tool_calls      TEXT DEFAULT '[]',
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

**API routes:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/conversations` | List all conversations, sorted by `updated_at` desc |
| POST | `/api/conversations` | Create new conversation, returns `{ id, title }` |
| GET | `/api/conversations/[id]` | Get conversation with all messages |
| DELETE | `/api/conversations/[id]` | Delete conversation and its messages |

**Flow:**
1. User sends first message in a new chat -> `POST /api/conversations` creates a conversation with title derived from first message (truncated to ~50 chars)
2. Each user + assistant message pair saved after the agent `done` SSE event via a new `POST /api/conversations/[id]/messages` endpoint
3. Loading an existing conversation: `GET /api/conversations/[id]` returns all messages, `agentHistory` is reconstructed from them
4. Sidebar conversation list fetched on mount and after each new conversation is created

**Title generation:** First user message, truncated to 50 chars with ellipsis. No LLM summarization.

## Glass UI Design

**Principle:** Glass on the sidebar only. Chat area stays deep black. One frosted surface against dark background creates depth.

**Sidebar:**
- `background: rgba(10, 10, 10, 0.6)`
- `backdrop-filter: blur(24px)` (`backdrop-blur-xl`)
- `border-right: 1px solid rgba(255, 255, 255, 0.06)`
- `box-shadow: inset 0 0 60px rgba(200, 216, 255, 0.03)` (subtle inner glow)

**Balance cards:**
- `background: rgba(255, 255, 255, 0.03)`
- `border: 1px solid rgba(255, 255, 255, 0.06)`
- Hover: border to `rgba(200, 216, 255, 0.12)`
- Token amounts: `text-shadow: 0 0 20px rgba(200, 216, 255, 0.15)`

**Chat history items:**
- Default: transparent, `text-zinc-500`
- Hover: `rgba(255, 255, 255, 0.04)` background
- Active: `rgba(200, 216, 255, 0.06)` background + left border `2px solid rgba(200, 216, 255, 0.3)`

**New Chat button:**
- Ghost: transparent, `border: rgba(255, 255, 255, 0.08)`
- Hover: `rgba(200, 216, 255, 0.06)` fill + accent border

**Back to dashboard:**
- Whisper logo in sidebar header is clickable -> `/dashboard`

**Micro-animations:**
- All sidebar items: `transition-all duration-200`
- Balance refresh: brief opacity dip on value change
- New conversation: `animate-slide-up`

**Unchanged:** Space Grotesk font, `#c8d8ff` accent, message formatting, tool call cards, input bar, thinking indicator.

## Files to Create

| File | Purpose |
|------|---------|
| `app/src/lib/db.ts` | SQLite connection + schema init |
| `app/src/app/api/balances/route.ts` | Balance fetching endpoint |
| `app/src/app/api/conversations/route.ts` | List + create conversations |
| `app/src/app/api/conversations/[id]/route.ts` | Get + delete conversation |
| `app/src/app/api/conversations/[id]/messages/route.ts` | Save message pair |

## Files to Modify

| File | Changes |
|------|---------|
| `app/src/app/chat/page.tsx` | New layout, sidebar with history + balances, fetch real balances, conversation state management, glass UI styles |
| `app/src/lib/config.ts` | Remove `PLACEHOLDER_BALANCES` and `PLACEHOLDER_WALLET` (replaced by real data) |
| `app/src/components/NavBar.tsx` | May need updates if chat page no longer uses it |
| `app/package.json` | Add `better-sqlite3` + `@types/better-sqlite3` |
| `app/.gitignore` | Add `data/` directory |

## Out of Scope

- LLM-powered conversation title summarization
- Search within chat history
- Conversation sharing or export
- Multi-user / auth
- Balance history or charts
- Real wallet connector (MetaMask/WalletConnect)
