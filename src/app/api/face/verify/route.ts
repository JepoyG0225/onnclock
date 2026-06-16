import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  // Accept multiple frames (new) or single embedding (legacy)
  embeddings: z.array(z.array(z.number()).min(64)).min(1).max(5).optional(),
  embedding: z.array(z.number()).min(64).optional(),
  model: z.string().min(1),
})

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i]
    const bv = b[i]
    dot += av * bv
    na += av * av
    nb += bv * bv
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 422 })
  }

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
    select: { faceEmbedding: true, faceEmbeddingModel: true },
  })
  if (!employee?.faceEmbedding) {
    return NextResponse.json({ error: 'Face not set up' }, { status: 400 })
  }
  if (employee.faceEmbeddingModel !== parsed.data.model) {
    return NextResponse.json({ error: 'Face model mismatch. Please re-setup face.' }, { status: 409 })
  }

  const stored = Array.isArray(employee.faceEmbedding) ? (employee.faceEmbedding as number[]) : []
  const frames = parsed.data.embeddings ?? (parsed.data.embedding ? [parsed.data.embedding] : [])
  if (frames.length === 0) {
    return NextResponse.json({ error: 'No embeddings provided' }, { status: 422 })
  }

  // Cosine similarity equivalent to face-api.js Euclidean ≤ 0.6 is cosine ≥ 0.82
  const threshold = 0.82
  // Take the best (highest) score across all captured frames
  const score = frames.reduce((best, frame) => Math.max(best, cosineSimilarity(stored, frame)), 0)
  const ok = score >= threshold

  return NextResponse.json({ ok, score, threshold })
}
