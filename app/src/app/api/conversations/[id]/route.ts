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
