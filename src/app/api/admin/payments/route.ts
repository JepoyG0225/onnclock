import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

interface ProofPayload {
  proofOfPaymentDataUrl?: string | null
  proofUploadedAt?: string
  manualEntry?: boolean
  adminNotes?: string | null
}

export async function GET() {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const invoices = await prisma.invoice.findMany({
    where: {
      notes: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      company: {
        select: { id: true, name: true, email: true },
      },
    },
    take: 300,
  })

  const payments = invoices
    .map((invoice) => {
      let parsed: ProofPayload = {}
      if (invoice.notes) {
        try {
          parsed = JSON.parse(invoice.notes) as ProofPayload
        } catch {
          parsed = {}
        }
      }
      // Show if has proof image OR was manually recorded by admin
      if (!parsed.proofOfPaymentDataUrl && !parsed.manualEntry) return null

      return {
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        company: invoice.company,
        status: invoice.status,
        total: Number(invoice.total),
        paymentMethodLabel: invoice.paymentMethodLabel,
        createdAt: invoice.createdAt,
        paidAt: invoice.paidAt,
        proofOfPaymentDataUrl: parsed.proofOfPaymentDataUrl ?? null,
        proofUploadedAt: parsed.proofUploadedAt ?? null,
        manualEntry: parsed.manualEntry ?? false,
        adminNotes: parsed.adminNotes ?? null,
      }
    })
    .filter(Boolean)

  return NextResponse.json({ payments })
}

function nextInvoiceNo(existing: string | null): string {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const seq = existing ? (parseInt(existing.split('-')[2] ?? '0', 10) + 1) : 1
  return `INV-${ym}-${String(seq).padStart(4, '0')}`
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const body = await req.json()
  const { companyId, amount, paymentMethodLabel, notes, status, proofOfPaymentDataUrl } = body

  if (!companyId || !amount) {
    return NextResponse.json({ error: 'companyId and amount are required' }, { status: 400 })
  }

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  // Get or create subscription reference
  const sub = await prisma.subscription.upsert({
    where: { companyId },
    update: {},
    create: {
      id: `sub_${companyId}`,
      companyId,
      plan: 'MONTHLY',
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      pricePerSeat: 50,
      seatCount: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      updatedAt: new Date(),
    },
    select: { id: true },
  })

  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { invoiceNo: true },
  })
  const invoiceNo = nextInvoiceNo(lastInvoice?.invoiceNo ?? null)

  const now = new Date()
  const invoice = await prisma.invoice.create({
    data: {
      id: `inv_manual_${companyId}_${Date.now()}`,
      companyId,
      subscriptionId: sub.id,
      invoiceNo,
      status: status ?? 'PAID',
      periodStart: now,
      periodEnd: now,
      seatCount: 0,
      pricePerSeat: 0,
      subtotal: Number(amount),
      discountPct: 0,
      discountAmount: 0,
      total: Number(amount),
      paymentMethodLabel: paymentMethodLabel ?? 'Manual',
      paymentMethodCode: 'MANUAL',
      dueDate: now,
      paidAt: status === 'PAID' || !status ? now : null,
      notes: JSON.stringify({
        proofOfPaymentDataUrl: proofOfPaymentDataUrl ?? null,
        proofUploadedAt: now.toISOString(),
        manualEntry: true,
        adminNotes: notes ?? null,
      }),
      updatedAt: now,
    },
    include: { company: { select: { id: true, name: true, email: true } } },
  })

  return NextResponse.json({ invoice })
}

