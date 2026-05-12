/**
 * POST /api/assets/[id]/assign — assign asset to an employee (closes any active assignment first)
 * POST /api/assets/[id]/return — mark current active assignment as RETURNED
 *
 * Both pulled into one file via path-relative dispatch is awkward in Next.js;
 * this file handles assign, /return is a sibling route.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { createNotification, userIdForEmployee } from '@/lib/notifications'
import { z } from 'zod'

const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN']

const schema = z.object({
  employeeId: z.string().min(1),
  conditionAtIssue: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!HR_ROLES.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  const { id: assetId } = await params

  const asset = await prisma.companyAsset.findFirst({ where: { id: assetId, companyId } })
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const d = parsed.data

  const employee = await prisma.employee.findFirst({
    where: { id: d.employeeId, companyId },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Close any prior active assignment for this asset, then create new + flip status.
  const assignment = await prisma.$transaction(async (tx) => {
    await tx.assetAssignment.updateMany({
      where: { assetId, status: 'ACTIVE' },
      data: { status: 'RETURNED', returnedAt: new Date(), returnedById: ctx.userId },
    })
    const created = await tx.assetAssignment.create({
      data: {
        assetId,
        employeeId: d.employeeId,
        conditionAtIssue: d.conditionAtIssue ?? null,
        notes: d.notes ?? null,
        assignedById: ctx.userId,
      },
    })
    await tx.companyAsset.update({
      where: { id: assetId },
      data: { status: 'ASSIGNED' },
    })
    return created
  })

  // Notify the employee (best-effort)
  const recipientUserId = await userIdForEmployee(d.employeeId)
  if (recipientUserId) {
    await createNotification({
      companyId,
      userId: recipientUserId,
      type: 'ASSET_ASSIGNED',
      title: `Asset assigned: ${asset.name}`,
      body: `${asset.category}${asset.assetTag ? ` · ${asset.assetTag}` : ''}${asset.serialNumber ? ` · SN ${asset.serialNumber}` : ''}`,
      link: '/portal/profile',
    })
  }

  return NextResponse.json({ assignment }, { status: 201 })
}
