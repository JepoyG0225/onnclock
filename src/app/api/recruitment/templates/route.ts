import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(10000),
  category: z.string().trim().min(1).max(80).optional().nullable(),
  isActive: z.boolean().optional(),
})

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  subject: z.string().trim().min(1).max(300).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  category: z.string().trim().min(1).max(80).optional().nullable(),
  isActive: z.boolean().optional(),
})

async function ensureRecruitmentTemplateTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "recruitment_email_template_library" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "category" TEXT,
      "subject" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "recruitment_email_template_library_companyId_idx"
      ON "recruitment_email_template_library" ("companyId")
  `)
}

export async function GET() {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate

  await ensureRecruitmentTemplateTable()
  const templates = await prisma.$queryRaw<Array<{
    id: string
    name: string
    category: string | null
    subject: string
    body: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }>>`
    SELECT "id", "name", "category", "subject", "body", "isActive", "createdAt", "updatedAt"
    FROM "recruitment_email_template_library"
    WHERE "companyId" = ${ctx.companyId}
    ORDER BY "updatedAt" DESC
  `

  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  await ensureRecruitmentTemplateTable()
  const id = randomUUID()
  const payload = parsed.data
  await prisma.$executeRaw`
    INSERT INTO "recruitment_email_template_library"
    ("id", "companyId", "name", "category", "subject", "body", "isActive", "createdAt", "updatedAt")
    VALUES (${id}, ${ctx.companyId}, ${payload.name}, ${payload.category ?? null}, ${payload.subject}, ${payload.body}, ${payload.isActive ?? true}, NOW(), NOW())
  `
  return NextResponse.json({ success: true, id })
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  await ensureRecruitmentTemplateTable()
  const payload = parsed.data

  await prisma.$executeRaw`
    UPDATE "recruitment_email_template_library"
    SET
      "name" = COALESCE(${payload.name ?? null}, "name"),
      "category" = CASE WHEN ${payload.category !== undefined} THEN ${payload.category ?? null} ELSE "category" END,
      "subject" = COALESCE(${payload.subject ?? null}, "subject"),
      "body" = COALESCE(${payload.body ?? null}, "body"),
      "isActive" = COALESCE(${payload.isActive ?? null}, "isActive"),
      "updatedAt" = NOW()
    WHERE "companyId" = ${ctx.companyId}
      AND "id" = ${payload.id}
  `

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await ensureRecruitmentTemplateTable()
  await prisma.$executeRaw`
    DELETE FROM "recruitment_email_template_library"
    WHERE "companyId" = ${ctx.companyId}
      AND "id" = ${id}
  `
  return NextResponse.json({ success: true })
}
