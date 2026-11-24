import { certificateIssueDate, formatCertificateDate } from '@/lib/learning/certificate-date'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLearningAuth as requireAuth } from '@/lib/learning/access'
import { snapshotTemplate } from '@/lib/learning/certificate-template'
import { certificateStorage } from '@/lib/learning/certificate-storage'
import { renderCertificate } from '@/lib/learning/certificate-pdf'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
  if (error) return error
  const template = await prisma.certificateTemplate.findFirst({ where: { id: (await params).id, companyId: ctx.companyId }, include: { company: { select: { name: true } } } })
  if (!template) return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
  try {
    const storage = await certificateStorage()
    const image = await storage.download(template.backgroundPath)
    if (image.error) throw image.error
    const bytes = await renderCertificate(snapshotTemplate(template), new Uint8Array(await image.data.arrayBuffer()), {
      employee_name: 'Juan Dela Cruz', employee_number: 'EMP-001', company_name: template.company.name,
      course_title: 'Course Completion', issued_date: formatCertificateDate(certificateIssueDate()), expiry_date: 'October 15, 2027', credential_id: 'SAMPLE-001',
    })
    return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="certificate-preview.pdf"', 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Could not generate preview. Please retry.' }, { status: 503 }) }
}
