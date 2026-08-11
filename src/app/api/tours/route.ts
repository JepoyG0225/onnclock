/**
 * Guided-tour progress, stored against the USER rather than the browser.
 *
 * GET  /api/tours        — { seen: { [tourKey]: true }, off: boolean }
 * POST /api/tours        — { key } marks one tour seen, { off: true } opts out
 *
 * This exists because tour completion used to live only in localStorage,
 * which is per-browser: the same person saw every tour again on a second
 * device, in a private window, or after clearing site data. "Show once per
 * user" has to be persisted server-side.
 *
 * Both endpoints fail SOFT. A tour is a nicety — if this table read fails we
 * would rather show a tour twice than break the dashboard, so errors return
 * an empty state instead of a 500.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const OFF_KEY = '__off'

type TourState = Record<string, boolean>

function readState(value: unknown): TourState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: TourState = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === true) out[k] = true
  }
  return out
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ seen: {}, off: false })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tourState: true },
    })
    const state = readState(user?.tourState)
    const { [OFF_KEY]: off, ...seen } = state
    return NextResponse.json({ seen, off: off === true })
  } catch (err) {
    // Column missing (migration not yet run) or a transient DB issue.
    console.error('[tours] read failed', err)
    return NextResponse.json({ seen: {}, off: false })
  }
}

const postSchema = z.object({
  /** Tour id to mark as seen. */
  key: z.string().min(1).max(64).optional(),
  /** Opt out of all tours. */
  off: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success || (!parsed.data.key && !parsed.data.off)) {
    return NextResponse.json({ error: 'key or off is required' }, { status: 400 })
  }

  try {
    // Read-modify-write rather than a JSON merge so this works the same on
    // any Postgres version, and so a malformed existing value is normalised
    // rather than propagated.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tourState: true },
    })
    const state = readState(user?.tourState)
    if (parsed.data.key) state[parsed.data.key] = true
    if (parsed.data.off) state[OFF_KEY] = true

    await prisma.user.update({
      where: { id: session.user.id },
      data: { tourState: state },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[tours] write failed', err)
    // Soft-fail: the client also keeps a localStorage copy, so the tour still
    // won't repeat in this browser even if persistence is unavailable.
    return NextResponse.json({ ok: false })
  }
}
