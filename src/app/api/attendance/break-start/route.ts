import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { performBreak } from '@/lib/attendance/break'

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error
  return performBreak(req, ctx, 'BREAK_START')
}
