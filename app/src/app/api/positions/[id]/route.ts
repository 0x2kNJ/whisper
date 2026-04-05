import { NextRequest, NextResponse } from 'next/server'
import { dbDeleteStrategy } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const deleted = await dbDeleteStrategy(params.id)
  if (!deleted) {
    return NextResponse.json(
      { success: false, error: `Position ${params.id} not found` },
      { status: 404 },
    )
  }
  return NextResponse.json({ success: true, id: params.id })
}
