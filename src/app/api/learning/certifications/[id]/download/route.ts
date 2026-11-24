import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLearningAuth as requireAuth } from '@/lib/learning/access'
import { snapshotTemplate } from '@/lib/learning/certificate-template'
import { certificateStorage } from '@/lib/learning/certificate-storage'
import { renderCertificate } from '@/lib/learning/certificate-pdf'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const manager = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(ctx.role)
  const record = await prisma.employeeCertification.findFirst({
    where: { id: (await params).id, employee: { companyId: ctx.companyId, ...(manager ? {} : { userId: ctx.userId }) } },
    include: { employee: { select: { firstName: true, lastName: true, employeeNo: true, company: { select: { name: true } } } } },
  })
  if (!record?.templateSnapshot) return NextResponse.json({ error: 'Certificate not found or no template was selected when it was issued.' }, { status: 404 })
  try {
    const template = snapshotTemplate(record.templateSnapshot)
    if (!template.backgroundPath.startsWith(`${ctx.companyId}/`)) return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 })
    const storage = await certificateStorage()
    const background = await storage.download(template.backgroundPath)
    if (background.error) throw background.error
    const formatDate = (value: Date | null) => value ? value.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' }) : ''
    const bytes = await renderCertificate(template, new Uint8Array(await background.data.arrayBuffer()), {
      employee_name: `${record.employee.firstName} ${record.employee.lastName}`, employee_number: record.employee.employeeNo,
      company_name: record.employee.company.name, course_title: record.name, issued_date: formatDate(record.issuedDate), expiry_date: formatDate(record.expiryDate), credential_id: record.credentialId ?? '',
    })
    return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="certificate.pdf"', 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Could not generate this certificate. Please retry or contact HR.' }, { status: 503 }) }
}
