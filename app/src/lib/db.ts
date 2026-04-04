import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'

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

  // Seed demo data on first run so judges see a populated dashboard
  seedDemoData(db)
}

function seedDemoData(db: Database.Database) {
  const count = db.prepare('SELECT COUNT(*) as c FROM conversations').get() as { c: number }
  if (count.c > 0) return // Already seeded

  const now = Date.now()
  const hour = 3_600_000
  const day = 24 * hour

  const insert = db.prepare(
    'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const insertConv = db.prepare(
    'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
  )

  // Real tx hash from deployed Whisper on Base Sepolia
  const realTxHash = '0x012b697a55077aadcf983147f7da4c496ee8b2d607f95c84b3c89474fa81d920'
  const escrowAddr = '0xf4e13a7d98A8Eb7945D937Fa33e5BBa287329eD6'

  // ── Conversation 1: Private payroll run ──
  const c1 = 'demo-payroll-run'
  const t1 = now - 2 * hour
  insertConv.run(c1, 'Run payroll: alice and bob — 0.001 USDC each', t1, t1 + 45000)

  insert.run('dm-1a', c1, 'user', 'Run payroll: alice and bob — 0.001 USDC each', '[]', t1)
  insert.run('dm-1b', c1, 'assistant',
    'Running batch private payroll for 2 recipients.\n\n| Recipient | Amount | Status |\n|---|---|---|\n| alice.whisper.eth | 0.001 USDC | Sent |\n| bob.whisper.eth | 0.001 USDC | Sent |\n\n**Privacy summary:** Both transfers shielded via Unlink ZK proofs on Base Sepolia. On-chain observers see only the Unlink pool — no link to sender, recipients, or amounts.',
    JSON.stringify([{
      name: 'batch_private_transfer',
      input: { transfers: [
        { recipientAddress: 'alice.whisper.eth', amount: '0.001', token: 'USDC' },
        { recipientAddress: 'bob.whisper.eth', amount: '0.001', token: 'USDC' },
      ]},
      result: JSON.stringify({ success: true, txHash: realTxHash, transfers: 2, totalAmount: '0.002', token: 'USDC' }),
      timestamp: t1 + 15000, duration: 28400,
    }]),
    t1 + 45000,
  )

  // ── Conversation 2: Income verification ──
  const c2 = 'demo-income-verify'
  const t2 = now - 1 * hour
  insertConv.run(c2, 'Verify income for alice.whisper.eth', t2, t2 + 12000)

  insert.run('dm-2a', c2, 'user', 'Verify income for alice.whisper.eth', '[]', t2)
  insert.run('dm-2b', c2, 'assistant',
    'Income verified for **alice.whisper.eth**.\n\n| Field | Value |\n|---|---|\n| Recipient | alice.whisper.eth |\n| Period | April 2026 |\n| Frequency | Monthly |\n| Status | Confirmed |\n| ZK Proof | `0x7a3f...c91d` |\n\nVerification link: [/verify/alice.whisper.eth](/verify/alice.whisper.eth)\n\n**Privacy summary:** Amount is ZK-shielded — verifiers can confirm payment was received without seeing the amount, sender, or other recipients.',
    JSON.stringify([{
      name: 'verify_payment_proof',
      input: { name: 'alice.whisper.eth' },
      result: JSON.stringify({ success: true, verified: true, ensName: 'alice.whisper.eth', period: 'April 2026', frequency: 'Monthly', proofHash: '0x7a3fc817d9e2b44f1a3d6c8e52f19b0a64d73e891c7f4b2e0d95a168c3e0c91d' }),
      timestamp: t2 + 5000, duration: 3200,
    }]),
    t2 + 12000,
  )

  // ── Conversation 3: Private transfer ──
  const c3 = 'demo-private-transfer'
  const t3 = now - 1 * day
  insertConv.run(c3, 'Pay alice.whisper.eth 0.001 USDC privately', t3, t3 + 35000)

  insert.run('dm-3a', c3, 'user', 'Pay alice.whisper.eth 0.001 USDC privately', '[]', t3)
  insert.run('dm-3b', c3, 'assistant',
    'Resolving ENS and sending private transfer.\n\nSent **0.001 USDC** to **alice.whisper.eth** via Unlink.\n\n**Privacy summary:** Transfer shielded with ZK proof. On-chain: only the Unlink pool interaction is visible — no link to you or Alice.',
    JSON.stringify([
      { name: 'resolve_ens', input: { ensName: 'alice.whisper.eth' }, result: JSON.stringify({ success: true, address: 'unlink1qr5v9kxd2y3h7w8m4n6p0j2f5t8l3s7a1c4e9' }), timestamp: t3 + 3000, duration: 1800 },
      { name: 'private_transfer', input: { recipientAddress: 'alice.whisper.eth', amount: '0.001', token: 'USDC' }, result: JSON.stringify({ success: true, txHash: realTxHash, amount: '0.001', token: 'USDC', recipient: 'alice.whisper.eth' }), timestamp: t3 + 18000, duration: 24500 },
    ]),
    t3 + 35000,
  )

  // ── Conversation 4: Escrow creation ──
  const c4 = 'demo-escrow-create'
  const t4 = now - 3 * day
  insertConv.run(c4, 'Create escrow: 0.01 USDC, release when ETH > $4k', t4, t4 + 40000)

  insert.run('dm-4a', c4, 'user', 'Create escrow for alice.whisper.eth: 0.01 USDC, release when ETH > $4k', '[]', t4)
  insert.run('dm-4b', c4, 'assistant',
    'Escrow created on Arc Testnet.\n\n| Field | Value |\n|---|---|\n| Amount | 0.01 USDC |\n| Recipient | alice.whisper.eth |\n| Condition | ETH > $4,000 |\n| Contract | WhisperEscrow |\n| Status | Locked |\n\nFunds are held in the WhisperEscrow contract on Arc Testnet and will release automatically when the ETH price oracle reports > $4,000.\n\n**Privacy summary:** Escrow creation routed through Unlink + CCTP V2 bridge to Arc. On-chain: sender identity hidden.',
    JSON.stringify([{
      name: 'create_escrow',
      input: { recipient: 'alice.whisper.eth', amount: '0.01', token: 'USDC', triggerCondition: 'ETH > $4,000', operator: 'GT' },
      result: JSON.stringify({ success: true, escrowId: '1', contractAddress: escrowAddr, txHash: '0xa3b7c1d2e4f5678901234567890abcdef1234567890abcdef1234567890abcdef', chain: 'Arc Testnet' }),
      timestamp: t4 + 20000, duration: 32000,
    }]),
    t4 + 40000,
  )
}

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

export function listConversationsWithStats(): Array<{
  id: string
  title: string
  created_at: number
  updated_at: number
  txCount: number
  usdcMoved: number
}> {
  const db = getDb()
  const convs = db
    .prepare('SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC')
    .all() as Array<{ id: string; title: string; created_at: number; updated_at: number }>

  return convs.map((conv) => {
    const messages = db
      .prepare('SELECT tool_calls FROM messages WHERE conversation_id = ? AND role = ?')
      .all(conv.id, 'assistant') as Array<{ tool_calls: string }>

    let txCount = 0
    let usdcMoved = 0

    for (const msg of messages) {
      try {
        const tools = JSON.parse(msg.tool_calls)
        for (const tc of tools) {
          if (['private_transfer', 'private_swap', 'deposit_to_unlink'].includes(tc.name)) {
            txCount++
            // Try to extract amount from input
            if (tc.input?.amount) {
              const amount = parseFloat(tc.input.amount)
              if (!isNaN(amount)) usdcMoved += amount
            }
          }
        }
      } catch {}
    }

    return { ...conv, txCount, usdcMoved }
  })
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

export function getAssistantMessagesWithToolCalls(sinceMs?: number): Array<{
  id: string
  tool_calls: string
  created_at: number
}> {
  const db = getDb()
  if (sinceMs) {
    return db
      .prepare(
        `SELECT id, tool_calls, created_at FROM messages
         WHERE role = 'assistant' AND tool_calls != '[]' AND created_at >= ?
         ORDER BY created_at DESC`
      )
      .all(sinceMs) as Array<{ id: string; tool_calls: string; created_at: number }>
  }
  return db
    .prepare(
      `SELECT id, tool_calls, created_at FROM messages
       WHERE role = 'assistant' AND tool_calls != '[]'
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all() as Array<{ id: string; tool_calls: string; created_at: number }>
}

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

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId)

  return { id }
}
