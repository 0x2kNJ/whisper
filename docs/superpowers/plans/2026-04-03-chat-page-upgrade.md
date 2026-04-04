# Chat Page Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the chat page with real blockchain balances, persistent SQLite chat history, and a glassmorphism UI overhaul.

**Architecture:** Two-column layout — a glass sidebar (chat history + balances) and the main chat area. Balances fetched via a dedicated `/api/balances` route that calls the agent's Unlink SDK directly. Chat history persisted in SQLite via `better-sqlite3` with full CRUD API routes. Glass UI applied to the sidebar only; chat area stays deep black.

**Tech Stack:** Next.js 14, React 18, Tailwind CSS 3, better-sqlite3, viem (already in agent)

---

## File Map

**Create:**
| File | Responsibility |
|------|---------------|
| `app/src/lib/db.ts` | SQLite connection singleton + schema initialization |
| `app/src/app/api/balances/route.ts` | GET handler — fetches real balances from Unlink SDK |
| `app/src/app/api/conversations/route.ts` | GET (list) + POST (create) conversations |
| `app/src/app/api/conversations/[id]/route.ts` | GET (with messages) + DELETE conversation |
| `app/src/app/api/conversations/[id]/messages/route.ts` | POST — save a message pair |
| `app/src/components/AnimatedBalance.tsx` | Animated count-up number display component |
| `app/src/components/ChatSidebar.tsx` | Glass sidebar: logo, new chat, history list, balances |

**Modify:**
| File | Changes |
|------|---------|
| `app/package.json` | Add `better-sqlite3` + `@types/better-sqlite3` |
| `app/next.config.mjs` | Add `better-sqlite3` to `serverComponentsExternalPackages` |
| `app/.gitignore` | Add `data/` |
| `app/src/lib/config.ts` | Remove `PLACEHOLDER_BALANCES` and `PLACEHOLDER_WALLET`, add `BALANCES_ENDPOINT` and `CONVERSATIONS_ENDPOINT` |
| `app/src/app/globals.css` | Add glassmorphism utility classes |
| `app/src/app/chat/page.tsx` | Replace inline sidebar with `ChatSidebar`, add conversation + balance state, wire up API calls |

---

### Task 1: Install dependencies and configure build

**Files:**
- Modify: `app/package.json`
- Modify: `app/next.config.mjs`
- Modify: `app/.gitignore`

- [ ] **Step 1: Install better-sqlite3**

```bash
cd app && npm install better-sqlite3 && npm install -D @types/better-sqlite3
```

- [ ] **Step 2: Add better-sqlite3 to Next.js external packages**

Edit `app/next.config.mjs` to:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk', 'better-sqlite3'],
  },
}

export default nextConfig
```

- [ ] **Step 3: Add data/ to .gitignore**

Edit `app/.gitignore` — append:

```
.vercel
data/
```

- [ ] **Step 4: Commit**

```bash
git add app/package.json app/package-lock.json app/next.config.mjs app/.gitignore
git commit -m "chore: add better-sqlite3, configure Next.js externals"
```

---

### Task 2: SQLite database layer

**Files:**
- Create: `app/src/lib/db.ts`

- [ ] **Step 1: Create the database module**

Create `app/src/lib/db.ts`:

```ts
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Connection (singleton per process)
// ---------------------------------------------------------------------------

const DB_PATH = path.resolve(process.cwd(), 'data', 'whisper.db')

let _db: Database.Database | null = null

function getDb(): Database.Database {
  if (!_db) {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    initSchema(_db)
  }
  return _db
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      text            TEXT NOT NULL DEFAULT '',
      tool_calls      TEXT DEFAULT '[]',
      created_at      INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at);
  `)
}

// ---------------------------------------------------------------------------
// Conversation CRUD
// ---------------------------------------------------------------------------

export function listConversations(): Array<{
  id: string
  title: string
  created_at: number
  updated_at: number
}> {
  const db = getDb()
  return db
    .prepare('SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC')
    .all() as Array<{ id: string; title: string; created_at: number; updated_at: number }>
}

export function createConversation(title: string): { id: string; title: string } {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run(id, title, now, now)
  return { id, title }
}

export function getConversation(id: string) {
  const db = getDb()
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
    | { id: string; title: string; created_at: number; updated_at: number }
    | undefined

  if (!conv) return null

  const messages = db
    .prepare(
      'SELECT id, role, text, tool_calls, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    )
    .all(id) as Array<{
    id: string
    role: string
    text: string
    tool_calls: string
    created_at: number
  }>

  return {
    ...conv,
    messages: messages.map((m) => ({
      ...m,
      tool_calls: JSON.parse(m.tool_calls),
    })),
  }
}

export function deleteConversation(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  return result.changes > 0
}

// ---------------------------------------------------------------------------
// Message CRUD
// ---------------------------------------------------------------------------

export function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  text: string,
  toolCalls: unknown[] = [],
): { id: string } {
  const db = getDb()
  const id = randomUUID()
  const now = Date.now()

  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, conversationId, role, text, JSON.stringify(toolCalls), now)

  // Update conversation's updated_at
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId)

  return { id }
}
```

- [ ] **Step 2: Verify the module compiles**

```bash
cd app && npx tsc --noEmit src/lib/db.ts 2>&1 | head -20
```

Expected: No errors (or only errors related to missing ambient types which is fine in isolation).

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/db.ts
git commit -m "feat: SQLite database layer for chat history"
```

---

### Task 3: Conversations API routes

**Files:**
- Create: `app/src/app/api/conversations/route.ts`
- Create: `app/src/app/api/conversations/[id]/route.ts`
- Create: `app/src/app/api/conversations/[id]/messages/route.ts`

- [ ] **Step 1: Create the list + create route**

Create `app/src/app/api/conversations/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { listConversations, createConversation } from '@/lib/db'

export async function GET() {
  const conversations = listConversations()
  return NextResponse.json({ conversations })
}

export async function POST(req: NextRequest) {
  let body: { title?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = (body.title ?? 'New conversation').slice(0, 50)
  const conv = createConversation(title)
  return NextResponse.json(conv, { status: 201 })
}
```

- [ ] **Step 2: Create the get + delete route**

Create `app/src/app/api/conversations/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getConversation, deleteConversation } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const conv = getConversation(params.id)
  if (!conv) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(conv)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const deleted = deleteConversation(params.id)
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Create the save messages route**

Create `app/src/app/api/conversations/[id]/messages/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { saveMessage, getConversation } from '@/lib/db'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Verify conversation exists
  const conv = getConversation(params.id)
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  let body: {
    messages: Array<{
      role: 'user' | 'assistant'
      text: string
      toolCalls?: unknown[]
    }>
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 })
  }

  const saved = body.messages.map((m) =>
    saveMessage(params.id, m.role, m.text, m.toolCalls ?? []),
  )

  return NextResponse.json({ saved }, { status: 201 })
}
```

- [ ] **Step 4: Commit**

```bash
git add app/src/app/api/conversations/
git commit -m "feat: conversation CRUD API routes"
```

---

### Task 4: Balances API route

**Files:**
- Create: `app/src/app/api/balances/route.ts`

- [ ] **Step 1: Create the balances route**

Create `app/src/app/api/balances/route.ts`:

```ts
import { NextResponse } from 'next/server'
import path from 'path'

/**
 * GET /api/balances
 *
 * Fetches real private balances from the Unlink SDK.
 * Uses the same dynamic-import pattern as /api/agent to load agent code.
 */
export async function GET() {
  try {
    // Dynamically import agent modules (same pattern as /api/agent/route.ts)
    const agentConfigPath =
      process.env.AGENT_MODULE_PATH
        ? path.resolve(path.dirname(process.env.AGENT_MODULE_PATH), 'config.js')
        : path.resolve(process.cwd(), '../agent/src/config.ts')

    const unlinkPath =
      process.env.AGENT_MODULE_PATH
        ? path.resolve(path.dirname(process.env.AGENT_MODULE_PATH), 'unlink.js')
        : path.resolve(process.cwd(), '../agent/src/unlink.ts')

    // Try compiled (.js) then raw (.ts)
    async function tryImport(basePath: string) {
      const candidates = [
        basePath.replace(/\.ts$/, '.js'),
        basePath,
        basePath.replace('/src/', '/dist/').replace(/\.ts$/, '.js'),
      ]
      for (const c of candidates) {
        try {
          return await import(/* webpackIgnore: true */ c)
        } catch {
          continue
        }
      }
      throw new Error(`Could not import ${basePath}`)
    }

    const configMod = await tryImport(agentConfigPath)
    const unlinkMod = await tryImport(unlinkPath)

    const { baseSepolia, getEnvOrThrow } = configMod
    const { createUnlinkClientWrapper, getBalances } = unlinkMod

    const mnemonic = getEnvOrThrow('UNLINK_MNEMONIC')
    const rpcUrl = baseSepolia.rpcUrl || getEnvOrThrow('BASE_SEPOLIA_RPC_URL')
    const client = createUnlinkClientWrapper(mnemonic, rpcUrl)

    // Derive wallet address from mnemonic (client.evmAddress)
    const wallet = client.evmAddress

    const rawBalances = await getBalances(client)

    // Map to include chain info and token address for explorer links
    const balances = rawBalances.map(
      (b: { token: string; symbol: string; balance: string }) => {
        // Determine which chain this token belongs to
        const baseToken = Object.values(baseSepolia.tokens).find(
          (t: { address: string }) =>
            t.address.toLowerCase() === b.token.toLowerCase(),
        )
        const chain = baseToken ? 'Base Sepolia' : 'Arc Testnet'
        const explorer = baseToken
          ? `https://sepolia.basescan.org/token/${b.token}`
          : null

        return {
          symbol: b.symbol,
          balance: b.balance,
          chain,
          tokenAddress: b.token,
          explorerUrl: explorer,
        }
      },
    )

    return NextResponse.json({ wallet, balances })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch balances'
    return NextResponse.json(
      { error: message, wallet: null, balances: [] },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/app/api/balances/route.ts
git commit -m "feat: /api/balances route — real Unlink balances"
```

---

### Task 5: Update config.ts — remove placeholders, add endpoints

**Files:**
- Modify: `app/src/lib/config.ts`

- [ ] **Step 1: Replace config.ts contents**

Replace the full contents of `app/src/lib/config.ts` with:

```ts
/**
 * Client-side configuration for the Whisper app.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

export const AGENT_ENDPOINT = `${API_BASE_URL}/api/agent`
export const BALANCES_ENDPOINT = `${API_BASE_URL}/api/balances`
export const CONVERSATIONS_ENDPOINT = `${API_BASE_URL}/api/conversations`
```

- [ ] **Step 2: Commit**

```bash
git add app/src/lib/config.ts
git commit -m "refactor: remove placeholder balances, add API endpoints"
```

---

### Task 6: AnimatedBalance component

**Files:**
- Create: `app/src/components/AnimatedBalance.tsx`

- [ ] **Step 1: Create the animated number component**

Create `app/src/components/AnimatedBalance.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'

interface AnimatedBalanceProps {
  value: string
  className?: string
}

/**
 * Displays a number that animates (count-up/down) when the value changes.
 * Handles decimal strings like "12450.00" or "3.25".
 */
export default function AnimatedBalance({
  value,
  className = '',
}: AnimatedBalanceProps) {
  const [display, setDisplay] = useState(value)
  const prevValue = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = parseFloat(prevValue.current) || 0
    const to = parseFloat(value) || 0
    prevValue.current = value

    // If values are the same or non-numeric, just set directly
    if (from === to || isNaN(from) || isNaN(to)) {
      setDisplay(value)
      return
    }

    // Determine decimal places from target value
    const decimals = value.includes('.')
      ? value.split('.')[1].length
      : 0

    const duration = 400 // ms
    const startTime = performance.now()

    function animate(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)

      const current = from + (to - from) * eased
      setDisplay(current.toFixed(decimals))

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setDisplay(value) // Ensure exact final value
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value])

  return <span className={className}>{display}</span>
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/AnimatedBalance.tsx
git commit -m "feat: AnimatedBalance component with count-up/down"
```

---

### Task 7: Add glassmorphism CSS utilities

**Files:**
- Modify: `app/src/app/globals.css`

- [ ] **Step 1: Append glass utility classes to globals.css**

Add the following at the end of `app/src/app/globals.css` (after the existing styles):

```css
/* ---------------------------------------------------------------------------
   Glassmorphism utilities
   --------------------------------------------------------------------------- */

.glass-sidebar {
  background: rgba(10, 10, 10, 0.6);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 0 60px rgba(200, 216, 255, 0.03);
}

.glass-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: border-color 0.2s ease;
}

.glass-card:hover {
  border-color: rgba(200, 216, 255, 0.12);
}

.balance-glow {
  text-shadow: 0 0 20px rgba(200, 216, 255, 0.15);
}

.history-item {
  transition: all 0.2s ease;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.history-item-active {
  background: rgba(200, 216, 255, 0.06);
  border-left: 2px solid rgba(200, 216, 255, 0.3);
}

.zk-badge {
  background: rgba(200, 216, 255, 0.08);
  border: 1px solid rgba(200, 216, 255, 0.15);
  box-shadow: 0 0 20px rgba(200, 216, 255, 0.05);
}

/* Mobile drawer slide-in */
@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

.animate-slide-in-left {
  animation: slideInLeft 0.2s ease-out;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/app/globals.css
git commit -m "feat: glassmorphism CSS utility classes"
```

---

### Task 8: ChatSidebar component

**Files:**
- Create: `app/src/components/ChatSidebar.tsx`

- [ ] **Step 1: Create the sidebar component**

Create `app/src/components/ChatSidebar.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import AnimatedBalance from './AnimatedBalance'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationSummary {
  id: string
  title: string
  created_at: number
  updated_at: number
}

export interface BalanceInfo {
  symbol: string
  balance: string
  chain: string
  tokenAddress: string
  explorerUrl: string | null
}

interface ChatSidebarProps {
  conversations: ConversationSummary[]
  activeConversationId: string | null
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  balances: BalanceInfo[]
  wallet: string | null
  balancesLoading: boolean
  isOpen: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Date grouping
// ---------------------------------------------------------------------------

function groupByDate(conversations: ConversationSummary[]) {
  const now = new Date()
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime()
  const yesterday = today - 86400000
  const sevenDaysAgo = today - 7 * 86400000

  const groups: { label: string; items: ConversationSummary[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const conv of conversations) {
    if (conv.updated_at >= today) {
      groups[0].items.push(conv)
    } else if (conv.updated_at >= yesterday) {
      groups[1].items.push(conv)
    } else if (conv.updated_at >= sevenDaysAgo) {
      groups[2].items.push(conv)
    } else {
      groups[3].items.push(conv)
    }
  }

  return groups.filter((g) => g.items.length > 0)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatSidebar({
  conversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  balances,
  wallet,
  balancesLoading,
  isOpen,
  onClose,
}: ChatSidebarProps) {
  const groups = useMemo(() => groupByDate(conversations), [conversations])

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* ── Header: Logo + New Chat ── */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/[0.06]">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 group"
          title="Back to Dashboard"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-[10px] font-bold tracking-widest text-[#c8d8ff] group-hover:border-[#c8d8ff]/30 transition-colors">
            W
          </div>
          <span className="text-sm font-semibold tracking-wide text-white">
            Whisper
          </span>
        </Link>
        <span className="ml-auto rounded bg-[#0a0a0a] border border-[#222] px-1.5 py-0.5 text-[9px] font-mono text-zinc-600 tracking-widest uppercase">
          testnet
        </span>
      </div>

      {/* ── New Chat button ── */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <button
          onClick={() => {
            onNewChat()
            onClose()
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-[#c8d8ff] transition-all hover:bg-[rgba(200,216,255,0.06)] hover:border-[#c8d8ff]/20"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New Chat
        </button>
      </div>

      {/* ── Chat History ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-600 text-xs">
            No conversations yet
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-2 mb-1.5 text-[10px] uppercase tracking-widest text-zinc-600">
                {group.label}
              </div>
              {group.items.map((conv) => (
                <div key={conv.id} className="group relative">
                  <button
                    onClick={() => {
                      onSelectConversation(conv.id)
                      onClose()
                    }}
                    className={`w-full text-left rounded-lg px-3 py-2 text-xs truncate history-item ${
                      conv.id === activeConversationId
                        ? 'history-item-active text-zinc-200'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {conv.title}
                  </button>
                  {/* Delete button on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteConversation(conv.id)
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-opacity text-xs p-1"
                    title="Delete conversation"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── Balances Section ── */}
      <div className="border-t border-white/[0.06] px-4 py-3">
        {/* ZK Shield Badge */}
        <div className="zk-badge rounded-lg px-3 py-1.5 mb-3 flex items-center gap-2">
          <svg
            className="h-3 w-3 text-[#c8d8ff]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
          <span className="text-[10px] font-medium text-[#c8d8ff] tracking-wide">
            Shielded via ZK Proofs
          </span>
        </div>

        {/* Wallet address */}
        {wallet && (
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1">
              Private Wallet
            </div>
            <div className="font-mono text-[11px] text-zinc-400">
              {wallet.slice(0, 6)}...{wallet.slice(-4)}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-zinc-600">Connected</span>
            </div>
          </div>
        )}

        {/* Balance cards */}
        <div className="flex flex-col gap-2">
          {balancesLoading && balances.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-[#c8d8ff]" />
            </div>
          ) : (
            balances.map((b, i) => {
              const card = (
                <div className="glass-card rounded-lg px-3 py-2.5 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      {b.symbol}
                    </span>
                    <AnimatedBalance
                      value={b.balance}
                      className="text-xs font-mono text-zinc-300 balance-glow"
                    />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 tracking-wide">
                      {b.chain}
                    </span>
                  </div>
                </div>
              )

              if (b.explorerUrl) {
                return (
                  <a
                    key={i}
                    href={b.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {card}
                  </a>
                )
              }

              return (
                <div key={i}>
                  {card}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[280px] shrink-0 flex-col glass-sidebar">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] flex flex-col glass-sidebar animate-slide-in-left">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/ChatSidebar.tsx
git commit -m "feat: ChatSidebar with glass UI, history, balances, ZK badge"
```

---

### Task 9: Rewrite chat page — wire everything together

**Files:**
- Modify: `app/src/app/chat/page.tsx`

This is the largest task. The chat page gets a complete rewrite to integrate the sidebar, real balances, and conversation persistence. The `ChatMessage`, `ToolCallCard`, thinking indicator, and SSE parsing logic stay the same. The layout, state management, and data fetching change.

- [ ] **Step 1: Rewrite chat/page.tsx**

Replace the full contents of `app/src/app/chat/page.tsx` with:

```tsx
'use client'

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import ChatMessage, { type ChatMessageData } from '@/components/ChatMessage'
import { type ToolCallInfo } from '@/components/ToolCallCard'
import ChatSidebar, {
  type ConversationSummary,
  type BalanceInfo,
} from '@/components/ChatSidebar'
import {
  AGENT_ENDPOINT,
  BALANCES_ENDPOINT,
  CONVERSATIONS_ENDPOINT,
} from '@/lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

// ---------------------------------------------------------------------------
// Thinking indicator (unchanged)
// ---------------------------------------------------------------------------

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 animate-fade-in">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-[10px] font-bold tracking-widest text-[#c8d8ff]">
        W
      </div>
      <div className="flex items-center gap-1.5 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] px-4 py-2.5">
        <span className="text-xs text-zinc-500 mr-1">Whisper is thinking</span>
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
        <span className="thinking-dot h-1 w-1 rounded-full bg-[#c8d8ff]" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Suggested prompts (unchanged)
// ---------------------------------------------------------------------------

const SUGGESTED_PROMPTS = [
  'Pay my team privately \u{1F512}: Alice 0.2 USDC, Bob 0.15 USDC, Charlie 0.1 USDC',
  'Set up a private weekly payroll strategy \u{1F512} for the engineering team',
  'Create a private escrow \u{1F512} for Dave: 0.5 USDC, release when ETH > $4k',
  'Private swap \u{1F512} 0.1 USDC \u2192 ETH for Bob + send Alice 0.05 USDC privately',
]

// ---------------------------------------------------------------------------
// Main chat page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  // ── Chat state ──
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [agentHistory, setAgentHistory] = useState<AgentHistoryMessage[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // ── Conversation state ──
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)

  // ── Balance state ──
  const [balances, setBalances] = useState<BalanceInfo[]>([])
  const [wallet, setWallet] = useState<string | null>(null)
  const [balancesLoading, setBalancesLoading] = useState(true)

  // ── Mobile sidebar ──
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── Fetch balances ──
  const fetchBalances = useCallback(async () => {
    try {
      setBalancesLoading(true)
      const res = await fetch(BALANCES_ENDPOINT)
      if (res.ok) {
        const data = await res.json()
        setBalances(data.balances ?? [])
        setWallet(data.wallet ?? null)
      }
    } catch {
      // Silently fail — balances will show loading state
    } finally {
      setBalancesLoading(false)
    }
  }, [])

  // ── Fetch conversations ──
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(CONVERSATIONS_ENDPOINT)
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations ?? [])
      }
    } catch {
      // Silently fail
    }
  }, [])

  // ── Load conversation messages ──
  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${CONVERSATIONS_ENDPOINT}/${id}`)
      if (!res.ok) return

      const data = await res.json()
      const loadedMessages: ChatMessageData[] = data.messages.map(
        (m: {
          id: string
          role: string
          text: string
          tool_calls: unknown[]
        }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          text: m.text,
          toolCalls: m.tool_calls as ToolCallInfo[],
          streaming: false,
        }),
      )

      // Reconstruct agent history from loaded messages
      const history: AgentHistoryMessage[] = data.messages
        .filter((m: { role: string; text: string }) => m.text)
        .map((m: { role: string; text: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.text,
        }))

      setMessages(loadedMessages)
      setAgentHistory(history)
      setActiveConversationId(id)
    } catch {
      // Silently fail
    }
  }, [])

  // ── Initial data load ──
  useEffect(() => {
    fetchBalances()
    fetchConversations()
  }, [fetchBalances, fetchConversations])

  // ── Auto-scroll ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // ── Textarea auto-resize ──
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
  }

  // ── New chat ──
  function handleNewChat() {
    setMessages([])
    setAgentHistory([])
    setActiveConversationId(null)
    inputRef.current?.focus()
  }

  // ── Delete conversation ──
  async function handleDeleteConversation(id: string) {
    try {
      await fetch(`${CONVERSATIONS_ENDPOINT}/${id}`, { method: 'DELETE' })
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeConversationId === id) {
        handleNewChat()
      }
    } catch {
      // Silently fail
    }
  }

  // ── Send message ──
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return

      const userText = text.trim()
      setInput('')
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
      }

      // Create conversation if this is the first message
      let convId = activeConversationId
      if (!convId) {
        try {
          const res = await fetch(CONVERSATIONS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: userText.slice(0, 50) }),
          })
          if (res.ok) {
            const data = await res.json()
            convId = data.id
            setActiveConversationId(convId)
            setConversations((prev) => [
              {
                id: data.id,
                title: data.title,
                created_at: Date.now(),
                updated_at: Date.now(),
              },
              ...prev,
            ])
          }
        } catch {
          // Continue without persistence
        }
      }

      // Add user message to UI
      const userMsgId = `user-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', text: userText },
      ])

      // Prepare assistant message placeholder
      const assistantMsgId = `assistant-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          text: '',
          toolCalls: [],
          streaming: true,
        },
      ])

      setIsThinking(true)

      // Abort previous request if any
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch(AGENT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userText, history: agentHistory }),
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''
        let finalResponse = ''
        const finalToolCalls: ToolCallInfo[] = []

        // Parse SSE stream
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''

          for (const chunk of events) {
            if (!chunk.trim()) continue

            const lines = chunk.split('\n')
            let eventType = ''
            let dataLine = ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                dataLine = line.slice(6)
              }
            }

            if (!eventType || !dataLine) continue

            let parsed: unknown
            try {
              parsed = JSON.parse(dataLine)
            } catch {
              continue
            }

            if (eventType === 'text') {
              const { text: t } = parsed as { text: string }
              finalResponse += t
              setIsThinking(false)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, text: finalResponse, streaming: true }
                    : m,
                ),
              )
            } else if (eventType === 'tool_call') {
              const tc = parsed as ToolCallInfo
              finalToolCalls.push(tc)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] }
                    : m,
                ),
              )
            } else if (eventType === 'done') {
              const { response, toolCalls } = parsed as {
                response: string
                toolCalls: ToolCallInfo[]
              }

              if (!finalResponse && response) {
                finalResponse = response
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        text: finalResponse,
                        toolCalls: toolCalls ?? finalToolCalls,
                        streaming: false,
                      }
                    : m,
                ),
              )

              // Update conversation history
              setAgentHistory((prev) => [
                ...prev,
                { role: 'user', content: userText },
                { role: 'assistant', content: finalResponse },
              ])

              // Persist messages to DB
              if (convId) {
                try {
                  await fetch(
                    `${CONVERSATIONS_ENDPOINT}/${convId}/messages`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        messages: [
                          { role: 'user', text: userText, toolCalls: [] },
                          {
                            role: 'assistant',
                            text: finalResponse,
                            toolCalls: toolCalls ?? finalToolCalls,
                          },
                        ],
                      }),
                    },
                  )
                  // Refresh conversation list (updated_at changed)
                  fetchConversations()
                } catch {
                  // Silently fail — messages still visible in UI
                }
              }

              // Refresh balances (may have changed after transfer/swap)
              fetchBalances()
            } else if (eventType === 'error') {
              const { error } = parsed as { error: string }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        text: `Error: ${error}`,
                        streaming: false,
                      }
                    : m,
                ),
              )
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return

        const errorText =
          err instanceof Error ? err.message : 'Something went wrong'

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, text: `Error: ${errorText}`, streaming: false }
              : m,
          ),
        )
      } finally {
        setIsThinking(false)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, streaming: false } : m,
          ),
        )
        inputRef.current?.focus()
      }
    },
    [
      agentHistory,
      isThinking,
      activeConversationId,
      fetchBalances,
      fetchConversations,
    ],
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-screen bg-black overflow-hidden">
      {/* Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onNewChat={handleNewChat}
        onSelectConversation={loadConversation}
        onDeleteConversation={handleDeleteConversation}
        balances={balances}
        wallet={wallet}
        balancesLoading={balancesLoading}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-[#111] px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex md:hidden h-8 w-8 items-center justify-center rounded-lg border border-[#222] bg-[#0a0a0a] text-zinc-400 hover:text-white transition-colors"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
            <div>
              <span className="text-sm font-medium text-white">
                Treasury Agent
              </span>
              <span className="ml-2 text-xs text-zinc-600">Base Sepolia</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-600">Online</span>
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full gap-8 max-w-lg mx-auto text-center animate-fade-in">
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#333] bg-[#0a0a0a] text-lg font-bold tracking-widest text-[#c8d8ff]">
                  W
                </div>
                <h1 className="text-xl font-semibold text-white mb-2">
                  Whisper
                </h1>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  Your private AI treasury agent. All transactions are shielded
                  with zero-knowledge proofs on Base Sepolia.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    disabled={isThinking}
                    className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] px-4 py-3 text-left text-xs text-zinc-400 hover:border-[#333] hover:text-zinc-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {isThinking &&
                !messages.find(
                  (m) =>
                    m.role === 'assistant' &&
                    m.streaming &&
                    (m.text || (m.toolCalls && m.toolCalls.length > 0)),
                ) && <ThinkingIndicator />}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-[#111] bg-black px-4 md:px-8 py-4">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-3 max-w-3xl mx-auto"
          >
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask Whisper anything..."
                disabled={isThinking}
                rows={1}
                className="w-full resize-none overflow-hidden rounded-xl border border-[#222] bg-[#0a0a0a] px-4 py-3 pr-4 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-[#333] disabled:opacity-60 disabled:cursor-not-allowed leading-relaxed"
                style={{ minHeight: '44px', maxHeight: '160px' }}
              />
            </div>

            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#222] bg-[#0a0a0a] text-[#c8d8ff] transition-all hover:border-[#333] hover:bg-[#111] disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              {isThinking ? (
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4 translate-x-px"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14M12 5l7 7-7 7"
                  />
                </svg>
              )}
            </button>
          </form>

          <p className="mt-2 text-center text-[10px] text-zinc-700 max-w-3xl mx-auto">
            Whisper operates on testnet. No real funds. Shift+Enter for new
            line.
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the app builds**

```bash
cd app && npx next build 2>&1 | tail -20
```

Expected: Build succeeds. If there are type errors, fix them before proceeding.

- [ ] **Step 3: Commit**

```bash
git add app/src/app/chat/page.tsx
git commit -m "feat: rewrite chat page — sidebar, real balances, conversation persistence"
```

---

### Task 10: Manual smoke test

This task verifies all features work end-to-end.

- [ ] **Step 1: Start the dev server**

```bash
cd app && npm run dev
```

- [ ] **Step 2: Verify balances load**

Open `http://localhost:3000/chat`. The sidebar should show:
- "Shielded via ZK Proofs" badge at top of balance section
- Real wallet address (not `0x1a2b...9f0e`)
- Real balance cards with chain badges
- Balance cards link to block explorer (Cmd+click opens new tab)

If balances fail to load, check the terminal for errors. Common issues:
- Missing `UNLINK_MNEMONIC` env var
- Missing `BASE_SEPOLIA_RPC_URL` env var

- [ ] **Step 3: Verify chat history persistence**

1. Send a message (e.g., "Check my balance")
2. Wait for response
3. Check sidebar — a new conversation should appear under "Today"
4. Refresh the page — conversation should persist
5. Click the conversation to reload it
6. Verify messages and tool calls are restored

- [ ] **Step 4: Verify balance animation**

1. Send "Pay Alice 0.01 USDC privately"
2. Watch the sidebar balance — the USDC number should animate down after the transfer completes

- [ ] **Step 5: Verify new chat + delete**

1. Click "New Chat" — chat area clears
2. Hover a conversation — delete icon appears
3. Click delete — conversation removed from list

- [ ] **Step 6: Verify mobile layout**

1. Resize browser to < 768px
2. Sidebar should be hidden
3. Hamburger icon appears in header
4. Click hamburger — sidebar slides in as overlay
5. Click backdrop or select a conversation — sidebar closes

- [ ] **Step 7: Verify back to dashboard**

1. Click the "Whisper" logo in sidebar header
2. Should navigate to `/dashboard`

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: smoke test adjustments"
```

Only create this commit if fixes were needed. Skip if everything passed.

---

## Self-Review Checklist

**Spec coverage:**
- [x] Real balances via `/api/balances` — Task 4
- [x] Animated count-up on balance change — Task 6
- [x] Block explorer links — Task 8 (ChatSidebar)
- [x] Chain badge prominent — Task 8 (pill badge in ChatSidebar)
- [x] ZK shield badge — Task 8 (ChatSidebar)
- [x] SQLite schema — Task 2
- [x] Conversation CRUD routes — Task 3
- [x] Date-grouped history — Task 8 (`groupByDate`)
- [x] Glass sidebar UI — Tasks 7 + 8
- [x] Back to dashboard — Task 8 (logo link)
- [x] New chat button — Task 8
- [x] Mobile drawer — Task 8
- [x] Remove placeholder balances — Task 5
- [x] Micro-animations — Tasks 6 + 7
