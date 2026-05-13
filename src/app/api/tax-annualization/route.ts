/**
 * Year-end income tax annualization (Basic + Pro).
 *
 * GET /api/tax-annualization?year=YYYY
 *   Returns annualized totals for every employee in the company with at
 *   least one payslip whose pay date falls within the calendar year, plus
 *   the company-wide summary used by the BIR Reports page (Annualization
 *   tab).
 *
 * Response shape:
 *   {
 *     year: number
 *     employeeCount: number
 *     totalGross: number
 *     totalTaxWithheld: number
 *     totalTaxDue: number
 *     totalRefund: number
 *     totalAdditional: number
 *     rows: AnnualizationRow[]
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdminOrHR } from '@/lib/api-auth'
import { annualizeCompanyForYear } from '@/lib/payroll/annualize'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const roleGate = requireAdminOrHR(ctx)
  if (roleGate) return roleGate

  const yearStr = new URL(req.url).searchParams.get('year')
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear()
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  const summary = await annualizeCompanyForYear(ctx.companyId, year)
  return NextResponse.json(summary)
}
