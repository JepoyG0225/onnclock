import { NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

interface ProofPayload {
  proofOfPaymentDataUrl?: string
  proofUploadedAt?: string
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
      if (!parsed.proofOfPaymentDataUrl) return null

      return {
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        company: invoice.company,
        status: invoice.status,
        total: Number(invoice.total),
        paymentMethodLabel: invoice.paymentMethodLabel,
        createdAt: invoice.createdAt,
        paidAt: invoice.paidAt,
        proofOfPaymentDataUrl: parsed.proofOfPaymentDataUrl,
        proofUploadedAt: parsed.proofUploadedAt ?? null,
      }
    })
    .filter(Boolean)

  return NextResponse.json({ payments })
}

