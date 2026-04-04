# Whisper Treasury Dashboard Redesign

## Context

Whisper is a private AI treasury agent operating on Base Sepolia with ZK-shielded transactions via Unlink. The current UI is chat-centric: a sidebar with chat history + vault balance on the left, and a full-width chat window as the main interaction surface. While functional for executing actions, it lacks a **position manager** — there is no way to see at a glance which payrolls have been paid, which escrows are active, what's coming up, or what happened this month.

This gap is critical for the ETH Global hackathon demo. Judges (Mike Krieger/CPO Anthropic, Gray Tan/YC, Boris Cherny/Head of Claude Code, Rahul Patil/CTO Anthropic, Kartik Talwar/ETH Global) will evaluate whether Whisper is a real treasury tool or a chat wrapper. The redesign transforms the app from "AI chatbot that can move money" into "treasury OS powered by AI."

## Design Direction

**Narrative Dashboard + Chat Sidecar** — a Stripe-meets-Linear dashboard as the home screen, with the AI chat sliding in from the right as a command panel. Positions are living cards with progress bars and narrative context. The chat is powerful but secondary to the treasury overview.

## App Shell

### Icon Rail (64px, left edge)

Replaces the current full sidebar. Vertical navigation with icon-only buttons:

| Position | Icon | Label | Route |
|----------|------|-------|-------|
| Top | W logo (36px, rounded, accent border) | — | `/` |
| 1 | Grid/dashboard icon | Dashboard | `/dashboard` |
| 2 | Chat bubble icon | Chat | Toggles sidecar |
| 3 | Layers icon | Positions | `/positions` |
| 4 | Users icon | Contacts | `/contacts` |
| Bottom | Gear icon | Settings | `/settings` |

**Active state:** `rgba(accent, 0.12)` background + 3px accent bar on left edge.
**Chat badge:** Green dot when agent is online.
**Interaction:** Dashboard, Positions, Contacts navigate to full-page views. Chat toggles the sidecar overlay.

### Top Bar

Left side:
- **Greeting:** Time-contextual ("Good morning/afternoon/evening"), font-size 22px, weight 600
- **Meta line:** Date + chain status with green pulse dot ("April 4, 2026 · Base Sepolia")

Right side:
- **Testnet badge:** Uppercase, `rgba(accent, 0.08)` background, accent text
- **Balance chip:** Shield icon (◈) + animated balance (reuse `AnimatedBalance` component) + token label + truncated address. Background: `rgba(accent, 0.06)`, border: `rgba(accent, 0.12)`.

### Quick Actions Bar

Horizontal row of action buttons below the top bar:
- **Transfer** (→), **Run Payroll** (◷), **Create Escrow** (⊡), **Verify Income** (◈), **Swap** (⇄)
- Each button: `bg-surface-2`, `border-border`, rounded-10px, 13px text
- **On click:** Opens chat sidecar with the action pre-filled as a prompt. E.g., clicking "Run Payroll" slides the chat in with "Run payroll for..." in the input.

## Dashboard View (`/dashboard`)

The default home screen. Composed of 4 sections stacked vertically:

### 1. Monthly Stats Row

4 stat cards in a horizontal grid:

| Card | Value Source | Example |
|------|-------------|---------|
| Total Moved | Sum of all `usdcMoved` from conversations this month | `1,247 USDC` |
| Transactions | Count of tool calls (private_transfer, private_swap, etc.) this month | `23` with subtitle "6 payrolls · 4 escrows" |
| Active Positions | Count of strategies with status `active` + active escrows | `4` with subtitle "2 payrolls · 1 escrow · 1 vesting" |
| Privacy Score | % of transactions that were private (via Unlink) vs public | `94%` with "All transfers shielded" |

Each card: `bg-surface-2`, `border-border`, rounded-12px, 16px padding.
Value: 22px, weight 600, tabular-nums.
Change line: 11px, green for positive, neutral for informational.

**Data source:** Query SQLite `messages` table, parse `tool_calls` JSON to count/sum by type and month. Strategy files provide budget and execution data.

### 2. Active Positions Grid

3-column grid of position cards. Each card type has a distinct color treatment:

#### Payroll Card (green tones)
- **Background:** `linear-gradient(135deg, rgba(74,222,128,0.06), rgba(74,222,128,0.02))`
- **Border:** `rgba(74,222,128,0.15)`, hover: `0.3`
- **Header:** "PAYROLL" type label (green) + "● Running" status
- **Title:** Strategy name (e.g., "Engineering Team Weekly")
- **Subtitle:** Recipient count + schedule + privacy level
- **Progress bar:** Green fill, width = `spent / totalBudget * 100`
- **Footer:** "$X of $Y budget spent"
- **Recipient avatars:** Stacked circles with first letter, shifted left by -6px

**Data source:** `agent/data/strategies/*.json` — filter by `status: 'active'`, `type: 'standard'`

#### Escrow Card (amber tones)
- **Background:** `linear-gradient(135deg, rgba(251,191,36,0.06), rgba(251,191,36,0.02))`
- **Border:** `rgba(251,191,36,0.15)`
- **Header:** "ESCROW" type label (amber) + "◎ Watching" status
- **Title:** Recipient ENS name or address
- **Subtitle:** Locked amount + trigger condition (e.g., "Release: ETH > $4,000")
- **Progress bar:** Amber fill, width = `currentPrice / triggerPrice * 100` (capped at 100)
- **Footer:** "ETH at $X,XXX — Y% to trigger"

**Data source:** The `/api/positions` route calls the agent's `check_escrow` tool server-side (importing from `agent/src/tools.ts`) to fetch on-chain escrow state including milestone conditions and oracle prices. No new contract interaction needed — reuses existing `checkEscrow` logic.

#### Verification Card (accent blue tones)
- **Background:** `linear-gradient(135deg, rgba(accent,0.06), rgba(accent,0.02))`
- **Border:** `rgba(accent,0.15)`
- **Header:** "VERIFICATION" type label (blue) + "◈ Active" status
- **Title:** ENS name
- **Subtitle:** "Income verified · ZK proof on-chain"
- **Proof badge:** Truncated proof hash in accent pill
- **Footer:** "Last verified: X ago"

**Data source:** ENS text records via `/api/verify/[name]` route.

#### Completed Card (neutral)
- **Background:** `bg-surface-2`
- **Border:** `border-border`
- **Header:** Type label (dimmed) + "✓ Completed" status
- **All text dimmed** (text-3 color)

**Data source:** Strategies with `status: 'completed'` or escrows with all milestones released.

### 3. Recent Activity Feed

Full-width list in a rounded container. Each row:
- **Icon:** 32px rounded square, color-coded (green=success, amber=pending, blue=info, neutral=transfer)
- **Title:** Action description ("Payroll executed — alice, bob")
- **Detail:** Context line ("2 private transfers · Engineering Team Weekly")
- **Amount:** Right-aligned, tabular-nums
- **Time:** Relative timestamp

**Data source:** Parse `tool_calls` from SQLite messages, sorted by `created_at` descending. Map tool names to activity types:
- `private_transfer` / `batch_private_transfer` → Transfer (→ icon)
- `schedule_payroll` + `execute_strategy` → Payroll (✓ icon)
- `create_escrow` → Escrow (⊡ icon)
- `verify_payment_proof` → Verification (◈ icon)
- `private_swap` → Swap (⇄ icon)
- `deposit_to_unlink` → Deposit (↓ icon)

## Chat Sidecar

A 420px-wide panel that slides in from the right edge of the screen.

### Trigger Points
1. **Chat icon** in the icon rail
2. **Quick action buttons** (pre-fill the input with the action prompt)
3. **Keyboard shortcut:** `/` key or `Cmd+K`
4. **Position card click** → opens chat with context ("Tell me about the Engineering Team Weekly payroll")

### Layout
- **Header:** W avatar + "Whisper Agent" + online status + close button (✕)
- **Messages area:** Scrollable, flex-end alignment (newest at bottom)
  - User messages: right-aligned, `bg-surface-3`, rounded with flat bottom-right
  - Assistant messages: left-aligned, `rgba(accent, 0.06)` bg, accent border, flat bottom-left
  - Tool pills: Green-tinted pills showing tool name + duration (e.g., "✓ private_transfer — 1.2s")
- **Input area:** Bottom-pinned, `bg-surface-1`, accent border on focus, send button

### Behavior
- **Slide animation:** `transform: translateX(100%)` → `translateX(0)`, 300ms ease-out
- **Backdrop:** Optional subtle darkening of dashboard (rgba(0,0,0,0.2))
- **State persistence:** Chat history persists across open/close. New conversations via "New Chat" in the panel.
- **Dashboard updates:** When the chat executes a tool (e.g., payroll), the dashboard position cards and activity feed update in real-time. Implementation: use SWR with `mutate()` — after a tool_call completes, call `mutate('/api/positions')`, `mutate('/api/activity')`, `mutate('/api/stats')` to trigger refetches.

### Chat History Access
When sidecar is open, a small "History" button in the header opens a dropdown of past conversations (reuses existing `ConversationSummary` data).

## Positions View (`/positions`) — Stretch Goal

Full-page view for all positions with filtering and detail. Accessed via the Positions icon in the rail.

- **Filter tabs:** All | Payrolls | Escrows | Verifications | Completed
- **Position cards:** Same card components as dashboard, but in a 2-column grid with more detail
- **Click a card** → expands to show full detail:
  - For payrolls: execution history timeline, per-recipient breakdown, next scheduled run
  - For escrows: milestone timeline with release conditions, oracle price chart
  - For verifications: proof details, ENS record values

## Contacts View (`/contacts`) — Stretch Goal

Address book management. Leverages existing `agent/data/address-book.json`.

- **Contact list:** Name + address + last interaction
- **Click** → shows transaction history with that contact
- **Add contact** → form with ENS resolution

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `app/src/app/dashboard/page.tsx` | Dashboard view (replaces current `/dashboard` demo page) |
| `app/src/components/IconRail.tsx` | Vertical nav rail component |
| `app/src/components/PositionCard.tsx` | Position card component (payroll/escrow/verification/completed variants) |
| `app/src/components/ActivityFeed.tsx` | Activity list component |
| `app/src/components/StatsRow.tsx` | Monthly stats cards row |
| `app/src/components/QuickActions.tsx` | Quick action buttons |
| `app/src/components/ChatSidecar.tsx` | Slide-out chat panel (refactored from chat/page.tsx) |
| `app/src/app/api/positions/route.ts` | API: aggregate position data from strategies + escrows |
| `app/src/app/api/activity/route.ts` | API: parse tool_calls into activity feed items |
| `app/src/app/api/stats/route.ts` | API: monthly stats aggregation |

### Modified Files
| File | Changes |
|------|---------|
| `app/src/app/layout.tsx` | Add IconRail to root layout, adjust grid |
| `app/src/app/globals.css` | Add position card styles, sidecar animations, stat card styles |
| `app/src/app/chat/page.tsx` | Refactor chat logic into reusable ChatSidecar component |
| `tailwind.config.ts` | Add animation keyframes for sidecar slide, card hover |

### Reuse Existing
| Component | Reuse For |
|-----------|-----------|
| `AnimatedBalance.tsx` | Balance chip in top bar |
| `ToolCallCard.tsx` | Tool execution display in chat sidecar |
| `ChatMessage.tsx` | Message rendering in sidecar |
| `ChatSidebar.tsx` logic | Chat history management (refactored) |
| `lib/db.ts` | All database queries |

## Data Flow

```
Dashboard Load:
  1. GET /api/positions → reads strategy files + on-chain escrow data
  2. GET /api/activity → parses tool_calls from SQLite messages
  3. GET /api/stats → aggregates monthly totals from messages
  4. GET /api/balances → existing balance endpoint

Chat Sidecar Execute:
  1. User sends message via sidecar
  2. POST /api/agent → streams tool calls + response
  3. On tool_call event → update activity feed + position cards via shared state
  4. Dashboard re-fetches affected data
```

## Verification Plan

1. **Build check:** `cd app && npm run build` — no TypeScript errors
2. **Visual verification:** Start dev server, navigate to `/dashboard`, verify:
   - Icon rail renders with correct active states
   - Stats row shows data from API (or placeholder if no data)
   - Position cards render with correct color treatments per type
   - Activity feed shows recent transactions
   - Quick actions open chat sidecar with pre-filled prompts
3. **Chat sidecar:** Click chat icon → sidecar slides in → send a message → tool execution displays → sidecar closes → dashboard updates
4. **Responsive:** Verify layout on 1280px+ screens (primary target for hackathon demo)
5. **Existing functionality:** Verify the chat still works end-to-end (message → agent → tool execution → response)
