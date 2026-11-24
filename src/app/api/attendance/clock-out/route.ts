import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { performClockOut } from '@/lib/attendance/clock-out'

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error
  return performClockOut(req, ctx)
}
