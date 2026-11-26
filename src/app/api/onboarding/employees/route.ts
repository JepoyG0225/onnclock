import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { requireHrisProApi } from '@/lib/hris-pro'
import { recruitmentModelsReady, recruitmentModelsUnavailableResponse } from '@/lib/recruitment-runtime'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!await ctxHasPermission(ctx, 'onboarding:manage')) return NextResponse.json({ error: 'Onboarding management permission required.' }, { status: 403 })

  const gate = await requireHrisProApi(ctx.companyId)
  if (gate) return gate
  if (!recruitmentModelsReady()) return recruitmentModelsUnavailableResponse()

  const employees = await prisma.employee.findMany({
    where: {
      companyId: ctx.companyId,
      isActive: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      employeeNo: true,
      firstName: true,
      lastName: true,
      department: { select: { name: true } },
      position: { select: { title: true } },
    },
  })

  return NextResponse.json({ employees })
}
