import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  // Accept multiple samples (new) or a single embedding (legacy)
  embeddings: z.array(z.array(z.number()).min(64)).min(1).max(10).optional(),
  embedding: z.array(z.number()).min(64).optional(),
  model: z.string().min(1),
  consent: z.boolean().optional(),
  photo: z.string().optional(), // base64 data URL captured during setup
})

function averageEmbeddings(embeddings: number[][]): number[] {
  const len = embeddings[0].length
  const avg = new Array(len).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < len; i++) avg[i] += emb[i]
  }
  // Re-normalize to unit length after averaging
  const raw = avg.map(v => v / embeddings.length)
  const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0)) || 1
  return raw.map(v => Number((v / norm).toFixed(6)))
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 422 })
  }

  const samples = parsed.data.embeddings ?? (parsed.data.embedding ? [parsed.data.embedding] : null)
  if (!samples || samples.length === 0) {
    return NextResponse.json({ error: 'No embeddings provided' }, { status: 422 })
  }

  // Average all captured samples into one robust reference embedding
  const embedding = samples.length === 1 ? samples[0] : averageEmbeddings(samples)

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
    select: { id: true },
  })
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      faceEmbedding: embedding,
      faceEmbeddingModel: parsed.data.model,
      faceSetupAt: new Date(),
      faceConsentAt: parsed.data.consent ? new Date() : undefined,
      faceSetupPhoto: parsed.data.photo ?? null,
    },
  })

  return NextResponse.json({ success: true, samples: samples.length })
}
