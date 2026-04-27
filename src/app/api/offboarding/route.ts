import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { getCompanySubscription, hasHrisProFeature } from '@/lib/feature-gates'
import { z } from 'zod'

const HR_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER']

const DEFAULT_ITEMS = [
  { category: 'HR', title: 'Acceptance of resignation letter / Notice of termination', sortOrder: 1 },
  { category: 'HR', title: 'Conduct exit interview', sortOrder: 2 },
  { category: 'HR', title: 'Process final pay computation', sortOrder: 3 },
  { category: 'HR', title: 'Issue Certificate of Employment (COE)', sortOrder: 4 },
  { category: 'HR', title: 'Update employee status in system', sortOrder: 5 },
  { category: 'Finance', title: 'Clearance from Finance / Accounting', sortOrder: 6 },
  { category: 'Finance', title: 'Settle any outstanding cash advances or loans', sortOrder: 7 },
  { category: 'IT', title: 'Return company laptop / equipment', sortOrder: 8 },
  { category: 'IT', title: 'Revoke system access / deactivate accounts', sortOrder: 9 },
  { category: 'IT', title: 'Return mobile phone / SIM', sortOrder: 10 },
  { category: 'Admin', title: 'Return company ID / access card', sortOrder: 11 },
  { category: 'Admin', title: 'Return office keys', sortOrder: 12 },
  { category: 'Admin', title: 'Clear personal belongings from workspace', sortOrder: 13 },
]

const createSchema = z.object({
  employeeId: z.string(),
  reason: z.enum(['RESIGNATION', 'TERMINATION', 'RETIREMENT', 'END_OF_CONTRACT', 'REDUNDANCY']),
  lastWorkingDate: z.string(),
  notes: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const sub = await getCompanySubscription(ctx.companyId)
  if (!hasHrisProFeature(sub.pricePerSeat)) {
    return NextResponse.json({ error: 'Offboarding requires a Pro subscription.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const where = {
    companyId: ctx.companyId,
    ...(status && { status: status as 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' }),
  }

  const [processes, total] = await Promise.all([
    prisma.offboardingProcess.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNo: true,
            department: { select: { name: true } },
            position: { select: { title: true } },
          },
        },
        items: { select: { id: true, isDone: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.offboardingProcess.count({ where }),
  ])

  const data = processes.map(p => ({
    ...p,
    itemsTotal: p.items.length,
    itemsDone: p.items.filter(i => i.isDone).length,
    items: undefined,
  }))

  return NextResponse.json({ processes: data, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth(HR_ROLES)
  if (error) return error

  const sub = await getCompanySubscription(ctx.companyId)
  if (!hasHrisProFeature(sub.pricePerSeat)) {
    return NextResponse.json({ error: 'Offboarding requires a Pro subscription.' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const { employeeId, reason, lastWorkingDate, notes } = parsed.data

  // Verify employee belongs to company
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: ctx.companyId },
  })
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  const process = await prisma.$transaction(async (tx) => {
    const proc = await tx.offboardingProcess.create({
      data: {
        companyId: ctx.companyId,
        employeeId,
        reason,
        lastWorkingDate: new Date(lastWorkingDate),
        notes,
        status: 'IN_PROGRESS',
      },
    })

    // Use company template if set, otherwise fall back to defaults
    const templateItems = await tx.offboardingTemplateItem.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    })

    const itemsToCreate = templateItems.length > 0
      ? templateItems.map(t => ({
          processId: proc.id,
          category: t.category,
          title: t.title,
          description: t.description ?? undefined,
          sortOrder: t.sortOrder,
        }))
      : DEFAULT_ITEMS.map(item => ({ processId: proc.id, ...item }))

    await tx.offboardingItem.createMany({ data: itemsToCreate })

    return proc
  })

  return NextResponse.json({ process }, { status: 201 })
}
