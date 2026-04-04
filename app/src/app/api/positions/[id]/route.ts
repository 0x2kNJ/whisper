import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = params.id
  const strategiesDir = path.resolve(process.cwd(), '../agent/data/strategies')

  // Find the strategy file matching this id
  const files = fs.readdirSync(strategiesDir).filter(f => f.endsWith('.json'))

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(strategiesDir, file), 'utf-8')
      const data = JSON.parse(raw)
      if (data.id === id) {
        fs.unlinkSync(path.join(strategiesDir, file))
        return NextResponse.json({ success: true, id, deleted: file })
      }
    } catch {}
  }

  return NextResponse.json(
    { success: false, error: `Position ${id} not found` },
    { status: 404 },
  )
}
