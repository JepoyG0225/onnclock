import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { performClockIn } from '@/lib/attendance/clock-in'

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error
  return performClockIn(req, ctx)
}
