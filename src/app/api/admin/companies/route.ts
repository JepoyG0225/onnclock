import { NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      demoStatus: true,
      demoEmailSentAt: true,
      createdAt: true,
      subscription: {
        select: {
          id: true,
          plan: true,
          status: true,
          billingCycle: true,
          seatCount: true,
          pricePerSeat: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          updatedAt: true,
        },
      },
      _count: {
        select: {
          employees: { where: { isActive: true } },
        },
      },
    },
  })

  const companyIds = companies.map((company) => company.id)
  const invoices = companyIds.length
    ? await prisma.invoice.findMany({
        where: { companyId: { in: companyIds } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          companyId: true,
          status: true,
          total: true,
          dueDate: true,
          createdAt: true,
        },
      })
    : []

  const byCompany = new Map<string, typeof invoices>()
  for (const invoice of invoices) {
    const list = byCompany.get(invoice.companyId) ?? []
    list.push(invoice)
    byCompany.set(invoice.companyId, list)
  }

  const rows = companies.map((company) => {
    const companyInvoices = byCompany.get(company.id) ?? []
    const latestInvoice = companyInvoices[0] ?? null
    const unpaidCount = companyInvoices.filter((invoice) => invoice.status === 'UNPAID').length
    const paidTotal = companyInvoices
      .filter((invoice) => invoice.status === 'PAID')
      .reduce((sum, invoice) => sum + Number(invoice.total), 0)

    return {
      id: company.id,
      name: company.name,
      email: company.email,
      isActive: company.isActive,
      demoStatus: company.demoStatus,
      demoEmailSentAt: company.demoEmailSentAt,
      createdAt: company.createdAt,
      activeEmployees: company._count.employees,
      subscription: company.subscription
        ? {
            ...company.subscription,
            pricePerSeat: Number(company.subscription.pricePerSeat),
          }
        : null,
      latestInvoice: latestInvoice
        ? { ...latestInvoice, total: Number(latestInvoice.total) }
        : null,
      unpaidCount,
      paidTotal,
    }
  })

  return NextResponse.json({ companies: rows })
}

