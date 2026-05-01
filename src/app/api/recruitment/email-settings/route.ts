import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'

const templateSchema = z.object({
  type: z.enum(['INTERVIEW', 'REJECTION', 'OFFER']),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(10000),
  isActive: z.boolean().optional(),
})

const payloadSchema = z.object({
  smtpHost: z.string().max(300).optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().max(300).optional().nullable(),
  smtpPass: z.string().max(500).optional().nullable(),
  smtpFromEmail: z.string().email().optional().nullable(),
  smtpFromName: z.string().max(200).optional().nullable(),
  templates: z.array(templateSchema).optional(),
})

const DEFAULT_TEMPLATES: Record<'INTERVIEW' | 'REJECTION' | 'OFFER', { subject: string; body: string }> = {
  INTERVIEW: {
    subject: 'Interview Invitation - {{jobTitle}}',
    body: 'Hi {{firstName}},\\n\\nThank you for applying for {{jobTitle}} at {{companyName}}. We would like to invite you for an interview.\\n\\nPlease reply to this email with your availability.\\n\\nBest regards,\\n{{companyName}} HR Team',
  },
  REJECTION: {
    subject: 'Application Update - {{jobTitle}}',
    body: 'Hi {{firstName}},\\n\\nThank you for your interest in {{jobTitle}} at {{companyName}}. After careful review, we will not be moving forward with your application at this time.\\n\\nWe appreciate your time and wish you the best in your job search.\\n\\nBest regards,\\n{{companyName}} HR Team',
  },
  OFFER: {
    subject: 'Job Offer - {{jobTitle}}',
    body: 'Hi {{firstName}},\\n\\nCongratulations! We are pleased to offer you the position of {{jobTitle}} at {{companyName}}.\\n\\nPlease reply to this email so we can share the next steps.\\n\\nBest regards,\\n{{companyName}} HR Team',
  },
}

function isMissingRecruitmentEmailSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''
  return code === 'P2021' || code === 'P2022' || message.includes('recruitment_email_templates') || message.includes('smtpHost')
}

export async function GET() {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate

  try {
    const [companyRows, templateRows] = await Promise.all([
      prisma.$queryRaw<Array<{
        smtpHost: string | null
        smtpPort: number | null
        smtpSecure: boolean | null
        smtpUser: string | null
        smtpFromEmail: string | null
        smtpFromName: string | null
        smtpPass: string | null
      }>>`
        SELECT "smtpHost", "smtpPort", "smtpSecure", "smtpUser", "smtpFromEmail", "smtpFromName", "smtpPass"
        FROM "companies"
        WHERE "id" = ${ctx.companyId}
        LIMIT 1
      `,
      prisma.$queryRaw<Array<{
        type: 'INTERVIEW' | 'REJECTION' | 'OFFER'
        subject: string
        body: string
        isActive: boolean
      }>>`
        SELECT "type", "subject", "body", "isActive"
        FROM "recruitment_email_templates"
        WHERE "companyId" = ${ctx.companyId}
      `,
    ])

    const company = companyRows[0]
    const map = new Map(templateRows.map((t) => [t.type, t]))

    return NextResponse.json({
      smtp: {
        smtpHost: company?.smtpHost ?? null,
        smtpPort: company?.smtpPort ?? 465,
        smtpSecure: company?.smtpSecure ?? true,
        smtpUser: company?.smtpUser ?? null,
        smtpFromEmail: company?.smtpFromEmail ?? null,
        smtpFromName: company?.smtpFromName ?? null,
        hasSmtpPass: Boolean(company?.smtpPass),
      },
      templates: (['INTERVIEW', 'REJECTION', 'OFFER'] as const).map((type) => ({
        type,
        subject: map.get(type)?.subject ?? DEFAULT_TEMPLATES[type].subject,
        body: map.get(type)?.body ?? DEFAULT_TEMPLATES[type].body,
        isActive: map.get(type)?.isActive ?? true,
      })),
    })
  } catch (err: unknown) {
    if (isMissingRecruitmentEmailSchemaError(err)) {
      return NextResponse.json({ error: 'Recruitment email settings schema is not yet migrated.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Failed to load recruitment email settings' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN'])
  if (error) return error

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate

  const body = await req.json().catch(() => null)
  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const clearPass = Object.prototype.hasOwnProperty.call(data, 'smtpPass') && !data.smtpPass
      const setPass = Object.prototype.hasOwnProperty.call(data, 'smtpPass') && !!data.smtpPass

      await tx.$executeRaw`
        UPDATE "companies"
        SET
          "smtpHost" = ${data.smtpHost ?? null},
          "smtpPort" = ${data.smtpPort ?? null},
          "smtpSecure" = ${data.smtpSecure ?? true},
          "smtpUser" = ${data.smtpUser ?? null},
          "smtpFromEmail" = ${data.smtpFromEmail ?? null},
          "smtpFromName" = ${data.smtpFromName ?? null},
          "smtpPass" = CASE
            WHEN ${clearPass} THEN NULL
            WHEN ${setPass} THEN ${data.smtpPass ?? null}
            ELSE "smtpPass"
          END,
          "updatedAt" = NOW()
        WHERE "id" = ${ctx.companyId}
      `

      if (Array.isArray(data.templates)) {
        for (const tpl of data.templates) {
          await tx.$executeRaw`
            INSERT INTO "recruitment_email_templates" ("id", "companyId", "type", "subject", "body", "isActive", "createdAt", "updatedAt")
            VALUES (${`tpl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}, ${ctx.companyId}, ${tpl.type}::"RecruitmentEmailTemplateType", ${tpl.subject}, ${tpl.body}, ${tpl.isActive ?? true}, NOW(), NOW())
            ON CONFLICT ("companyId", "type")
            DO UPDATE SET
              "subject" = EXCLUDED."subject",
              "body" = EXCLUDED."body",
              "isActive" = EXCLUDED."isActive",
              "updatedAt" = NOW()
          `
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    if (isMissingRecruitmentEmailSchemaError(err)) {
      return NextResponse.json({ error: 'Recruitment email settings schema is not yet migrated.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Failed to save recruitment email settings' }, { status: 500 })
  }
}
