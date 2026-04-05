import { createClient, type Client } from '@libsql/client'
import { randomUUID } from 'crypto'

let _client: Client | null = null
let _initPromise: Promise<Client> | null = null

function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  }
  return _client
}

async function ensureSchema(): Promise<Client> {
  const client = getClient()
  if (!_initPromise) {
    _initPromise = (async () => {
      await client.executeMultiple(`
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

        CREATE TABLE IF NOT EXISTS strategies (
          id         TEXT PRIMARY KEY,
          data       TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS address_book (
          name    TEXT PRIMARY KEY,
          address TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS balance_cache (
          symbol     TEXT PRIMARY KEY,
          balance    TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `)

      await seedDemoData(client)
      return client
    })()
  }
  await _initPromise
  return client
}

async function seedDemoData(client: Client) {
  const result = await client.execute('SELECT COUNT(*) as c FROM conversations')
  const count = Number(result.rows[0]?.c ?? 0)
  if (count > 0) return

  const now = Date.now()
  const hour = 3_600_000
  const day = 24 * hour

  const realTxHash = '0x012b697a55077aadcf983147f7da4c496ee8b2d607f95c84b3c89474fa81d920'
  const escrowAddr = '0xf4e13a7d98A8Eb7945D937Fa33e5BBa287329eD6'

  // ── Conversation 1: Private payroll run ──
  const c1 = 'demo-payroll-run'
  const t1 = now - 2 * hour

  // ── Conversation 2: Income verification ──
  const c2 = 'demo-income-verify'
  const t2 = now - 1 * hour

  // ── Conversation 3: Private transfer ──
  const c3 = 'demo-private-transfer'
  const t3 = now - 1 * day

  // ── Conversation 4: Escrow creation ──
  const c4 = 'demo-escrow-create'
  const t4 = now - 3 * day

  await client.batch([
    // Conversations
    { sql: 'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', args: [c1, 'Run payroll: alice and bob — 0.001 USDC each', t1, t1 + 45000] },
    { sql: 'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', args: [c2, 'Verify income for alice.whisper.eth', t2, t2 + 12000] },
    { sql: 'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', args: [c3, 'Pay alice.whisper.eth 0.001 USDC privately', t3, t3 + 35000] },
    { sql: 'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', args: [c4, 'Create escrow: 0.01 USDC, release when ETH > $4k', t4, t4 + 40000] },

    // Messages
    { sql: 'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['dm-1a', c1, 'user', 'Run payroll: alice and bob — 0.001 USDC each', '[]', t1] },
    { sql: 'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['dm-1b', c1, 'assistant',
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
        t1 + 45000] },

    { sql: 'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['dm-2a', c2, 'user', 'Verify income for alice.whisper.eth', '[]', t2] },
    { sql: 'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['dm-2b', c2, 'assistant',
        'Income verified for **alice.whisper.eth**.\n\n| Field | Value |\n|---|---|\n| Recipient | alice.whisper.eth |\n| Period | April 2026 |\n| Frequency | Monthly |\n| Status | Confirmed |\n| ZK Proof | `0x7a3f...c91d` |\n\nVerification link: [/verify/alice.whisper.eth](/verify/alice.whisper.eth)\n\n**Privacy summary:** Amount is ZK-shielded — verifiers can confirm payment was received without seeing the amount, sender, or other recipients.',
        JSON.stringify([{
          name: 'verify_payment_proof',
          input: { name: 'alice.whisper.eth' },
          result: JSON.stringify({ success: true, verified: true, ensName: 'alice.whisper.eth', period: 'April 2026', frequency: 'Monthly', proofHash: '0x7a3fc817d9e2b44f1a3d6c8e52f19b0a64d73e891c7f4b2e0d95a168c3e0c91d' }),
          timestamp: t2 + 5000, duration: 3200,
        }]),
        t2 + 12000] },

    { sql: 'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['dm-3a', c3, 'user', 'Pay alice.whisper.eth 0.001 USDC privately', '[]', t3] },
    { sql: 'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['dm-3b', c3, 'assistant',
        'Resolving ENS and sending private transfer.\n\nSent **0.001 USDC** to **alice.whisper.eth** via Unlink.\n\n**Privacy summary:** Transfer shielded with ZK proof. On-chain: only the Unlink pool interaction is visible — no link to you or Alice.',
        JSON.stringify([
          { name: 'resolve_ens', input: { ensName: 'alice.whisper.eth' }, result: JSON.stringify({ success: true, address: 'unlink1qr5v9kxd2y3h7w8m4n6p0j2f5t8l3s7a1c4e9' }), timestamp: t3 + 3000, duration: 1800 },
          { name: 'private_transfer', input: { recipientAddress: 'alice.whisper.eth', amount: '0.001', token: 'USDC' }, result: JSON.stringify({ success: true, txHash: realTxHash, amount: '0.001', token: 'USDC', recipient: 'alice.whisper.eth' }), timestamp: t3 + 18000, duration: 24500 },
        ]),
        t3 + 35000] },

    { sql: 'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['dm-4a', c4, 'user', 'Create escrow for alice.whisper.eth: 0.01 USDC, release when ETH > $4k', '[]', t4] },
    { sql: 'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['dm-4b', c4, 'assistant',
        'Escrow created on Arc Testnet.\n\n| Field | Value |\n|---|---|\n| Amount | 0.01 USDC |\n| Recipient | alice.whisper.eth |\n| Condition | ETH > $4,000 |\n| Contract | WhisperEscrow |\n| Status | Locked |\n\nFunds are held in the WhisperEscrow contract on Arc Testnet and will release automatically when the ETH price oracle reports > $4,000.\n\n**Privacy summary:** Escrow creation routed through Unlink + CCTP V2 bridge to Arc. On-chain: sender identity hidden.',
        JSON.stringify([{
          name: 'create_escrow',
          input: { recipient: 'alice.whisper.eth', amount: '0.01', token: 'USDC', triggerCondition: 'ETH > $4,000', operator: 'GT' },
          result: JSON.stringify({ success: true, escrowId: '1', contractAddress: escrowAddr, txHash: '0xa3b7c1d2e4f5678901234567890abcdef1234567890abcdef1234567890abcdef', chain: 'Arc Testnet' }),
          timestamp: t4 + 20000, duration: 32000,
        }]),
        t4 + 40000] },
  ], 'write')
}

export async function listConversations(): Promise<Array<{
  id: string
  title: string
  created_at: number
  updated_at: number
}>> {
  const client = await ensureSchema()
  const result = await client.execute('SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC')
  return result.rows as unknown as Array<{ id: string; title: string; created_at: number; updated_at: number }>
}

export async function listConversationsWithStats(): Promise<Array<{
  id: string
  title: string
  created_at: number
  updated_at: number
  txCount: number
  usdcMoved: number
}>> {
  const client = await ensureSchema()
  const convResult = await client.execute('SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC')
  const convs = convResult.rows as unknown as Array<{ id: string; title: string; created_at: number; updated_at: number }>

  const results = []
  for (const conv of convs) {
    const msgResult = await client.execute({
      sql: 'SELECT tool_calls FROM messages WHERE conversation_id = ? AND role = ?',
      args: [conv.id, 'assistant'],
    })

    let txCount = 0
    let usdcMoved = 0

    for (const msg of msgResult.rows) {
      try {
        const tools = JSON.parse(msg.tool_calls as string)
        for (const tc of tools) {
          if (['private_transfer', 'private_swap', 'deposit_to_unlink'].includes(tc.name)) {
            txCount++
            if (tc.input?.amount) {
              const amount = parseFloat(tc.input.amount)
              if (!isNaN(amount)) usdcMoved += amount
            }
          }
        }
      } catch {}
    }

    results.push({ ...conv, txCount, usdcMoved })
  }

  return results
}

export async function createConversation(title: string): Promise<{ id: string; title: string }> {
  const client = await ensureSchema()
  const id = randomUUID()
  const now = Date.now()
  await client.execute({
    sql: 'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
    args: [id, title, now, now],
  })
  return { id, title }
}

export async function getConversation(id: string) {
  const client = await ensureSchema()
  const convResult = await client.execute({
    sql: 'SELECT * FROM conversations WHERE id = ?',
    args: [id],
  })

  const conv = convResult.rows[0] as unknown as { id: string; title: string; created_at: number; updated_at: number } | undefined
  if (!conv) return null

  const msgResult = await client.execute({
    sql: 'SELECT id, role, text, tool_calls, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    args: [id],
  })

  const messages = msgResult.rows as unknown as Array<{
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

export async function deleteConversation(id: string): Promise<boolean> {
  const client = await ensureSchema()
  const result = await client.execute({
    sql: 'DELETE FROM conversations WHERE id = ?',
    args: [id],
  })
  return result.rowsAffected > 0
}

export async function getAssistantMessagesWithToolCalls(sinceMs?: number): Promise<Array<{
  id: string
  tool_calls: string
  created_at: number
}>> {
  const client = await ensureSchema()
  if (sinceMs) {
    const result = await client.execute({
      sql: `SELECT id, tool_calls, created_at FROM messages
            WHERE role = 'assistant' AND tool_calls != '[]' AND created_at >= ?
            ORDER BY created_at DESC`,
      args: [sinceMs],
    })
    return result.rows as unknown as Array<{ id: string; tool_calls: string; created_at: number }>
  }
  const result = await client.execute(
    `SELECT id, tool_calls, created_at FROM messages
     WHERE role = 'assistant' AND tool_calls != '[]'
     ORDER BY created_at DESC
     LIMIT 100`
  )
  return result.rows as unknown as Array<{ id: string; tool_calls: string; created_at: number }>
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  text: string,
  toolCalls: unknown[] = [],
): Promise<{ id: string }> {
  const client = await ensureSchema()
  const id = randomUUID()
  const now = Date.now()

  await client.batch([
    {
      sql: 'INSERT INTO messages (id, conversation_id, role, text, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [id, conversationId, role, text, JSON.stringify(toolCalls), now],
    },
    {
      sql: 'UPDATE conversations SET updated_at = ? WHERE id = ?',
      args: [now, conversationId],
    },
  ], 'write')

  return { id }
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export async function dbSaveStrategy(id: string, data: string): Promise<void> {
  const client = await ensureSchema()
  await client.execute({
    sql: `INSERT INTO strategies (id, data, created_at) VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
    args: [id, data, Date.now()],
  })
}

export async function dbGetStrategy(id: string): Promise<string | null> {
  const client = await ensureSchema()
  const result = await client.execute({ sql: 'SELECT data FROM strategies WHERE id = ?', args: [id] })
  return (result.rows[0]?.data as string) ?? null
}

export async function dbListStrategies(): Promise<Array<{ id: string; data: string }>> {
  const client = await ensureSchema()
  const result = await client.execute('SELECT id, data FROM strategies ORDER BY created_at DESC')
  return result.rows as unknown as Array<{ id: string; data: string }>
}

export async function dbDeleteStrategy(id: string): Promise<boolean> {
  const client = await ensureSchema()
  const result = await client.execute({ sql: 'DELETE FROM strategies WHERE id = ?', args: [id] })
  return result.rowsAffected > 0
}

// ---------------------------------------------------------------------------
// Address Book
// ---------------------------------------------------------------------------

export async function dbSaveAddress(name: string, address: string): Promise<void> {
  const client = await ensureSchema()
  await client.execute({
    sql: `INSERT INTO address_book (name, address) VALUES (?, ?)
          ON CONFLICT(name) DO UPDATE SET address = excluded.address`,
    args: [name, address],
  })
}

export async function dbLoadAddressBook(): Promise<Record<string, string>> {
  const client = await ensureSchema()
  const result = await client.execute('SELECT name, address FROM address_book')
  const book: Record<string, string> = {}
  for (const row of result.rows) {
    book[row.name as string] = row.address as string
  }
  return book
}

// ---------------------------------------------------------------------------
// Balance Cache
// ---------------------------------------------------------------------------

export async function dbReadBalanceCache(): Promise<Record<string, { balance: string; updatedAt: number }>> {
  const client = await ensureSchema()
  const result = await client.execute('SELECT symbol, balance, updated_at FROM balance_cache')
  const cache: Record<string, { balance: string; updatedAt: number }> = {}
  for (const row of result.rows) {
    cache[row.symbol as string] = {
      balance: row.balance as string,
      updatedAt: row.updated_at as number,
    }
  }
  return cache
}

export async function dbWriteBalanceCache(symbol: string, balance: string): Promise<void> {
  const client = await ensureSchema()
  await client.execute({
    sql: `INSERT INTO balance_cache (symbol, balance, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(symbol) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at`,
    args: [symbol, balance, Date.now()],
  })
}
