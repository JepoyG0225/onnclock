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
import { Plus, Settings, CalendarDays, ListFilter, ArrowUpRight } from 'lucide-react'
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
        title="Payroll Runs"
        subtitle="Manage each pay cycle, from calculation to disbursement."
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

      <form action="/payroll" className="grid items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_auto]">
        <label className="text-xs font-medium text-slate-600">Period or pay group<input name="q" defaultValue={q} placeholder="Search payroll runs" className="mt-1 block w-full min-h-11 rounded-xl border-slate-200 border bg-slate-50/60 px-3 text-sm font-normal text-[#162d54] focus:outline-none focus:ring-2 focus:ring-orange-200" /></label>
        <label className="text-xs font-medium text-slate-600">Status<select name="status" defaultValue={status} className="mt-1 block w-full min-h-11 rounded-xl border border-slate-200 bg-slate-50/60 px-3 text-sm font-normal text-[#162d54]"><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Pay date<input name="payDate" type="date" defaultValue={payDate ? query.payDate : ''} className="mt-1 block w-full min-h-11 rounded-xl border-slate-200 border bg-slate-50/60 px-3 text-sm font-normal text-[#162d54] focus:outline-none focus:ring-2 focus:ring-orange-200" /></label>
        <div className="flex items-end gap-3"><Button type="submit" className="min-h-11 rounded-xl"><ListFilter className="mr-2 h-4 w-4" />Apply filters</Button><Link href="/payroll" className="min-h-11 inline-flex items-center px-2 text-sm text-slate-500 hover:text-[#ff5900]">Clear</Link></div>
      </form>
      <Card className="gap-0 overflow-hidden rounded-2xl border-slate-200 py-0 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-[#ff5900]"><CalendarDays className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold text-[#162d54]">Payroll history</h2><p className="mt-0.5 text-xs text-slate-500">{count} matching run{count === 1 ? '' : 's'}</p></div></div><span className="text-xs text-slate-500">Open a run to review its breakdown <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></span></div>
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
            <div className="divide-y md:hidden">{runs.map(run => <div key={run.id} className="p-5 space-y-3"><div className="flex items-start justify-between gap-3 [&>a]:min-w-0 [&>a]:break-words [&>span]:shrink-0"><Link href={`/payroll/${run.id}${['DRAFT', 'COMPUTED'].includes(run.status) ? '?stage=inputs' : ''}`} className="font-medium text-[#162d54] hover:text-[#ff5900]">{run.periodLabel}</Link><Badge className={getStatusColor(run.status)}>{STATUS_LABELS[run.status]}</Badge></div><p className="text-xs text-slate-500">Pay date {formatDate(run.payDate)}{run.payGroupLabel ? ` | ${run.payGroupLabel}` : ''}</p><div className="flex justify-between items-center"><p className="text-sm">Net pay <strong>{peso(Number(run.totalNetPay))}</strong></p><PayrollRunRowActions runId={run.id} status={run.status} /></div></div>)}</div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-4 font-medium text-slate-500 text-xs whitespace-nowrap">Period</th>
                    <th className="text-left p-4 font-medium text-slate-500 text-xs whitespace-nowrap">Pay Date</th>
                    <th className="text-left p-4 font-medium text-slate-500 text-xs whitespace-nowrap">Status</th>
                    <th className="text-right p-4 font-medium text-slate-500 text-xs whitespace-nowrap">Gross Pay</th>
                    <th className="text-right p-4 font-medium text-slate-500 text-xs whitespace-nowrap">Total Deductions</th>
                    <th className="text-right p-4 font-medium text-slate-500 text-xs whitespace-nowrap">Net Pay</th>
                    <th className="text-center p-4 font-medium text-slate-500 text-xs whitespace-nowrap">Actions</th>
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
                        <p className="font-medium text-[#162d54]">{run.periodLabel}</p>
                        <p className="mt-1 text-xs text-slate-500">{run.payFrequency.replaceAll('_', ' ').toLowerCase()}</p>
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
                      <td className="p-4 text-right font-medium tabular-nums whitespace-nowrap">{peso(run.totalGross.toNumber())}</td>
                      <td className="p-4 text-right text-slate-500 tabular-nums whitespace-nowrap">{peso(run.totalDeductions.toNumber())}</td>
                      <td className="p-4 text-right font-semibold text-[#162d54] tabular-nums whitespace-nowrap bg-orange-50/30">{peso(run.totalNetPay.toNumber())}</td>
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
      <nav aria-label="Payroll history pages" className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-slate-500"><span>{count ? `${(page - 1) * 20 + 1}-${Math.min(page * 20, count)} of ${count} runs` : '0 runs'}</span><div className="flex items-center gap-4">{page > 1 && <Link href={pageUrl(page - 1)} className="min-h-10 inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 text-[#162d54] hover:bg-orange-50">Previous</Link>}<span>Page {page} of {pageCount}</span>{page < pageCount && <Link href={pageUrl(page + 1)} className="min-h-10 inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 text-[#162d54] hover:bg-orange-50">Next</Link>}</div></nav>
    </div>
  )
}

