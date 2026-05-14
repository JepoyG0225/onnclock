/**
 * Digital signature endpoint — generic, polymorphic via documentType +
 * documentRefId so it serves contracts, offer letters, disciplinary
 * acknowledgements, COE, performance reviews, etc.
 *
 * POST /api/signatures
 *   Body:
 *     {
 *       documentType: string         // e.g. "DISCIPLINARY", "OFFER_LETTER"
 *       documentRefId?: string       // ID of the underlying record
 *       documentTitle?: string
 *       signatureDataUrl: string     // data:image/png;base64,...
 *       typedName?: string
 *       saveAsDefault?: boolean      // also stash on employee.signatureDataUrl
 *     }
 *   Returns the Signature row (audited).
 *
 * GET /api/signatures?documentType=&documentRefId=
 *   Returns the matching signature row (or null).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const runtime = 'nodejs'

const postSchema = z.object({
  documentType: z.string().trim().min(1).max(64),
  documentRefId: z.string().trim().max(200).optional().nullable(),
  documentTitle: z.string().trim().max(200).optional().nullable(),
  signatureDataUrl: z.string().regex(/^data:image\/(png|jpe?g);base64,/, 'Expected an image data URL').max(2_000_000),
  typedName: z.string().trim().max(200).optional().nullable(),
  saveAsDefault: z.boolean().optional(),
})

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() || null
  return req.headers.get('x-real-ip') ?? null
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }
  const data = parsed.data

  // Resolve the signer: prefer their employee record, fall back to user info.
  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
    select: { id: true, firstName: true, middleName: true, lastName: true, personalEmail: true, workEmail: true },
  })

  const signerName = employee
    ? `${employee.firstName} ${employee.middleName ?? ''} ${employee.lastName}`.replace(/\s+/g, ' ').trim()
    : (ctx.email || 'Unknown signer')
  const signerEmail = employee?.workEmail ?? employee?.personalEmail ?? ctx.email ?? null

  const signature = await prisma.signature.create({
    data: {
      companyId:        ctx.companyId,
      employeeId:       employee?.id ?? null,
      signerName:       data.typedName?.trim() || signerName,
      signerEmail,
      documentType:     data.documentType.toUpperCase(),
      documentRefId:    data.documentRefId ?? null,
      documentTitle:    data.documentTitle ?? null,
      signatureDataUrl: data.signatureDataUrl,
      typedName:        data.typedName ?? null,
      ipAddress:        clientIp(req),
      userAgent:        req.headers.get('user-agent'),
    },
  })

  // Optionally stash on the employee record as the reusable default signature.
  if (data.saveAsDefault && employee) {
    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        signatureDataUrl:    data.signatureDataUrl,
        signatureCapturedAt: new Date(),
      },
    })
  }

  return NextResponse.json({ signature }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const documentType  = (searchParams.get('documentType')  ?? '').trim().toUpperCase()
  const documentRefId = (searchParams.get('documentRefId') ?? '').trim() || null

  if (!documentType) {
    return NextResponse.json({ error: 'documentType is required' }, { status: 400 })
  }

  const signature = await prisma.signature.findFirst({
    where: {
      companyId: ctx.companyId,
      documentType,
      ...(documentRefId ? { documentRefId } : {}),
    },
    orderBy: { signedAt: 'desc' },
  })

  return NextResponse.json({ signature })
}
