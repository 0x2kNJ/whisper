import { NextRequest, NextResponse } from 'next/server'
import { saveMessage, getConversation } from '@/lib/db'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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
