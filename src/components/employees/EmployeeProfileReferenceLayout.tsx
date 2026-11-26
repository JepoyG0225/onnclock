import styles from './EmployeeProfile.module.css'
import Link from 'next/link'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { format } from 'date-fns'
import { CalendarDays, Mail, MapPin, Phone, UserRound, ArrowLeft, Pencil } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmployeeBlockEditor, type EmployeeEditField } from './EmployeeBlockEditor'
import { EmployeeDocumentsManager } from './EmployeeDocumentsManager'
import { EmployeeProfileSettings } from './EmployeeProfileSettings'
import { EmployeeStatusButton } from './EmployeeStatusButton'
import { EmployeePhotoUploader } from './EmployeePhotoUploader'

type Leave = { id: string; name: string; code: string; entitled: number; used: number; pending: number; carriedOver: number; encashed?: number }
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
  sssEnabled: boolean; philhealthEnabled: boolean; pagibigEnabled: boolean; withholdingTaxEnabled: boolean
  isExemptFromTax: boolean; isMinimumWageEarner: boolean
  departmentId: string; positionId: string; civilStatus: string
}

const editorTitle = (title: string, editor: React.ReactNode) => (
  <CardHeader className="relative px-4 pr-12">
    <CardTitle className="text-sm">{title}</CardTitle>
    <div className="absolute right-3 top-2">{editor}</div>
  </CardHeader>
)

export function EmployeeProfileReferenceLayout({
  employee, leaves, payslips, hours, currency, departments, positions, performanceRatings, earnings, recurringDeductions,
}: {
  employee: ReferenceEmployeeProfile; leaves: Leave[]; payslips: Payslip[]; hours: Hour[]; currency: string
  departments: Array<{ id: string; name: string }>; positions: Array<{ id: string; title: string }>
  earnings: Array<{ id: string; name: string; amount: number; variable: boolean }>
  recurringDeductions: Array<{ id: string; name: string; amount: number }>
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
    <div className={styles.profile}>
      <Link href="/employees" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#162d54]"><ArrowLeft size={15}/>Employees</Link>
      <header className={styles.hero}>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
            <div className={styles.avatar}><EmployeePhotoUploader employeeId={employee.id} photoUrl={employee.photoUrl} initials={employee.initials}/></div>
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Employee profile</p>
              <h1 className="break-words text-xl font-semibold tracking-tight text-[#162d54] sm:text-2xl">{employee.firstName} {employee.lastName}</h1>
              <p className="mt-1 break-words text-sm text-slate-500">{employee.position} / {employee.department}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant="secondary">{employee.employeeNo}</Badge><Badge variant={employee.isActive ? 'success' : 'secondary'}>{employee.isActive ? employee.employmentStatus.replaceAll('_', ' ') : 'Inactive'}</Badge></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PermissionGate permission="employees:write"><Link className="inline-flex items-center gap-2 rounded-xl bg-[#ff5900] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#e65000]" href={`/employees/${employee.id}/edit`}><Pencil size={15}/>Edit profile</Link><EmployeeStatusButton employeeId={employee.id} isActive={employee.isActive} employeeName={`${employee.firstName} ${employee.lastName}`}/></PermissionGate>
            <EmployeeProfileSettings employeeId={employee.id} workEmail={employee.workEmail || null} personalEmail={employee.personalEmail || null} hasUser={Boolean(employee.userId)}/>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 lg:grid-cols-4">
          {[["Department", employee.department], ["Employment", employee.employmentType.replaceAll('_',' ')], ["Joined", format(new Date(employee.hireDate), 'd MMM yyyy')], ["Pay frequency", employee.payFrequency.replaceAll('_',' ')]].map(([label,value])=><div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-medium text-[#162d54]">{value}</p></div>)}
        </div>
      </header>
      <div className={styles.columns}>
        <div className="min-w-0 space-y-5">
          <Card>
            {editorTitle('Employment details', <PermissionGate permission="employees:write"><EmployeeBlockEditor employeeId={employee.id} title="Employment Details" fields={employmentFields} values={employee}/></PermissionGate>)}
            <CardContent className="grid grid-cols-2 gap-5 text-sm">
              {[["Position",employee.position],["Department",employee.department],["Employment status",employee.employmentStatus.replaceAll('_',' ')],["Employee number",employee.employeeNo]].map(([label,value])=><div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-medium text-[#162d54]">{value}</p></div>)}
            </CardContent>
          </Card>
          <Card>
            {editorTitle('Personal & contact information', <PermissionGate permission="employees:write"><EmployeeBlockEditor employeeId={employee.id} title="Personal Information" fields={personalFields} values={employee}/></PermissionGate>)}
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {[[UserRound,'Gender',employee.gender],[CalendarDays,'Date of birth',employee.birthDate ? format(new Date(employee.birthDate),'d MMM yyyy') : 'Not provided'],[Mail,'Email',employee.personalEmail || employee.workEmail || 'Not provided'],[Phone,'Phone',employee.mobileNo || 'Not provided'],[MapPin,'Address',employee.presentAddress || 'Not provided']].map(([Icon,label,value])=>{const InfoIcon=Icon as typeof UserRound;return <div key={String(label)} className="flex min-w-0 items-start gap-3"><span className="rounded-lg bg-slate-50 p-2 text-[#162d54]"><InfoIcon size={16}/></span><div className="min-w-0"><p className="text-xs text-slate-500">{String(label)}</p><p className="mt-1 break-words text-sm font-medium text-[#162d54]">{String(value)}</p></div></div>})}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="px-4"><CardTitle className="text-sm">Compensation</CardTitle><p className="text-xs text-slate-500">Current pay setup and latest payroll deductions</p></CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 px-4 text-sm sm:grid-cols-2">
              {[
                { id: 'basic-pay', title: 'Basic Pay', content: <><p className="text-xl font-bold text-[var(--brand-primary)]">{money.format(employee.basicSalary)}</p><p className="mt-1 text-slate-500">{employee.rateType.toLowerCase()} rate</p><p className="mt-2">Paid {employee.payFrequency.replaceAll('_', ' ').toLowerCase()}</p></> },
                { id: 'additional-earnings', title: 'Additional Earnings', content: <div className="space-y-2">{earnings.length ? earnings.map(item => <div key={item.id} className="flex justify-between gap-3"><span>{item.name}</span><b className="shrink-0">{item.variable ? 'Variable per run' : money.format(item.amount)}</b></div>) : <p className="text-slate-500">No additional earnings assigned.</p>}</div> },
                { id: 'deductions', title: 'Deductions', content: <div className="space-y-3">
                  <div><p className="mb-2 font-medium text-slate-500">Government contributions</p>{[['SSS', employee.sssEnabled], ['PhilHealth', employee.philhealthEnabled], ['Pag-IBIG', employee.pagibigEnabled], ['Withholding tax', employee.withholdingTaxEnabled && !employee.isExemptFromTax && !employee.isMinimumWageEarner]].map(([label, enabled]) => <div key={String(label)} className="flex justify-between gap-2 py-1"><span>{label}</span><span className={enabled ? 'text-[var(--brand-primary)] font-semibold' : 'text-slate-400'}>{enabled ? 'Enabled' : 'Disabled'}</span></div>)}</div>
                  <div className="border-t pt-3"><p className="mb-2 font-medium text-slate-500">Recurring deductions</p>{recurringDeductions.length ? recurringDeductions.map(item => <div key={item.id} className="flex justify-between gap-3 py-1"><span>{item.name}</span><b>{money.format(item.amount)}</b></div>) : <p className="text-slate-500">None assigned.</p>}</div>
                  {latest && <div className="border-t pt-3"><p className="font-medium">Latest payroll deductions</p><p className="mb-2 mt-1 text-slate-500">{format(new Date(latest.periodStart), 'MMM d, yyyy')} - {format(new Date(latest.periodEnd), 'MMM d, yyyy')}</p>{deductionItems.map(([label, amount]) => <div key={label} className="flex justify-between gap-3 py-1"><span>{label}</span><b>{money.format(amount)}</b></div>)}<div className="mt-2 flex justify-between border-t pt-2 font-bold"><span>Total deducted</span><span>{money.format(latest.totalDeductions)}</span></div></div>}
                </div> },
              ].map(block => <div key={block.id} className={`relative rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition-colors hover:border-orange-300 ${block.id === 'deductions' ? 'sm:col-span-2' : ''}`}>
                <h3 className="mb-3 pr-8 text-sm font-semibold text-[var(--brand-primary)]">{block.title}</h3>
                {block.content}
                <PermissionGate permission="employees:write"><Link href={`/employees/${employee.id}/edit?tab=compensation#${block.id}`} aria-label={`Edit ${block.title}`} className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-blue-600"><span aria-hidden="true" className="absolute right-3 top-3 text-blue-600">&rarr;</span></Link></PermissionGate>
              </div>)}
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle>Documents</CardTitle><p className="text-xs text-slate-500">Employee files and supporting records.</p></CardHeader><CardContent><EmployeeDocumentsManager employeeId={employee.id}/></CardContent></Card>
          <Card>{editorTitle('Internal notes', <PermissionGate permission="employees:write"><EmployeeBlockEditor employeeId={employee.id} title="Internal Notes" fields={[{key:'notes',label:'Notes',type:'textarea'}]} values={{notes:employee.notes}}/></PermissionGate>)}<CardContent><p className="whitespace-pre-wrap break-words rounded-xl bg-orange-50/60 p-4 text-sm leading-6 text-slate-600">{employee.notes || 'No internal notes yet.'}</p></CardContent></Card>
        </div>
        <aside className="min-w-0 space-y-5">
          <Card><CardHeader><div className="flex items-center justify-between gap-2"><CardTitle>Leave balances</CardTitle><PermissionGate permission="employees:write"><Link aria-label="Edit leave entitlements" href={`/employees/${employee.id}/edit?tab=leaves`} className="rounded-lg border p-2 text-[#162d54]"><Pencil size={14}/></Link></PermissionGate></div><p className="text-xs text-slate-500">Current-year balances after usage, pending requests and encashment.</p></CardHeader><CardContent className="space-y-4">
            {!leaves.length ? <p className="text-sm text-slate-500">No leave balances recorded.</p> : leaves.map(leave=>{const total=leave.entitled+leave.carriedOver,available=Math.max(0,total-leave.used-leave.pending-(leave.encashed??0)),pct=total ? Math.min(100,available/total*100) : 0;return <div key={leave.id}><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-[#162d54]">{leave.name}</span><span className="shrink-0 text-sm font-semibold text-[#162d54]">{available}<span className="ml-1 text-xs font-normal text-slate-500">days</span></span></div><div className="my-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#ff5900]" style={{width:`${pct}%`}}/></div><p className="text-xs text-slate-500">{total} allocated / {leave.used} used / {leave.pending} pending</p></div>})}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Recent hours</CardTitle><p className="text-xs text-slate-500">Regular hours from the latest {hours.length} attendance records.</p></CardHeader><CardContent><p className="text-3xl font-semibold text-[#162d54]">{hours.reduce((sum,item)=>sum+item.hours,0).toFixed(1)}<span className="ml-1 text-sm font-normal text-slate-500">hrs</span></p>{hours.length ? <div className="mt-5 flex h-32 items-end gap-2">{hours.map((item,i)=><div key={`${item.date}-${i}`} className="flex min-w-0 flex-1 flex-col items-center gap-2" title={`${format(new Date(item.date),'MMM d')}: ${item.hours.toFixed(1)} hours`}><div className="w-full rounded-t-md bg-[#162d54]" style={{height:`${Math.max(2,item.hours/maxHours*90)}px`}}/><span className="text-[10px] text-slate-500">{format(new Date(item.date),'M/d')}</span></div>)}</div> : <p className="mt-3 text-xs text-slate-500">No attendance records yet.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>Performance</CardTitle><p className="text-xs text-slate-500">Latest rated review</p></CardHeader><CardContent><p className="text-3xl font-semibold text-[#162d54]">{performanceRatings.length ? (performanceRatings.at(-1)??0).toFixed(1) : '--'}<span className="ml-1 text-sm font-normal text-slate-500">/ 5</span></p>{performanceRatings.length ? <div className="mt-4 flex h-20 items-end gap-2" aria-label="Recent review ratings">{performanceRatings.map((rating,i)=><div key={i} title={`${rating} out of 5`} className="flex-1 rounded-t-md bg-orange-200 border-t-2 border-[#ff5900]" style={{height:`${Math.max(3,Math.min(100,rating/5*100))}%`}}/>)}</div> : <p className="mt-3 text-xs text-slate-500">No rated reviews yet.</p>}</CardContent></Card>
        </aside>
      </div>
    </div>
  )
}
