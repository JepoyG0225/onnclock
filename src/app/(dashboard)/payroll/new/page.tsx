'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { DatePicker } from '@/components/ui/date-picker'
import { Loader2, Users } from 'lucide-react'

// ── Employee scope picker ───────────────────────────────────────────────────
type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACTUAL'
type ScopeMode = 'ALL' | 'EMPLOYMENT_TYPE' | 'CUSTOM'
const EMPLOYMENT_TYPES: Array<{ value: EmploymentType; label: string }> = [
  { value: 'FULL_TIME', label: 'Full-Time' },
  { value: 'PART_TIME', label: 'Part-Time' },
  { value: 'CONTRACTUAL', label: 'Contractual' },
]

interface PickerEmployee {
  id: string
  employeeNo: string
  firstName: string
  lastName: string
  employmentType: EmploymentType
  department?: { name: string } | null
  position?: { title: string } | null
}

export default function NewPayrollRunPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const existingRunId = searchParams.get('runId')
  const [saving, setSaving] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(true)
  const [payDateDelayDays, setPayDateDelayDays] = useState(5)
  const [formData, setFormData] = useState({
    periodStart: '',
    periodEnd: '',
    payFrequency: 'SEMI_MONTHLY',
    payDate: '',
    notes: '',
    payGroupLabel: '',
  })

  // Employee-scope state
  const [scopeMode, setScopeMode] = useState<ScopeMode>('ALL')
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<EmploymentType[]>([])
  const [employeeIds, setEmployeeIds] = useState<Set<string>>(new Set())
  const [employees, setEmployees] = useState<PickerEmployee[]>([])
  const [employeesLoaded, setEmployeesLoaded] = useState(false)
  const [empSearch, setEmpSearch] = useState('')

  // Unapproved-timesheet guard modal. Populated when the API rejects
  // a create with code: 'UNAPPROVED_DTRS' so we can let the admin
  // either fix the timesheets first or knowingly proceed.
  type UnapprovedEmployee = {
    id: string
    employeeNo: string
    firstName: string
    lastName: string
    unapprovedCount: number
  }
  const [unapprovedGuard, setUnapprovedGuard] = useState<{
    employees: UnapprovedEmployee[]
    totalRows: number
  } | null>(null)

  useEffect(() => {
    let active = true
    async function loadDefaults() {
      setLoadingDefaults(true)
      try {
        const [settingsRes, runRes] = await Promise.all([
          fetch('/api/payroll/settings'),
          existingRunId ? fetch(`/api/payroll/${existingRunId}`) : Promise.resolve(null),
        ])
        const data = await settingsRes.json().catch(() => ({}))
        if (!settingsRes.ok || !active) return
        const next = data.nextPeriod
        const settings = data.settings
        if (next && settings) {
          setPayDateDelayDays(Number(settings.defaultPayDelayDays ?? 5))
          setFormData(prev => ({
            ...prev,
            payFrequency: settings.payFrequency ?? prev.payFrequency,
            periodStart: next.periodStart ?? prev.periodStart,
            periodEnd: next.periodEnd ?? prev.periodEnd,
            payDate: next.payDate ?? prev.payDate,
          }))
        }
        if (runRes) {
          const runData = await runRes.json().catch(() => ({}))
          if (!runRes.ok) {
            toast.error(runData.error ?? 'Failed to load payroll period')
            router.push('/payroll')
            return
          }
          if (!active) return
          const run = runData.run
          setFormData({
            periodStart: String(run.periodStart).slice(0, 10),
            periodEnd: String(run.periodEnd).slice(0, 10),
            payFrequency: run.payFrequency,
            payDate: String(run.payDate).slice(0, 10),
            notes: run.notes ?? '',
            payGroupLabel: run.payGroupLabel ?? '',
          })
          setScopeMode(run.employeeScopeMode ?? 'ALL')
          setEmploymentTypeFilter(run.employmentTypeFilter ?? [])
          setEmployeeIds(new Set(run.employeeIds ?? []))
          setPayDateTouched(true)
        }
      } finally {
        if (active) setLoadingDefaults(false)
      }
    }
    void loadDefaults()
    return () => { active = false }
  }, [existingRunId, router])

  // Suggest a default pay date when the period end changes — but ONLY before
  // the user has had a chance to override it. Once the user touches the
  // payDate field manually, we leave it alone.
  const [payDateTouched, setPayDateTouched] = useState(false)
  useEffect(() => {
    if (payDateTouched) return
    if (!formData.periodEnd) return
    const end = new Date(formData.periodEnd)
    if (Number.isNaN(end.getTime())) return
    const payDate = new Date(end)
    payDate.setDate(payDate.getDate() + payDateDelayDays)
    const nextPayDate = payDate.toISOString().slice(0, 10)
    if (formData.payDate === nextPayDate) return
    setFormData(prev => ({ ...prev, payDate: nextPayDate }))
  }, [formData.periodEnd, payDateDelayDays, formData.payDate, payDateTouched])

  // Lazily load employees the first time the user switches off "ALL"
  useEffect(() => {
    if (scopeMode === 'ALL' || employeesLoaded) return
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/payroll/scope-employees')
        if (!res.ok) throw new Error('Failed to load employees')
        const data = await res.json()
        if (!active) return
        setEmployees(data.employees ?? [])
        setEmployeesLoaded(true)
      } catch {
        toast.error('Failed to load employees for scope picker')
      }
    })()
    return () => { active = false }
  }, [scopeMode, employeesLoaded])

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(e =>
      e.firstName.toLowerCase().includes(q) ||
      e.lastName.toLowerCase().includes(q) ||
      e.employeeNo.toLowerCase().includes(q) ||
      e.department?.name?.toLowerCase().includes(q) ||
      e.position?.title?.toLowerCase().includes(q),
    )
  }, [employees, empSearch])

  // Live count of employees the run will include — gives the user a quick
  // sanity-check before saving.
  const includedCount = useMemo(() => {
    if (scopeMode === 'ALL') return employeesLoaded ? employees.length : null
    if (scopeMode === 'EMPLOYMENT_TYPE') {
      if (!employeesLoaded) return null
      if (employmentTypeFilter.length === 0) return 0
      return employees.filter(e => employmentTypeFilter.includes(e.employmentType)).length
    }
    return employeeIds.size
  }, [scopeMode, employees, employeesLoaded, employmentTypeFilter, employeeIds])

  function toggleEmploymentType(t: EmploymentType) {
    setEmploymentTypeFilter(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t],
    )
  }
  function toggleEmployee(id: string) {
    setEmployeeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAllFiltered() {
    setEmployeeIds(prev => {
      const next = new Set(prev)
      for (const e of filteredEmployees) next.add(e.id)
      return next
    })
  }
  function clearAllSelected() {
    setEmployeeIds(new Set())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.periodStart || !formData.periodEnd || !formData.payDate) {
      toast.error('Please fill all required fields')
      return
    }
    if (scopeMode === 'EMPLOYMENT_TYPE' && employmentTypeFilter.length === 0) {
      toast.error('Select at least one employment type')
      return
    }
    if (scopeMode === 'CUSTOM' && employeeIds.size === 0) {
      toast.error('Select at least one employee')
      return
    }

    await createRun(false)
  }

  // Shared submit path so both the initial form submit AND the
  // "Create anyway" button in the unapproved-DTR modal hit the same
  // payload. `force` only differs on the second pass.
  async function createRun(force: boolean) {
    setSaving(true)
    try {
      const payload = {
        ...formData,
        payGroupLabel: formData.payGroupLabel.trim() || undefined,
        employeeScopeMode: scopeMode,
        employmentTypeFilter: scopeMode === 'EMPLOYMENT_TYPE' ? employmentTypeFilter : [],
        employeeIds: scopeMode === 'CUSTOM' ? Array.from(employeeIds) : [],
        force,
      }
      const res = await fetch(existingRunId ? `/api/payroll/${existingRunId}` : '/api/payroll', {
        method: existingRunId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // Special-case the unapproved-DTR guard so we render a list
        // of offending employees instead of a generic toast.
        if (res.status === 422 && err?.code === 'UNAPPROVED_DTRS') {
          setUnapprovedGuard({
            employees: err.unapprovedEmployees ?? [],
            totalRows: Number(err.totalUnapprovedRows ?? 0),
          })
          return
        }
        toast.error(err.error || 'Failed to create payroll run')
        return
      }

      const { run } = await res.json()
      setUnapprovedGuard(null)
      toast.success(existingRunId ? 'Payroll period updated. Recalculating payroll inputs.' : 'Payroll period created. Review the calculated payroll inputs next.')
      router.push(`/payroll/${run.id}?stage=inputs&compute=1`)
    } catch {
      toast.error('An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-gray-200 bg-white sm:grid-cols-3">
        {[
          { number: 1, label: 'Payroll Period', detail: 'Select payroll scope', active: true },
          { number: 2, label: 'Payroll Inputs', detail: 'Calculate and adjust', active: false },
          { number: 3, label: 'Payroll Summary', detail: 'Review and finalize', active: false },
        ].map((item, index) => (
          <div key={item.number} className={`flex items-center gap-3 px-5 py-4 ${index > 0 ? 'border-t sm:border-l sm:border-t-0' : ''} ${item.active ? 'bg-blue-50' : ''}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${item.active ? 'bg-[var(--brand-primary)] text-white' : 'bg-gray-100 text-gray-500'}`}>
              {item.number}
            </span>
            <span>
              <span className="block text-sm font-semibold text-[#1f2937]">{item.label}</span>
              <span className="block text-xs text-gray-500">{item.detail}</span>
            </span>
          </div>
        ))}
      </div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{existingRunId ? 'Edit Payroll Period' : 'New Payroll Run'}</h1>
        <p className="text-gray-500 mt-1">Set up the payroll period, scope, and pay date</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Payroll Period</CardTitle></CardHeader>
          <CardContent>
            {loadingDefaults && <p className="text-xs text-gray-500 mb-3">Loading payroll cycle defaults...</p>}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label data-tour="pr-period-start">Period Start *</Label>
                  <DatePicker
                    value={formData.periodStart}
                    onChange={(v) => setFormData(p => ({ ...p, periodStart: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label data-tour="pr-period-end">Period End *</Label>
                  <DatePicker
                    value={formData.periodEnd}
                    onChange={(v) => setFormData(p => ({ ...p, periodEnd: v }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label data-tour="pr-frequency">Pay Frequency</Label>
                  <Select
                    value={formData.payFrequency}
                    onValueChange={v => setFormData(p => ({ ...p, payFrequency: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEMI_MONTHLY">Semi-Monthly</SelectItem>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label data-tour="pr-pay-date">Pay Date *</Label>
                  <DatePicker
                    value={formData.payDate}
                    onChange={(v) => {
                      setPayDateTouched(true)
                      setFormData(p => ({ ...p, payDate: v }))
                    }}
                  />
                  <p className="text-[11px] text-gray-400">
                    {payDateTouched
                      ? 'Manual override — won\'t auto-adjust if you change the period end.'
                      : `Defaults to ${payDateDelayDays} day${payDateDelayDays === 1 ? '' : 's'} after period end.`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label data-tour="pr-pay-group">Pay Group <span className="text-gray-400 text-xs">(optional)</span></Label>
                  <Input
                    placeholder="e.g., Probationary cycle · Project XYZ"
                    value={formData.payGroupLabel}
                    onChange={e => setFormData(p => ({ ...p, payGroupLabel: e.target.value }))}
                    maxLength={120}
                  />
                  <p className="text-[11px] text-gray-400">
                    Shown on the run listing so parallel runs in the same
                    period stay distinguishable at a glance.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label data-tour="pr-notes">Notes <span className="text-gray-400 text-xs">(optional)</span></Label>
                  <Input
                    placeholder="e.g., Includes overtime for December..."
                    value={formData.notes}
                    onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              Employees in This Run
              {includedCount !== null && (
                <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  {includedCount} included
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { value: 'ALL', label: 'All Active', desc: 'Every active employee' },
                { value: 'EMPLOYMENT_TYPE', label: 'By Employment Type', desc: 'Full/Part-Time, Contractual' },
                { value: 'CUSTOM', label: 'Custom', desc: 'Hand-pick employees' },
              ] as const).map(opt => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setScopeMode(opt.value)}
                  className={`text-left rounded-xl border p-3 transition ${
                    scopeMode === opt.value
                      ? 'border-accent bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>

            {scopeMode === 'EMPLOYMENT_TYPE' && (
              <div className="space-y-2">
                <Label data-tour="pr-emp-types" className="text-sm">Include employees whose type is:</Label>
                <div className="flex flex-wrap gap-2">
                  {EMPLOYMENT_TYPES.map(t => {
                    const active = employmentTypeFilter.includes(t.value)
                    return (
                      <button
                        type="button"
                        key={t.value}
                        onClick={() => toggleEmploymentType(t.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          active
                            ? 'border-accent bg-orange-50 text-[#c44d00]'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
                {employeesLoaded && employmentTypeFilter.length > 0 && (
                  <p className="text-xs text-gray-500">
                    {employees.filter(e => employmentTypeFilter.includes(e.employmentType)).length} employee
                    {employees.filter(e => employmentTypeFilter.includes(e.employmentType)).length === 1 ? '' : 's'}
                    {' '}match — they will be included in this run.
                  </p>
                )}
              </div>
            )}

            {scopeMode === 'CUSTOM' && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    data-tour="pr-emp-search" placeholder="Search name, employee number, dept..."
                    value={empSearch}
                    onChange={e => setEmpSearch(e.target.value)}
                    className="max-w-sm"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
                    Select all{empSearch ? ' filtered' : ''}
                  </Button>
                  {employeeIds.size > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={clearAllSelected}>
                      Clear ({employeeIds.size})
                    </Button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {!employeesLoaded ? (
                    <p className="p-3 text-xs text-gray-400">Loading employees…</p>
                  ) : filteredEmployees.length === 0 ? (
                    <p className="p-3 text-xs text-gray-400">No employees match.</p>
                  ) : (
                    filteredEmployees.map(e => {
                      const checked = employeeIds.has(e.id)
                      return (
                        <label
                          key={e.id}
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEmployee(e.id)}
                            className="w-4 h-4 accent-orange-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {e.lastName}, {e.firstName} <span className="text-gray-400 font-normal">({e.employeeNo})</span>
                            </p>
                            <p className="text-[11px] text-gray-500 truncate">
                              {e.position?.title ?? '—'}
                              {e.department?.name ? ` · ${e.department.name}` : ''}
                              {' · '}{e.employmentType.replace('_', ' ').toLowerCase()}
                            </p>
                          </div>
                        </label>
                      )
                    })
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  Custom runs include only the checked employees. Existing
                  active employees not selected here will be skipped at
                  compute time.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving} data-tour="pr-submit">
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {existingRunId ? 'Saving...' : 'Creating...'}</> : 'Continue to Payroll Inputs'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>

      {/* ── Unapproved-DTR confirmation modal ─────────────────────────────
          Surfaces when /api/payroll POST rejects with
          code: 'UNAPPROVED_DTRS'. Lists every in-scope employee with
          pending timesheets in the period + a count, and gives the admin
          two paths: go back and approve them first, or knowingly proceed
          (resubmits the same payload with force: true). */}
      {unapprovedGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !saving && setUnapprovedGuard(null)}
          />
          <Card className="relative w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <CardHeader>
              <CardTitle className="text-base text-amber-700 flex items-center gap-2">
                <span className="inline-flex w-7 h-7 rounded-full bg-amber-100 items-center justify-center text-amber-700 text-sm">!</span>
                Unapproved timesheets in this period
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 overflow-y-auto">
              <p className="text-sm text-slate-700">
                <strong>{unapprovedGuard.employees.length}</strong>{' '}
                {unapprovedGuard.employees.length === 1 ? 'employee has' : 'employees have'}{' '}
                a total of <strong>{unapprovedGuard.totalRows}</strong> unapproved DTR row{unapprovedGuard.totalRows !== 1 ? 's' : ''} between{' '}
                <strong>{formData.periodStart}</strong> and{' '}
                <strong>{formData.periodEnd}</strong>. Their hours will not be
                included accurately in payroll until each row is approved.
              </p>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white max-h-72 overflow-y-auto">
                {unapprovedGuard.employees.map(emp => (
                  <li key={emp.id} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {emp.lastName}, {emp.firstName}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">#{emp.employeeNo}</p>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">
                      {emp.unapprovedCount} pending
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">
                <strong>Recommended:</strong> open Time Sheets, approve the
                pending rows, then come back and create the run. Proceeding
                anyway will compute payroll using whatever is currently
                stored — pending rows are included as-is, rejected ones are
                excluded.
              </p>
            </CardContent>
            <div className="px-6 py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setUnapprovedGuard(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push('/timesheets')}
                disabled={saving}
              >
                Go to Time Sheets
              </Button>
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => createRun(true)}
                disabled={saving}
              >
                {saving ? 'Creating…' : 'Create anyway'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
