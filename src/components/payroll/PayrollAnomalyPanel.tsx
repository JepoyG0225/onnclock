import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PayrollAnomaly } from '@/lib/payroll/anomalies'

export function PayrollAnomalyPanel({ anomalies }: { anomalies: PayrollAnomaly[] }) {
  const critical = anomalies.filter(item => item.severity === 'critical').length
  const warning = anomalies.filter(item => item.severity === 'warning').length
  return (
    <Card className={critical ? 'border-red-200' : warning ? 'border-amber-200' : 'border-emerald-200'}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Payroll checks</span>
          <span className="text-xs font-medium text-gray-500">{critical} critical · {warning} warning{warning === 1 ? '' : 's'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {anomalies.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />No payroll anomalies detected.</div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {anomalies.map(item => {
              const Icon = item.severity === 'critical' ? AlertCircle : item.severity === 'warning' ? AlertTriangle : Info
              const tone = item.severity === 'critical' ? 'border-red-200 bg-red-50 text-red-800' : item.severity === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'
              return <div key={item.key} className={`flex gap-3 rounded-lg border p-3 ${tone}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-sm font-semibold">{item.employeeName ? `${item.employeeName}: ` : ''}{item.title}</p><p className="mt-0.5 text-xs opacity-80">{item.detail}</p></div></div>
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
