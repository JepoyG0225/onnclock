import { format } from 'date-fns'
import { CalendarDays, Mail, MapPin, Phone, UserRound } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmployeeBlockEditor, type EmployeeEditField } from './EmployeeBlockEditor'
import { EmployeeDocumentsManager } from './EmployeeDocumentsManager'
import { EmployeeProfileSettings } from './EmployeeProfileSettings'
import { EmployeeStatusButton } from './EmployeeStatusButton'
import { EmployeePhotoUploader } from './EmployeePhotoUploader'

type Leave = { id: string; name: string; code: string; entitled: number; used: number; pending: number; carriedOver: number }
type Payslip = {
  id: string; grossPay: number; totalDeductions: number; netPay: number; periodStart: string; periodEnd: string
  sssEmployee: number; philhealthEmployee: number; pagibigEmployee: number; withholdingTax: number
  sssLoanDeduction: number; pagibigLoan: number; companyLoan: number
  lateDeduction: number; undertimeDeduction: number; absenceDeduction: number; otherDeductions: number
}
type Hour = { date: string; hours: number }

export type ReferenceEmployeeProfile = {
  id: string; employeeNo: string; firstName: string; middleName: string; lastName: string; initials: string
  photoUrl: string | null; position: string; department: string; employmentStatus: string; employmentType: string; isActive: boolean
  hireDate: string; gender: string; birthDate: string; personalEmail: string; workEmail: string
  mobileNo: string; presentAddress: string; notes: string; userId: string | null
  rateType: string; basicSalary: number; payFrequency: string; bankName: string; bankAccountNo: string
  departmentId: string; positionId: string; civilStatus: string
}

const editorTitle = (title: string, editor: React.ReactNode) => (
  <CardHeader className="relative px-4 pr-12">
    <CardTitle className="text-sm">{title}</CardTitle>
    <div className="absolute right-3 top-2">{editor}</div>
  </CardHeader>
)

export function EmployeeProfileReferenceLayout({
  employee, leaves, payslips, hours, currency, departments, positions, performanceRatings,
}: {
  employee: ReferenceEmployeeProfile; leaves: Leave[]; payslips: Payslip[]; hours: Hour[]; currency: string
  departments: Array<{ id: string; name: string }>; positions: Array<{ id: string; title: string }>
  performanceRatings: number[]
}) {
  const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency, maximumFractionDigits: 2 })
  const latest = payslips[0]
  const deductionItems = latest ? [
    ['SSS', latest.sssEmployee],
    ['PhilHealth', latest.philhealthEmployee],
    ['Pag-IBIG', latest.pagibigEmployee],
    ['Withholding Tax', latest.withholdingTax],
    ['SSS Loan', latest.sssLoanDeduction],
    ['Pag-IBIG Loan', latest.pagibigLoan],
    ['Company Loan', latest.companyLoan],
    ['Late', latest.lateDeduction],
    ['Undertime', latest.undertimeDeduction],
    ['Absences', latest.absenceDeduction],
    ['Other Deductions', latest.otherDeductions],
  ].filter(([, amount]) => Number(amount) > 0) as Array<[string, number]> : []
  const now = new Date()
  const year = now.getFullYear(), month = now.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const calendarCells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const maxHours = Math.max(8, ...hours.map(item => item.hours))
  const personalFields: EmployeeEditField[] = [
    { key: 'firstName', label: 'First Name' }, { key: 'middleName', label: 'Middle Name' }, { key: 'lastName', label: 'Last Name' },
    { key: 'gender', label: 'Gender', type: 'select', options: ['MALE', 'FEMALE', 'OTHER'].map(value => ({ value, label: value })) },
    { key: 'birthDate', label: 'Date of Birth', type: 'date' }, { key: 'personalEmail', label: 'Email', type: 'email' },
    { key: 'mobileNo', label: 'Phone', type: 'tel' }, { key: 'presentAddress', label: 'Address', type: 'textarea' },
  ]
  const employmentFields: EmployeeEditField[] = [
    { key: 'departmentId', label: 'Department', type: 'select', options: departments.map(d => ({ value: d.id, label: d.name })) },
    { key: 'positionId', label: 'Position', type: 'select', options: positions.map(p => ({ value: p.id, label: p.title })) },
    { key: 'employmentType', label: 'Employment Type', type: 'select', options: ['FULL_TIME', 'PART_TIME', 'CONTRACTUAL'].map(value => ({ value, label: value.replaceAll('_', ' ') })) },
    { key: 'employmentStatus', label: 'Status', type: 'select', options: ['PROBATIONARY', 'REGULAR', 'CONTRACTUAL', 'PROJECT_BASED', 'PART_TIME'].map(value => ({ value, label: value.replaceAll('_', ' ') })) },
    { key: 'hireDate', label: 'Join Date', type: 'date' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-black text-black">Employee Details</h1><p className="text-xs text-gray-500">Dashboard / Employees / Employee Details</p></div>
        <div className="flex items-center gap-2">
          <EmployeeStatusButton employeeId={employee.id} isActive={employee.isActive} employeeName={`${employee.firstName} ${employee.lastName}`} />
          <EmployeeProfileSettings employeeId={employee.id} workEmail={employee.workEmail || null} personalEmail={employee.personalEmail || null} hasUser={Boolean(employee.userId)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-3">
          <Card className="relative overflow-hidden py-0">
            <CardContent className="p-4 text-center">
              <EmployeePhotoUploader employeeId={employee.id} photoUrl={employee.photoUrl} initials={employee.initials} />
              <h2 className="mt-4 font-black">{employee.firstName} {employee.lastName}</h2>
              <p className="text-xs text-gray-500">{employee.position} · {employee.department}</p>
              <div className="mt-3 flex justify-center gap-2"><Badge variant="secondary">{employee.employeeNo}</Badge><Badge variant="success">{employee.employmentStatus.replaceAll('_', ' ')}</Badge></div>
              <div className="mt-5 divide-y text-xs">
                <div className="flex justify-between py-3"><span className="text-gray-500">Employment Type</span><b>{employee.employmentType.replaceAll('_', ' ')}</b></div>
                <div className="flex justify-between py-3"><span className="text-gray-500">Department</span><b>{employee.department}</b></div>
                <div className="flex justify-between py-3"><span className="text-gray-500">Join Date</span><b>{format(new Date(employee.hireDate), 'd MMMM yyyy')}</b></div>
              </div>
              <div className="absolute right-3 top-3"><EmployeeBlockEditor employeeId={employee.id} title="Employment Details" fields={employmentFields} values={employee} /></div>
            </CardContent>
          </Card>

          <Card>
            {editorTitle('Personal Info', <EmployeeBlockEditor employeeId={employee.id} title="Personal Information" fields={personalFields} values={employee} />)}
            <CardContent className="space-y-4 px-4 text-sm">
              {[[UserRound, 'Gender', employee.gender], [CalendarDays, 'Date of Birth', employee.birthDate ? format(new Date(employee.birthDate), 'd MMMM yyyy') : '—'], [Mail, 'Email Address', employee.personalEmail || employee.workEmail || '—'], [Phone, 'Phone', employee.mobileNo || '—'], [MapPin, 'Address', employee.presentAddress || '—']].map(([Icon, label, value]) => {
                const InfoIcon = Icon as typeof UserRound
                return <div key={String(label)} className="flex gap-3"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-primary)]" /><div><p className="text-[10px] text-gray-500">{String(label)}</p><p className="text-xs font-medium leading-relaxed">{String(value)}</p></div></div>
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:col-span-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(leaves.length ? leaves.slice(0, 4) : [{ id: 'all', name: 'All Leaves', code: 'ALL', entitled: 0, used: 0, pending: 0, carriedOver: 0 }]).map(leave => {
              const total = leave.entitled + leave.carriedOver, available = Math.max(0, total - leave.used - leave.pending), pct = total ? Math.round((available / total) * 100) : 0
              const leaveLabel = leave.code.toUpperCase() === 'SIL' || leave.name.toLowerCase().includes('service incentive') ? 'SIL' : leave.name
              return <Card key={leave.id} className="py-0"><CardContent className="p-3 text-center"><p className="truncate whitespace-nowrap text-[10px] font-semibold" title={leave.name}>{leaveLabel}</p><div className="mx-auto mt-2 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--brand-primary) ${pct}%, #eeeeee 0)` }}><div className="flex h-12 w-12 flex-col items-center justify-center rounded-full bg-white"><b>{available}<span className="text-[9px] font-normal">/{total}</span></b><span className="text-[8px]">Days</span></div></div></CardContent></Card>
            })}
          </div>

          <Card><CardHeader><CardTitle className="text-sm">Performance Overview</CardTitle></CardHeader><CardContent><div className="flex items-end justify-between"><div><p className="text-3xl font-black text-[var(--brand-ink)]">{performanceRatings.length ? `${((performanceRatings.at(-1) ?? 0) / 5 * 100).toFixed(1)}%` : '—'}</p><p className="text-xs text-gray-500">{performanceRatings.length ? 'Latest completed review' : 'No completed review yet'}</p></div><Badge variant="success">Current Year</Badge></div><div className="mt-6 flex h-28 items-end gap-2 border-b">{(performanceRatings.length ? performanceRatings : [0]).map((rating, i) => <div key={i} className="flex-1 border-t-2 border-[var(--brand-primary)] bg-[var(--brand-highlight-soft)]" style={{ height: `${Math.max(3, rating / 5 * 100)}%` }} />)}</div></CardContent></Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-sm">Hours Logged</CardTitle></CardHeader><CardContent><p className="text-2xl font-black">{hours.reduce((sum, item) => sum + item.hours, 0).toFixed(1)}<span className="text-xs font-normal"> hrs</span></p><div className="mt-4 flex h-28 items-end gap-2">{hours.slice(-7).map(item => <div key={item.date} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-[var(--brand-primary)]" style={{ height: `${Math.max(5, item.hours / maxHours * 90)}px` }} /><span className="text-[9px] text-gray-500">{format(new Date(item.date), 'EEE')[0]}</span></div>)}</div></CardContent></Card>
            <Card className="relative"><CardHeader><CardTitle className="text-sm">Documents</CardTitle></CardHeader><CardContent className="px-4"><EmployeeDocumentsManager employeeId={employee.id} /></CardContent></Card>
          </div>
          <Card>{editorTitle('Internal Notes', <EmployeeBlockEditor employeeId={employee.id} title="Internal Notes" fields={[{ key: 'notes', label: 'Notes', type: 'textarea' }]} values={{ notes: employee.notes }} />)}<CardContent><div className="rounded-xl bg-[var(--brand-highlight-soft)] p-4 text-sm text-[var(--brand-ink)]">{employee.notes || 'No internal notes yet.'}</div></CardContent></Card>
        </div>

        <div className="space-y-4 xl:col-span-3">
          <Card><CardHeader><CardTitle className="text-sm">{format(now, 'MMMM yyyy')}</CardTitle></CardHeader><CardContent><div className="grid grid-cols-7 gap-1 text-center text-[10px]">{'SMTWTFS'.split('').map((d,i)=><b key={i} className="py-1 text-gray-400">{d}</b>)}{calendarCells.map((day,i)=><span key={i} className={`rounded-md py-2 ${day === now.getDate() ? 'bg-[var(--brand-primary)] text-white' : day && [0,6].includes(i%7) ? 'bg-[var(--brand-highlight-soft)]' : ''}`}>{day}</span>)}</div></CardContent></Card>
          <Card>
            {editorTitle('Payroll Summary', <EmployeeBlockEditor employeeId={employee.id} title="Compensation" fields={[{ key: 'rateType', label: 'Rate Type', type: 'select', options: ['MONTHLY','DAILY','HOURLY'].map(value=>({value,label:value})) }, { key: 'basicSalary', label: 'Base Rate', type: 'number' }, { key: 'payFrequency', label: 'Pay Frequency', type: 'select', options: ['SEMI_MONTHLY','MONTHLY','WEEKLY','DAILY'].map(value=>({value,label:value.replaceAll('_',' ')})) }, { key: 'bankName', label: 'Bank Name' }, { key: 'bankAccountNo', label: 'Bank Account Number' }]} values={employee} />)}
            <CardContent className="space-y-3 px-4 text-xs">
              <div className="divide-y">
                <div className="flex justify-between py-3"><span>Base Salary</span><b>{money.format(employee.basicSalary)}</b></div>
                <div className="flex justify-between py-3"><span>Gross Pay</span><b>{latest ? money.format(latest.grossPay) : '—'}</b></div>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">Deductions Breakdown</p>
                <div className="mt-2 divide-y divide-rose-100">
                  {deductionItems.length ? deductionItems.map(([label, amount]) => (
                    <div key={label} className="flex justify-between gap-3 py-1.5">
                      <span className="text-slate-600">{label}</span>
                      <b className="text-rose-600">{money.format(amount)}</b>
                    </div>
                  )) : <p className="py-2 text-slate-500">No deductions for the latest payroll period.</p>}
                </div>
                <div className="mt-2 flex justify-between border-t border-rose-200 pt-2 text-sm font-black">
                  <span>Total</span>
                  <span className="text-[var(--brand-danger)]">{latest ? money.format(latest.totalDeductions) : '—'}</span>
                </div>
              </div>
              <div className="divide-y">
                <div className="flex justify-between py-3"><span>Net Pay</span><b>{latest ? money.format(latest.netPay) : '—'}</b></div>
                <div className="flex justify-between py-3 font-black"><span>Pay Frequency</span><span>{employee.payFrequency.replaceAll('_',' ')}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
