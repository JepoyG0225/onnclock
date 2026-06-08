/**
 * POST /api/admin/proposal/pdf — generate a proposal/quotation PDF for download.
 * SUPER_ADMIN only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/api-auth'
import { buildProposalPdf, type ProposalData } from '@/lib/proposals/pdf'

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const denied = requireSuperAdmin(ctx)
  if (denied) return denied

  const data = (await req.json()) as ProposalData
  if (!data?.clientCompany?.trim()) {
    return NextResponse.json({ error: 'Client company is required' }, { status: 400 })
  }

  const bytes = await buildProposalPdf({
    ...data,
    customItems: Array.isArray(data.customItems) ? data.customItems : [],
  })

  const safeName = (data.quoteNo || 'quotation').replace(/[^a-z0-9\-_]+/gi, '-')
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
    },
  })
}
