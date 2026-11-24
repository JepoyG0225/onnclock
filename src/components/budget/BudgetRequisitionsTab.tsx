import { KpiCard } from '@/components/ui/kpi-card'
import { Wallet, Clock, CheckCircle2, Search } from 'lucide-react'
import { resolveEffectiveCompanyId } from '@/lib/effective-company'
import { Badge } from '@/components/ui/badge'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardList } from 'lucide-react'
import { BudgetReqAttachmentsModal } from '@/components/budget/BudgetReqAttachmentsModal'
import BudgetReqRowClient from '@/components/budget/BudgetReqRowClient'
import { ChevronRight } from 'lucide-react'
import { authorizeAdvance, buildPlan, resolveWorkflow } from '@/lib/approvals/engine'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'

function fmtDate(d: Date | string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPeso(n: unknown) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function statusBadge(status: string) {
  return <Badge status={status}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>
}

export default async function BudgetRequisitionsTab({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')
  const status = ['PENDING','APPROVED','REJECTED','CANCELLED'].includes(params.status??'')?params.status:undefined
  const query=(params.q??'').trim().slice(0,200)
  const permissions = await getEffectivePermissions(session.user.role, companyId, session.user.id)
  if(!['budget:read','budget:approve','payroll:read','employees:read'].some(p=>permissions.includes(p as never)))return <p className="rounded-xl border bg-white p-5 text-sm">You do not have access to budget requisitions.</p>
  const legacyCanApprove = permissions.includes('budget:approve')

  const requisitions = await prisma.budgetRequisition.findMany({
    where: {
      companyId,
      ...(query?{OR:[{title:{contains:query,mode:'insensitive' as const}},{purpose:{contains:query,mode:'insensitive' as const}},{employee:{firstName:{contains:query,mode:'insensitive' as const}}},{employee:{lastName:{contains:query,mode:'insensitive' as const}}},{employee:{employeeNo:{contains:query,mode:'insensitive' as const}}}]}:{}),
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' } : {}),
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          departmentId: true,
          department: { select: { name: true } },
          position:   { select: { title: true } },
        },
      },
      items: true,
      attachments: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const summary=await prisma.budgetRequisition.groupBy({by:['status'],where:{companyId},_count:{_all:true},_sum:{totalAmount:true}})
  const total=summary.reduce((n,g)=>n+g._count._all,0),pending=summary.find(g=>g.status==='PENDING'),approved=summary.find(g=>g.status==='APPROVED')
  const workflowByDepartment = new Map<string, ReturnType<typeof resolveWorkflow>>()
  const approvalGates = new Map(
    await Promise.all(requisitions.map(async requisition => {
      if (requisition.status !== 'PENDING') {
        return [requisition.id, { canAct: false, reason: undefined }] as const
      }

      const departmentId = requisition.employee.departmentId
      const workflowKey = departmentId ?? ''
      let workflowPromise = workflowByDepartment.get(workflowKey)
      if (!workflowPromise) {
        workflowPromise = resolveWorkflow({ companyId, type: 'BUDGET', departmentId })
        workflowByDepartment.set(workflowKey, workflowPromise)
      }

      const workflow = await workflowPromise
      if (!workflow) {
        return [requisition.id, {
          canAct: legacyCanApprove,
          reason: legacyCanApprove ? undefined : 'You do not have permission to approve budget requisitions',
        }] as const
      }

      const currentLevel = requisition.approvalLevel ?? 0
      const plan = buildPlan(workflow, {
        amount: Number(requisition.totalAmount),
        title: requisition.title,
        departmentId: departmentId ?? '',
      })
      const advance = await authorizeAdvance({
        plan,
        currentLevel,
        actorUserId: session.user.id,
        requesterDepartmentId: departmentId,
        requesterEmployeeId: requisition.employee.id,
      })
      const canAct = legacyCanApprove && (advance.noChain || advance.authorized)
      return [requisition.id, {
        canAct,
        reason: canAct
          ? undefined
          : advance.currentStep
            ? 'Not authorized for this approval level'
            : `No approver configured for level ${currentLevel + 1}`,
      }] as const
    })),
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-primary">Budget requisitions</h2>
          <p className="text-gray-500 mt-1 text-sm">Review planned spending, supporting documents, and approval requests.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><KpiCard label="Total requests" value={total} icon={<ClipboardList className="h-4 w-4"/>} hint="All requisitions"/><KpiCard label="Pending review" value={pending?._count._all??0} icon={<Clock className="h-4 w-4"/>} hint="Awaiting approval" tone="accent"/><KpiCard label="Approved requests" value={approved?._count._all??0} icon={<CheckCircle2 className="h-4 w-4"/>} hint="Approved requisitions"/><KpiCard label="Approved budget" value={fmtPeso(approved?._sum.totalAmount??0)} icon={<Wallet className="h-4 w-4"/>} hint="Total approved amount" tone="accent"/></div>
      <form action="/requisitions" className="flex flex-wrap gap-2 rounded-2xl border bg-white p-4 shadow-sm"><input type="hidden" name="tab" value="budget"/>{status&&<input type="hidden" name="status" value={status}/>}<div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input aria-label="Search requisitions" name="q" defaultValue={query} placeholder="Search employee, title or purpose" className="h-10 w-full rounded-xl border bg-slate-50 pl-9 pr-3 text-sm"/></div><Button type="submit">Search</Button>{query&&<Link href="/requisitions?tab=budget" className="px-3 py-2 text-sm text-primary">Clear</Link>}</form>
      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'All',      value: '' },
          { label: 'Pending',  value: 'PENDING' },
          { label: 'Approved', value: 'APPROVED' },
          { label: 'Rejected', value: 'REJECTED' },
          { label: 'Cancelled', value: 'CANCELLED' },
        ].map(s => (
          <Link key={s.value || 'all'} href={`/requisitions?tab=budget${s.value?'&status='+s.value:''}${query?'&q='+encodeURIComponent(query):''}`}>
            <Button
              variant={(status === s.value || (!status && !s.value)) ? 'default' : 'outline'}
              size="sm"
              data-app-tab
              data-active={status === s.value || (!status && !s.value)}
              style={status === s.value || (!status && !s.value)
                ? { background: 'var(--brand-highlight)', color: '#fff', borderColor: 'var(--brand-highlight)' }
                : {}}
            >
              {s.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Table */}
      <Card className="overflow-hidden rounded-2xl border-slate-200 py-0 shadow-sm">
        <CardContent className="p-0"><div className="border-b px-5 py-4"><h3 className="font-semibold text-primary">Requests</h3><p className="mt-1 text-xs text-slate-500">Showing {requisitions.length} most recent matching requests (up to 100). Select a row for details.</p></div>
          {requisitions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <ClipboardList className="w-12 h-12 opacity-25" />
              <p className="text-sm">No budget requisitions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Employee</th>
                    <th className="p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Title / Purpose</th>
                    <th className="p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
                    <th className="p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Items</th>
                    <th className="p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Attachments</th>
                    <th className="p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Needed By</th>
                    <th className="p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Filed</th>
                    <th className="p-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    <th className="p-4 w-12" aria-label="Open details" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requisitions.map(req => {
                    const gate = approvalGates.get(req.id) ?? {
                      canAct: false,
                      reason: 'Approval availability could not be determined',
                    }
                    const dialogReq = {
                      id: req.id,
                      title: req.title,
                      purpose: req.purpose,
                      totalAmount: Number(req.totalAmount),
                      status: req.status as string,
                      neededBy: req.neededBy ? new Date(req.neededBy).toISOString() : null,
                      createdAt: new Date(req.createdAt).toISOString(),
                      employee: req.employee,
                      items: req.items.map(it => ({
                        id: it.id,
                        description: it.description,
                        quantity: it.quantity != null ? Number(it.quantity) : undefined,
                        unit: it.unit,
                        unitCost: it.unitCost != null ? Number(it.unitCost) : null,
                        lineTotal: it.totalCost != null ? Number(it.totalCost) : undefined,
                      })),
                      attachments: req.attachments.map(a => ({
                        id: a.id,
                        fileName: a.fileName,
                        fileUrl: a.fileUrl,
                        fileSize: a.fileSize,
                        mimeType: a.mimeType,
                      })),
                    }
                    return (
                      <BudgetReqRowClient
                        key={req.id}
                        request={dialogReq}
                        canAct={gate.canAct}
                        actionDisabledReason={gate.reason}
                      >
                        <td className="p-4">
                          <p className="font-semibold text-gray-900">
                            {req.employee.firstName} {req.employee.lastName}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {req.employee.employeeNo}
                            {req.employee.department?.name && ` · ${req.employee.department.name}`}
                          </p>
                        </td>
                        <td className="p-4">
                          <p className="font-medium text-gray-800 max-w-[200px] line-clamp-2">{req.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5 max-w-[200px] line-clamp-1 italic">{req.purpose}</p>
                          {req.reviewNote && (
                            <p className="text-xs text-blue-600 mt-1 max-w-[200px] line-clamp-1">
                              <span className="font-semibold">Note:</span> {req.reviewNote}
                            </p>
                          )}
                        </td>
                        <td className="p-4">
                          <span className="whitespace-nowrap font-semibold tabular-nums text-primary">{fmtPeso(req.totalAmount)}</span>
                        </td>
                        <td className="p-4 text-gray-600">{req.items.length}</td>
                        <td className="p-4">
                          <BudgetReqAttachmentsModal
                            attachments={req.attachments}
                            requisitionTitle={req.title}
                          />
                        </td>
                        <td className="p-4 text-gray-600 text-xs">{fmtDate(req.neededBy)}</td>
                        <td className="p-4 text-gray-600 text-xs">{fmtDate(req.createdAt)}</td>
                        <td className="p-4">{statusBadge(req.status as string)}</td>
                        <td className="p-4 text-slate-400">
                          <ChevronRight className="h-4 w-4" />
                        </td>
                      </BudgetReqRowClient>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
