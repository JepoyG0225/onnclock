import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reconcileSeatPayment } from '@/lib/billing/reconcile-seats'
export const maxDuration = 300
export async function GET(req: NextRequest) {
 if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 const invoices = await prisma.invoice.findMany({ where: { status: { in: ['VOID','UNPAID'] }, paymentMethodCode: 'QRPH', notes: { contains: '"addSeats"' }, periodEnd: { gte: new Date() } }, select: { id: true, companyId: true }, orderBy: { createdAt: 'asc' } })
 let recovered = 0, failed = 0
 for (const invoice of invoices) {
  try { const result = await reconcileSeatPayment(invoice.id, invoice.companyId); if ('activated' in result && result.activated) recovered++ }
  catch (error) { failed++; console.error('[billing-seats]', invoice.id, error) }
 }
 return NextResponse.json({ checked: invoices.length, recovered, failed })
}
