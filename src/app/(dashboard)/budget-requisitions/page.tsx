import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardList } from 'lucide-react'
import { BudgetReqActionButtons } from '@/components/budget/BudgetReqActionButtons'

function fmtDate(d: Date | string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPeso(n: unknown) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function statusBadge(status: string) {
  const styles: Record<string, React.CSSProperties> = {
    PENDING:   { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
    APPROVED:  { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
    REJECTED:  { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
    CANCELLED: { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' },
  }
  return (
    <span
      className="text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap"
      style={styles[status] ?? {}}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

export default async function BudgetRequisitionsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = session.user.companyId!
  const status = params.status || undefined

  const requisitions = await prisma.budgetRequisition.findMany({
    where: {
      companyId,
      ...(status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' } : {}),
    },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeNo: true,
          department: { select: { name: true } },
          position:   { select: { title: true } },
        },
      },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget Requisitions</h1>
          <p className="text-gray-500 mt-1 text-sm">{requisitions.length} request{requisitions.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'All',      value: '' },
          { label: 'Pending',  value: 'PENDING' },
          { label: 'Approved', value: 'APPROVED' },
          { label: 'Rejected', value: 'REJECTED' },
          { label: 'Cancelled', value: 'CANCELLED' },
        ].map(s => (
          <Link key={s.value || 'all'} href={s.value ? `?status=${s.value}` : '/budget-requisitions'}>
            <Button
              variant={(status === s.value || (!status && !s.value)) ? 'default' : 'outline'}
              size="sm"
              style={status === s.value || (!status && !s.value)
                ? { background: '#fa5e01', color: '#fff', borderColor: '#fa5e01' }
                : {}}
            >
              {s.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {requisitions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <ClipboardList className="w-12 h-12 opacity-25" />
              <p className="text-sm">No budget requisitions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="p-4 font-semibold text-gray-600">Employee</th>
                    <th className="p-4 font-semibold text-gray-600">Title</th>
                    <th className="p-4 font-semibold text-gray-600">Amount</th>
                    <th className="p-4 font-semibold text-gray-600">Items</th>
                    <th className="p-4 font-semibold text-gray-600">Needed By</th>
                    <th className="p-4 font-semibold text-gray-600">Filed</th>
                    <th className="p-4 font-semibold text-gray-600">Status</th>
                    <th className="p-4 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requisitions.map(req => (
                    <tr key={req.id} className="hover:bg-gray-50 transition-colors">
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
                      </td>
                      <td className="p-4">
                        <span className="font-bold text-gray-900">{fmtPeso(req.totalAmount)}</span>
                      </td>
                      <td className="p-4 text-gray-600">{req.items.length}</td>
                      <td className="p-4 text-gray-600 text-xs">{fmtDate(req.neededBy)}</td>
                      <td className="p-4 text-gray-600 text-xs">{fmtDate(req.createdAt)}</td>
                      <td className="p-4">{statusBadge(req.status)}</td>
                      <td className="p-4">
                        {req.status === 'PENDING' && (
                          <BudgetReqActionButtons
                            id={req.id}
                            title={req.title}
                            amount={fmtPeso(req.totalAmount)}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
