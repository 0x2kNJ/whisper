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
