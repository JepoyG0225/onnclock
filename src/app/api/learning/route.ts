import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireLearningAuth as requireAuth } from '@/lib/learning/access'
import { logAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { certificateIssueDate } from '@/lib/learning/certificate-date'
import { snapshotTemplate } from '@/lib/learning/certificate-template'
import { summarizeLearningProgress } from '@/lib/learning/progress'

const managers = new Set(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'])
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('course'), title: z.string().min(1), provider: z.string().optional(), category: z.string().optional(), description: z.string().optional(), durationHours: z.coerce.number().positive().optional(), validityMonths: z.coerce.number().int().positive().optional() }),
  z.object({ action: z.literal('enroll'), courseId: z.string().min(1), employeeId: z.string().min(1), dueDate: z.string().optional() }),
  z.object({ action: z.literal('certification'), templateId: z.string().min(1).optional(), employeeId: z.string().min(1), name: z.string().min(1), issuingBody: z.string().optional(), credentialId: z.string().optional(), issuedDate: z.string().optional(), expiryDate: z.string().optional(), certificateUrl: z.string().url().optional().or(z.literal('')), notes: z.string().optional() }),
])

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const canManage = (await ctxHasPermission(ctx, 'learning:manage'))
  const own = await prisma.employee.findFirst({ where: { companyId: ctx.companyId, userId: ctx.userId }, select: { id: true } })
  const employeeFilter = canManage ? {} : { employeeId: own?.id ?? '__none__' }
  const [courses, certifications, employees, templates] = await Promise.all([
    prisma.learningCourse.findMany({ where: { companyId: ctx.companyId, ...(canManage ? {} : { status: 'PUBLISHED' }) }, include: { modules: { select: { lessons: { select: { id: true } } } }, enrollments: { where: { ...employeeFilter, employee: { companyId: ctx.companyId } }, include: { progress: { select: { lessonId: true, status: true, updatedAt: true } }, attempts: { orderBy: { attemptedAt: 'desc' }, take: 1, select: { attemptedAt: true } }, employee: { select: { id: true, firstName: true, lastName: true, employeeNo: true } } }, orderBy: { assignedAt: 'desc' } } }, orderBy: { title: 'asc' } }),
    prisma.employeeCertification.findMany({ where: { employee: { companyId: ctx.companyId }, ...employeeFilter }, include: { employee: { select: { id: true, firstName: true, lastName: true, employeeNo: true } } }, orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }] }),
    canManage ? prisma.employee.findMany({ where: { companyId: ctx.companyId, isActive: true }, select: { id: true, firstName: true, lastName: true, employeeNo: true }, orderBy: { lastName: 'asc' } }) : Promise.resolve([]),
    canManage ? prisma.certificateTemplate.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
  ])
  const summarizedCourses = courses.map(({ modules, enrollments, ...course }) => ({
    ...course,
    enrollments: enrollments.map(({ progress, attempts, ...enrollment }) => ({
      ...enrollment,
      learningProgress: summarizeLearningProgress(enrollment.status, modules.flatMap(m => m.lessons.map(l => l.id)), progress, attempts[0]?.attemptedAt),
    })),
  }))
  return NextResponse.json({ courses: summarizedCourses, certifications: certifications.map(({ templateSnapshot, ...record }) => ({ ...record, hasTemplate: Boolean(templateSnapshot) })), employees, canManage, templates })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!(await ctxHasPermission(ctx, 'learning:manage'))) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid learning record.', details: parsed.error.flatten() }, { status: 422 })
  const data = parsed.data
  if (data.action === 'course') {
    const course = await prisma.learningCourse.create({ data: { companyId: ctx.companyId, title: data.title, provider: data.provider || null, category: data.category || null, description: data.description || null, durationHours: data.durationHours, validityMonths: data.validityMonths } })
    logAudit(ctx, 'CREATE', 'LearningCourse', course.id, { description: `Created learning course ${course.title}` }).catch(() => {})
    return NextResponse.json({ course }, { status: 201 })
  }
  const employee = await prisma.employee.findFirst({ where: { id: data.employeeId, companyId: ctx.companyId }, select: { id: true } })
  if (!employee) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })
  if (data.action === 'enroll') {
    const course = await prisma.learningCourse.findFirst({ where: { id: data.courseId, companyId: ctx.companyId, isActive: true }, select: { id: true } })
    if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 })
    const enrollment = await prisma.learningEnrollment.upsert({ where: { courseId_employeeId: { courseId: course.id, employeeId: employee.id } }, create: { courseId: course.id, employeeId: employee.id, dueDate: data.dueDate ? new Date(data.dueDate) : null }, update: { status: 'ASSIGNED', assignedAt: new Date(), dueDate: data.dueDate ? new Date(data.dueDate) : null, completedAt: null, score: null } })
    return NextResponse.json({ enrollment }, { status: 201 })
  }
  const template = data.templateId ? await prisma.certificateTemplate.findFirst({ where: { id: data.templateId, companyId: ctx.companyId } }) : null
  if (data.templateId && !template) return NextResponse.json({ error: 'Certificate template not found.' }, { status: 404 })
  let issuedDate: Date
  try { issuedDate = certificateIssueDate(data.issuedDate) }
  catch { return NextResponse.json({ error: 'Enter a valid issue date.' }, { status: 422 }) }
  const certification = await prisma.employeeCertification.create({ data: { ...(template ? { templateSnapshot: snapshotTemplate(template) } : {}), employeeId: employee.id, name: data.name, issuingBody: data.issuingBody || null, credentialId: data.credentialId || null, issuedDate, expiryDate: data.expiryDate ? new Date(data.expiryDate) : null, certificateUrl: data.certificateUrl || null, notes: data.notes || null } })
  return NextResponse.json({ certification }, { status: 201 })
}
