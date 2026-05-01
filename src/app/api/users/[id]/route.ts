import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { ensureCustomRoleTables, getCustomRoleById } from '@/lib/custom-roles'

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(190),
  role: z.enum(['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER', 'DEPARTMENT_HEAD']).optional(),
  customRoleId: z.string().optional().nullable(),
  managedDepartmentId: z.string().optional().nullable(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await requireAuth(['COMPANY_ADMIN'])
  if (error) return error

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }

  const member = await prisma.userCompany.findFirst({
    where: { companyId: ctx.companyId, userId: id },
    select: { userId: true },
  })
  if (!member) {
    return NextResponse.json({ error: 'User not found in this company' }, { status: 404 })
  }

  try {
    await prisma.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
      },
    })
    // Update role and managedDepartmentId if provided
    if (parsed.data.role !== undefined || parsed.data.managedDepartmentId !== undefined || parsed.data.customRoleId !== undefined) {
      let targetRole = parsed.data.role
      if (parsed.data.customRoleId) {
        const customRole = await getCustomRoleById(ctx.companyId, parsed.data.customRoleId)
        if (!customRole) {
          return NextResponse.json({ error: 'Custom role not found' }, { status: 404 })
        }
        targetRole = customRole.baseRole
      }
      await prisma.userCompany.updateMany({
        where: { userId: id, companyId: ctx.companyId },
        data: {
          ...(targetRole !== undefined ? { role: targetRole } : {}),
          ...(parsed.data.managedDepartmentId !== undefined ? { managedDepartmentId: parsed.data.managedDepartmentId } : {}),
        },
      })
      await ensureCustomRoleTables()
      if (parsed.data.customRoleId) {
        await prisma.$executeRaw`
          INSERT INTO "user_custom_roles" ("companyId", "userId", "customRoleId", "createdAt", "updatedAt")
          VALUES (${ctx.companyId}, ${id}, ${parsed.data.customRoleId}, NOW(), NOW())
          ON CONFLICT ("companyId", "userId")
          DO UPDATE SET "customRoleId" = EXCLUDED."customRoleId", "updatedAt" = NOW()
        `
      } else if (parsed.data.customRoleId !== undefined) {
        await prisma.$executeRaw`
          DELETE FROM "user_custom_roles"
          WHERE "companyId" = ${ctx.companyId} AND "userId" = ${id}
        `
      }
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Email is already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
