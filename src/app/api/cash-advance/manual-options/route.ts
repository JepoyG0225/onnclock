import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { computeCashAdvanceLimit } from '@/lib/cash-advance-limit'
export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!await ctxHasPermission(ctx, 'loans:write') && !await ctxHasPermission(ctx, 'cashadvance:approve')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('employeeId')
  if (id) {
    const employee = await prisma.employee.findFirst({ where: { id, companyId: ctx.companyId, isActive: true }, select: { id: true, rateType: true, basicSalary: true, dailyRate: true, hourlyRate: true } })
    if (!employee) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })
    const limit = await computeCashAdvanceLimit({ ...employee, basicSalary: Number(employee.basicSalary), dailyRate: employee.dailyRate == null ? null : Number(employee.dailyRate), hourlyRate: employee.hourlyRate == null ? null : Number(employee.hourlyRate) })
    return NextResponse.json({ limit }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0,100)
  const employees = await prisma.employee.findMany({ where: { companyId: ctx.companyId, isActive: true, ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' as const } }, { lastName: { contains: q, mode: 'insensitive' as const } }, { employeeNo: { contains: q, mode: 'insensitive' as const } }] } : {}) }, select: { id: true, firstName: true, lastName: true, employeeNo: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], take: 100 })
  return NextResponse.json({ employees }, { headers: { 'Cache-Control': 'private, no-store' } })
}
