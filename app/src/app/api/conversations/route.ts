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
