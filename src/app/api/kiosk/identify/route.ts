/**
 * Kiosk face identification — 1:N.
 *
 * The portal's /api/face/verify answers "is this the signed-in employee?".
 * A shared kiosk has no signed-in employee, so this answers the harder
 * question: "which of this company's employees is this?" It scores the
 * submitted descriptors against every enrolled employee and returns the best
 * match above threshold.
 *
 * It deliberately does NOT punch. It returns the identified employee and which
 * action is due, and the kiosk then calls the existing clock-in / clock-out
 * routes. Reusing those keeps schedule validation, late/undertime computation
 * and every other pay-affecting rule in one place — duplicating that logic for
 * a second client is how the two would quietly drift apart.
 *
 * Authorised by a company admin's desktop token: one device, logged in once, is
 * then usable by everyone who walks up to it. The identification runs
 * server-side and no stored embedding is ever returned, so the kiosk cannot be
 * tampered into matching locally.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getManilaDateOnly } from '@/lib/date-manila'

export const runtime = 'nodejs'

const schema = z.object({
  embeddings: z.array(z.array(z.number()).min(64)).min(1).max(5),
  model: z.string().min(1),
})

/**
 * Threshold for a 1:N match.
 *
 * Higher than the 0.82 used for 1:1 verification, and deliberately so: checking
 * against one known person tolerates a looser bar, but scanning a whole roster
 * gives many more chances for a coincidental near-match. A false accept here
 * would clock in the wrong person, which is a payroll error.
 */
const IDENTIFY_THRESHOLD = 0.86

/** Reject ambiguity: the winner must beat the runner-up by this margin. */
const MARGIN = 0.03

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(undefined, req)
  if (error) return error

  // The kiosk runs on an admin login. dtr:write is the same permission the
  // punch routes will require for an on-behalf-of punch, so the two agree.
  if (!(await ctxHasPermission(ctx, 'dtr:write'))) {
    return NextResponse.json(
      { error: 'This device is not authorised for kiosk attendance.' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 422 })
  }

  const candidates = await prisma.employee.findMany({
    where: {
      companyId: ctx.companyId,
      isActive: true,
      NOT: { faceEmbedding: { equals: Prisma.DbNull } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNo: true,
      photoUrl: true,
      faceEmbedding: true,
      faceEmbeddingModel: true,
    },
  })

  const enrolled = candidates.filter(
    c => Array.isArray(c.faceEmbedding) && c.faceEmbeddingModel === parsed.data.model,
  )
  if (enrolled.length === 0) {
    return NextResponse.json(
      { error: 'No employees have set up face verification yet.', matched: false },
      { status: 404 },
    )
  }

  // Best score per employee across all submitted frames, then rank.
  const scored = enrolled
    .map(emp => {
      const stored = emp.faceEmbedding as number[]
      const score = parsed.data.embeddings.reduce(
        (best, frame) => Math.max(best, cosineSimilarity(stored, frame)),
        0,
      )
      return { emp, score }
    })
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  const runnerUp = scored[1]

  if (!top || top.score < IDENTIFY_THRESHOLD) {
    return NextResponse.json({
      matched: false,
      reason: 'NO_MATCH',
      score: top?.score ?? 0,
      threshold: IDENTIFY_THRESHOLD,
    })
  }

  // Two people scoring within a hair of each other means the scan is not
  // decisive. Better to ask for a rescan than to punch the wrong person.
  if (runnerUp && top.score - runnerUp.score < MARGIN) {
    return NextResponse.json({
      matched: false,
      reason: 'AMBIGUOUS',
      score: top.score,
      threshold: IDENTIFY_THRESHOLD,
    })
  }

  // Which action is due. An open record (timed in, not out) means the next
  // punch is a clock-out; anything else starts a new one.
  const today = getManilaDateOnly()
  const openRecord = await prisma.dTRRecord.findFirst({
    where: { employeeId: top.emp.id, timeIn: { not: null }, timeOut: null },
    select: { id: true, timeIn: true, date: true },
    orderBy: { date: 'desc' },
  })

  const alreadyCompleteToday = await prisma.dTRRecord.findFirst({
    where: {
      employeeId: top.emp.id,
      date: today,
      timeIn: { not: null },
      timeOut: { not: null },
    },
    select: { id: true },
  })

  return NextResponse.json({
    matched: true,
    score: top.score,
    threshold: IDENTIFY_THRESHOLD,
    employee: {
      id: top.emp.id,
      name: `${top.emp.firstName} ${top.emp.lastName}`.trim(),
      employeeNo: top.emp.employeeNo,
      photoUrl: top.emp.photoUrl,
    },
    action: openRecord ? 'OUT' : 'IN',
    openSince: openRecord?.timeIn ?? null,
    alreadyCompleteToday: !!alreadyCompleteToday,
  })
}
