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

export default async function PayrollPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const companyId = await resolveEffectiveCompanyId(session.user)
  if (!companyId) redirect('/login')

  const runs = await prisma.payrollRun.findMany({
    where: { companyId },
    orderBy: { periodStart: 'desc' },
    take: 30,
  })

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Draft',
    COMPUTED: 'Computed',
    FOR_APPROVAL: 'For Approval',
    APPROVED: 'Approved',
    LOCKED: 'Locked',
    CANCELLED: 'Cancelled',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-gray-500 mt-1">{runs.length} payroll runs</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/payroll/settings">
            <Button variant="outline">
              <Settings className="mr-2 w-4 h-4" />
              Payroll Settings
            </Button>
          </Link>
          <Link href="/payroll/new">
            <Button>
              <Plus className="mr-2 w-4 h-4" />
              New Payroll Run
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="text-center py-16">
              <PesoIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No payroll runs yet</p>
              <Link href="/payroll/new" className="mt-3 inline-block">
                <Button size="sm">Create your first payroll run</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <p className="font-medium text-gray-900">{run.periodLabel}</p>
                        <p className="text-xs text-gray-500">{run.payFrequency}</p>
                      </td>
                      <td className="p-4 text-gray-600">{formatDate(run.payDate)}</td>
                      <td className="p-4">
                        <Badge className={`text-xs border-0 ${getStatusColor(run.status)}`}>
                          {STATUS_LABELS[run.status]}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-medium">{peso(run.totalGross.toNumber())}</td>
                      <td className="p-4 text-right text-red-600">{peso(run.totalDeductions.toNumber())}</td>
                      <td className="p-4 text-right font-bold text-green-700">{peso(run.totalNetPay.toNumber())}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link href={`/payroll/${run.id}`}>
                            <Button variant="ghost" size="sm" className="text-[#2E4156] hover:text-white">View</Button>
                          </Link>
                          <PayrollRunRowActions runId={run.id} status={run.status} />
                        </div>
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

