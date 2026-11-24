import { PermissionGate } from '@/components/auth/PermissionGate'
import type { Prisma, PayrollRunStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Settings } from 'lucide-react'
import { peso, formatDate, getStatusColor } from '@/lib/utils'
import { PesoIcon } from '@/components/ui/PesoIcon'
import PayrollRunRowActions from '@/components/payroll/PayrollRunRowActions'
import { ClickablePayrollRunRow } from '@/components/payroll/ClickablePayrollRunRow'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; payDate?: string; page?: string }> }) {
  const query = await searchParams
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')

  const q = (query.q ?? '').trim().slice(0, 120)
  const statuses = ['DRAFT', 'COMPUTED', 'FOR_APPROVAL', 'APPROVED', 'LOCKED', 'DISBURSED', 'CANCELLED']
  const status = statuses.includes(query.status ?? '') ? query.status! : ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.payDate ?? '') ? new Date(query.payDate!) : null
  const payDate = date && Number.isFinite(date.getTime()) ? date : null
  const where: Prisma.PayrollRunWhereInput = { companyId,
    ...(q ? { OR: [{ periodLabel: { contains: q, mode: 'insensitive' } }, { payGroupLabel: { contains: q, mode: 'insensitive' } }] } : {}),
    ...(status ? { status: status as PayrollRunStatus } : {}), ...(payDate ? { payDate } : {}),
  }
  const count = await prisma.payrollRun.count({ where })
  const pageCount = Math.max(1, Math.ceil(count / 20))
  const requested = Number(query.page)
  const page = Math.min(pageCount, Number.isSafeInteger(requested) && requested > 0 ? requested : 1)
  const runs = await prisma.payrollRun.findMany({ where, orderBy: [{ periodStart: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20 })
  const pageUrl = (next: number) => `/payroll?${new URLSearchParams({ q, status, ...(payDate ? { payDate: query.payDate! } : {}), page: String(next) })}`


  const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft',
    COMPUTED: 'Computed',
    FOR_APPROVAL: 'For Approval',
    APPROVED: 'Approved',
    LOCKED: 'Locked',
    DISBURSED: 'Disbursed',
    CANCELLED: 'Cancelled',
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        subtitle={`${count} payroll run${count === 1 ? '' : 's'}`}
        actions={
          <>
            <Link href="/payroll/settings">
              <Button variant="outline" size="sm">
                <Settings className="mr-2 w-4 h-4" />
                Payroll Settings
              </Button>
            </Link>
            <PermissionGate permission="payroll:write"><Link href="/payroll/new" data-tour="payroll-new">
              <Button variant="accent" size="sm">
                <Plus className="mr-2 w-4 h-4" />
                New Payroll Run
              </Button>
            </Link></PermissionGate>
          </>
        }
      />

      <form action="/payroll" className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold">Period or pay group<input name="q" defaultValue={q} placeholder="Search payroll runs" className="mt-1 block w-full min-h-11 rounded-lg border px-3 text-sm font-normal" /></label>
        <label className="text-xs font-semibold">Status<select name="status" defaultValue={status} className="mt-1 block w-full min-h-11 rounded-lg border bg-white px-3 text-sm font-normal"><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-semibold">Pay date<input name="payDate" type="date" defaultValue={payDate ? query.payDate : ''} className="mt-1 block w-full min-h-11 rounded-lg border px-3 text-sm font-normal" /></label>
        <div className="flex items-end gap-3"><Button type="submit" className="min-h-11">Filter runs</Button><Link href="/payroll" className="min-h-11 inline-flex items-center text-sm underline">Clear</Link></div>
      </form>
      <Card>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <EmptyState
              icon={<PesoIcon className="w-6 h-6" />}
              title={q || status || payDate ? "No matching payroll runs" : "No payroll runs yet"}
              description={q || status || payDate ? "Clear or change the filters to find another payroll run." : "Start a payroll cycle so employees can see their payslips."}
              action={
                <PermissionGate permission="payroll:write"><Link href={q || status || payDate ? "/payroll" : "/payroll/new"}>
                  <Button size="sm" variant="accent">{q || status || payDate ? "Clear filters" : "Create your first payroll run"}</Button>
                </Link></PermissionGate>
              }
            />
          ) : (
            <>
            <div className="divide-y md:hidden">{runs.map(run => <div key={run.id} className="p-4 space-y-3"><div className="flex justify-between gap-3"><Link href={`/payroll/${run.id}${['DRAFT', 'COMPUTED'].includes(run.status) ? '?stage=inputs' : ''}`} className="font-semibold underline">{run.periodLabel}</Link><Badge className={getStatusColor(run.status)}>{STATUS_LABELS[run.status]}</Badge></div><p className="text-xs text-slate-500">Pay date {formatDate(run.payDate)}{run.payGroupLabel ? ` | ${run.payGroupLabel}` : ''}</p><div className="flex justify-between items-center"><p className="text-sm">Net pay <strong>{peso(Number(run.totalNetPay))}</strong></p><PayrollRunRowActions runId={run.id} status={run.status} /></div></div>)}</div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-4 font-semibold text-gray-600">Period</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Pay Date</th>
                    <th className="text-left p-4 font-semibold text-gray-600">Status</th>
                    <th className="text-right p-4 font-semibold text-gray-600">Gross Pay</th>
                    <th className="text-right p-4 font-semibold text-gray-600">Total Deductions</th>
                    <th className="text-right p-4 font-semibold text-gray-600">Net Pay</th>
                    <th className="text-center p-4 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const scope = run as unknown as {
                      payGroupLabel?: string | null
                      employeeScopeMode?: string | null
                      employmentTypeFilter?: string[] | null
                      employeeIds?: string[] | null
                    }
                    const scopeBadge = (() => {
                      if (scope.employeeScopeMode === 'EMPLOYMENT_TYPE' && (scope.employmentTypeFilter?.length ?? 0) > 0) {
                        return scope.employmentTypeFilter!.map(t => t.replace('_', ' ').toLowerCase()).join(', ')
                      }
                      if (scope.employeeScopeMode === 'CUSTOM' && (scope.employeeIds?.length ?? 0) > 0) {
                        return `${scope.employeeIds!.length} selected`
                      }
                      return null
                    })()
                    return (
                    <ClickablePayrollRunRow key={run.id} runId={run.id} status={run.status}>
                      <td className="p-4">
                        <p className="font-medium text-gray-900">{run.periodLabel}</p>
                        <p className="text-xs text-gray-500">{run.payFrequency}</p>
                        {scope.payGroupLabel && (
                          <p className="text-[11px] font-semibold text-[#c44d00] bg-orange-50 inline-block px-1.5 py-0.5 rounded mt-1">
                            {scope.payGroupLabel}
                          </p>
                        )}
                        {scopeBadge && (
                          <p className="text-[10px] text-gray-500 mt-0.5">Scope: {scopeBadge}</p>
                        )}
                      </td>
                      <td className="p-4 text-gray-600">{formatDate(run.payDate)}</td>
                      <td className="p-4">
                        <Badge className={`text-xs border-0 ${getStatusColor(run.status)}`}>
                          {STATUS_LABELS[run.status]}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-medium">{peso(run.totalGross.toNumber())}</td>
                      <td className="p-4 text-right text-red-600">{peso(run.totalDeductions.toNumber())}</td>
                      <td className="p-4 text-right font-black text-[#343434]">{peso(run.totalNetPay.toNumber())}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <PayrollRunRowActions runId={run.id} status={run.status} />
                        </div>
                      </td>
                    </ClickablePayrollRunRow>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
      <nav aria-label="Payroll history pages" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{count ? `${(page - 1) * 20 + 1}-${Math.min(page * 20, count)} of ${count} runs` : '0 runs'}</span><div className="flex items-center gap-4">{page > 1 && <Link href={pageUrl(page - 1)} className="min-h-11 inline-flex items-center underline">Previous</Link>}<span>Page {page} of {pageCount}</span>{page < pageCount && <Link href={pageUrl(page + 1)} className="min-h-11 inline-flex items-center underline">Next</Link>}</div></nav>
    </div>
  )
}

