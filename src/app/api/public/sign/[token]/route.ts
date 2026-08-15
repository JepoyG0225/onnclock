import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import sanitizeHtml from 'sanitize-html'
import { prisma } from '@/lib/prisma'

const richTextMarker = '<!--contract-rich-->'
const pageBreakMarker = '<!--page-break-->'

function signingContent(content: string) {
  if (!content.startsWith(richTextMarker)) return { content, richText: false }
  return {
    richText: true,
    content: sanitizeHtml(content.slice(richTextMarker.length).replaceAll(pageBreakMarker, '<div><br></div>'), {
      allowedTags: ['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'font', 'ul', 'ol', 'li'],
      allowedAttributes: { '*': ['style'], font: ['face', 'size', 'color'] },
      allowedStyles: { '*': { 'font-family': [/^[a-zA-Z0-9 ,'-]+$/], 'font-size': [/^\d+(?:px|pt)?$/], 'text-align': [/^(?:left|center|right|justify)$/] } },
    }),
  }
}

const submissionSchema = z.object({
  typedName: z.string().trim().min(2).max(160),
  email: z.string().trim().email(),
  signatureDataUrl: z.string().startsWith('data:image/png;base64,').max(2_800_000),
  consent: z.literal(true),
})

async function getDocument(token: string) {
  return prisma.recruitmentDocument.findUnique({ where: { publicToken: token } })
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const document = await getDocument(token)
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const application = await prisma.jobApplication.findFirst({
    where: { id: document.applicationId, companyId: document.companyId },
    select: {
      firstName: true, lastName: true, email: true,
      company: { select: { name: true, tradeName: true, logoUrl: true } },
      jobPost: { select: { title: true, department: true, location: true } },
    },
  })
  if (!application) return NextResponse.json({ error: 'Candidate record not found' }, { status: 404 })

  const expired = Boolean(document.expiresAt && document.expiresAt < new Date())
  const renderedContent = signingContent(document.content)
  return NextResponse.json({
    document: { id: document.id, title: document.title, type: document.type, content: renderedContent.content, richText: renderedContent.richText, paperSize: document.paperSize, status: document.status, signatories: document.signatories, sentAt: document.sentAt, signedAt: document.signedAt, expiresAt: document.expiresAt, expired },
    candidate: { name: `${application.firstName} ${application.lastName}`, emailHint: application.email.replace(/^(.).*(@.*)$/, '$1***$2') },
    company: application.company,
    job: application.jobPost,
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const parsed = submissionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Complete all signing fields and provide a valid signature.' }, { status: 400 })

  const document = await getDocument(token)
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (document.status === 'SIGNED') return NextResponse.json({ error: 'This document has already been signed.' }, { status: 409 })
  if (document.status !== 'SENT') return NextResponse.json({ error: 'This document is not available for signing.' }, { status: 409 })
  if (document.expiresAt && document.expiresAt < new Date()) return NextResponse.json({ error: 'This signing link has expired.' }, { status: 410 })

  const application = await prisma.jobApplication.findFirst({ where: { id: document.applicationId, companyId: document.companyId }, select: { firstName: true, lastName: true, email: true } })
  if (!application || application.email.toLowerCase() !== parsed.data.email.toLowerCase()) return NextResponse.json({ error: 'The email address does not match this offer.' }, { status: 403 })

  const signedAt = new Date()
  await prisma.$transaction([
    prisma.signature.create({ data: {
      companyId: document.companyId,
      signerName: `${application.firstName} ${application.lastName}`,
      signerEmail: application.email,
      documentType: document.type,
      documentRefId: document.id,
      documentTitle: document.title,
      signatureDataUrl: parsed.data.signatureDataUrl,
      typedName: parsed.data.typedName,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
      signedAt,
    } }),
    prisma.recruitmentDocument.update({ where: { id: document.id }, data: { status: 'SIGNED', signedAt } }),
  ])
  return NextResponse.json({ ok: true, signedAt })
}
