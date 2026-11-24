import { certificateIssueDate } from '@/lib/learning/certificate-date'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireLearningAuth as requireAuth } from '@/lib/learning/access'
import { snapshotTemplate } from '@/lib/learning/certificate-template'
import { prisma } from '@/lib/prisma'

const schema = z.object({ status: z.enum(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']), completedAt: z.string().optional(), score: z.coerce.number().min(0).max(100).optional(), notes: z.string().optional() })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(ctx.role)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid completion details.' }, { status: 422 })
  const { id } = await params
  const row = await prisma.learningEnrollment.findFirst({ where: { id, course: { companyId: ctx.companyId } }, include: { course: { include: { certificateTemplate: true } } } })
  if (!row) return NextResponse.json({ error: 'Enrollment not found.' }, { status: 404 })
  const data = parsed.data
  const enrollment = await prisma.$transaction(async tx => {
    const completedAt = data.status === 'COMPLETED' ? (data.completedAt ? new Date(data.completedAt) : certificateIssueDate()) : null
    const updated = await tx.learningEnrollment.update({ where: { id }, data: { status: data.status, completedAt, score: data.score, notes: data.notes } })
    if (completedAt && row.course.certificateTemplate) {
      const expiryDate = row.course.validityMonths ? new Date(completedAt) : null
      if (expiryDate) expiryDate.setMonth(expiryDate.getMonth() + row.course.validityMonths!)
      await tx.employeeCertification.upsert({
        where: { employeeId_sourceCourseId: { employeeId: row.employeeId, sourceCourseId: row.courseId } },
        create: { employeeId: row.employeeId, sourceCourseId: row.courseId, name: row.course.title, issuingBody: row.course.provider || 'Internal Learning',
          credentialId: `LMS-${row.courseId.slice(-6).toUpperCase()}-${row.employeeId.slice(-6).toUpperCase()}`, issuedDate: completedAt, expiryDate,
          templateSnapshot: snapshotTemplate(row.course.certificateTemplate), notes: 'Issued after HR marked the course complete.' },
        update: {},
      })
    }
    return updated
  })
  return NextResponse.json({ enrollment })
}
