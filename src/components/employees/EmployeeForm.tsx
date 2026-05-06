'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, Save, CalendarDays, Plus } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { EmployeePortalAccess } from '@/components/employees/EmployeePortalAccess'

const employeeSchema = z.object({
  employeeNo: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  firstName: z.string().min(1, 'Required'),
  middleName: z.string().optional(),
  suffix: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  birthDate: z.string().min(1, 'Required'),
  birthPlace: z.string().optional(),
  civilStatus: z.enum(['SINGLE', 'MARRIED', 'WIDOWED', 'LEGALLY_SEPARATED']).optional().default('SINGLE'),
  nationality: z.string().optional().default('Filipino'),
  religion: z.string().optional(),
  personalEmail: z.string().email().optional().or(z.literal('')),
  workEmail: z.string().email().optional().or(z.literal('')),
  mobileNo: z.string().optional(),
  phoneNo: z.string().optional(),
  presentAddress: z.string().optional(),
  permanentAddress: z.string().optional(),
  sssNo: z.string().optional(),
  tinNo: z.string().optional(),
  philhealthNo: z.string().optional(),
  pagibigNo: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  departmentId: z.string().optional(),
  positionId: z.string().optional(),
  directManagerId: z.string().optional(),
  employmentStatus: z.enum(['PROBATIONARY', 'REGULAR', 'CONTRACTUAL', 'PROJECT_BASED', 'PART_TIME', 'RESIGNED', 'TERMINATED', 'RETIRED']).default('PROBATIONARY'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTUAL']).default('FULL_TIME'),
  hireDate: z.string().min(1, 'Required'),
  regularizationDate: z.string().optional(),
  rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).default('MONTHLY'),
  basicSalary: z.coerce.number().positive('Must be positive'),
  payFrequency: z.enum(['SEMI_MONTHLY', 'MONTHLY', 'WEEKLY', 'DAILY']).default('SEMI_MONTHLY'),
  workScheduleId: z.string().optional(),
  dayOffDays: z.array(z.number().int().min(0).max(6)).optional(),
  bankName: z.string().optional(),
  bankAccountNo: z.string().optional(),
  isExemptFromTax: z.boolean().default(false),
  isMinimumWageEarner: z.boolean().default(false),
  trackTime: z.boolean().default(false),
  fingerprintExempt: z.boolean().default(false),
  geofenceExempt: z.boolean().default(false),
  selfieExempt: z.boolean().default(false),
  sssEnabled: z.boolean().default(true),
  philhealthEnabled: z.boolean().default(true),
  pagibigEnabled: z.boolean().default(true),
  withholdingTaxEnabled: z.boolean().default(true),
  notes: z.string().optional(),
})

type EmployeeFormData = z.infer<typeof employeeSchema>
type EmployeeFormInput = z.input<typeof employeeSchema>
type ScheduleMode = 'FIXED' | 'FLEXIBLE'

interface Props {
  departments: { id: string; name: string }[]
  positions: { id: string; title: string }[]
  workSchedules: { id: string; name: string; scheduleType?: string }[]
  defaultValues?: Partial<EmployeeFormData>
  employeeId?: string
  hasPortalUser?: boolean
}

// Defined outside EmployeeForm so its identity is stable across re-renders.
// Defining it inside would cause React to unmount/remount inputs on every
// keystroke (new function ref = new component type = focus lost).
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function EmployeeForm({ departments: initialDepartments, positions: initialPositions, workSchedules, defaultValues, employeeId, hasPortalUser = false }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [managers, setManagers] = useState<{ id: string; firstName: string; lastName: string; employeeNo: string }[]>([])
  const [showScheduleSetupModal, setShowScheduleSetupModal] = useState(false)
  const [createdEmployeeId, setCreatedEmployeeId] = useState<string | null>(null)
  const [createdEmployeeName, setCreatedEmployeeName] = useState('')
  const [scheduleSetupMode, setScheduleSetupMode] = useState<ScheduleMode>('FIXED')
  const [editScheduleMode, setEditScheduleMode] = useState<ScheduleMode>('FIXED')

  // Local copies so newly created departments/positions appear immediately
  const [departments, setDepartments] = useState(initialDepartments)
  const [positions, setPositions] = useState(initialPositions)

  // Quick-add department dialog
  const [deptDialogOpen, setDeptDialogOpen] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [savingDept, setSavingDept] = useState(false)

  // Quick-add position dialog
  const [posDialogOpen, setPosDialogOpen] = useState(false)
  const [newPosTitle, setNewPosTitle] = useState('')
  const [savingPos, setSavingPos] = useState(false)

  async function handleAddDepartment() {
    if (!newDeptName.trim()) return
    setSavingDept(true)
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDeptName.trim() }),
      })
      if (!res.ok) throw new Error('Failed to create department')
      const dept = await res.json()
      setDepartments(prev => [...prev, { id: dept.id, name: dept.name }])
      setValue('departmentId', dept.id)
      setDeptDialogOpen(false)
      setNewDeptName('')
      toast.success(`Department "${dept.name}" created`)
    } catch {
      toast.error('Failed to create department')
    } finally {
      setSavingDept(false)
    }
  }

  async function handleAddPosition() {
    if (!newPosTitle.trim()) return
    setSavingPos(true)
    try {
      const res = await fetch('/api/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newPosTitle.trim() }),
      })
      if (!res.ok) throw new Error('Failed to create position')
      const pos = await res.json()
      setPositions(prev => [...prev, { id: pos.id, title: pos.title }])
      setValue('positionId', pos.id)
      setPosDialogOpen(false)
      setNewPosTitle('')
      toast.success(`Position "${pos.title}" created`)
    } catch {
      toast.error('Failed to create position')
    } finally {
      setSavingPos(false)
    }
  }
  const isCreate = !employeeId

  const tabs = useMemo(() => {
    if (isCreate) {
      return [
        { value: 'personal', label: 'Personal' },
        { value: 'employment', label: 'Employment' },
        { value: 'compensation', label: 'Compensation' },
        { value: 'government', label: "Gov't IDs" },
        { value: 'emergency', label: 'Emergency' },
        { value: 'settings', label: 'Settings' },
      ]
    }

    return [
      { value: 'personal', label: 'Personal' },
      { value: 'employment', label: 'Employment' },
      { value: 'compensation', label: 'Compensation' },
      { value: 'government', label: "Gov't IDs" },
      { value: 'emergency', label: 'Emergency' },
      { value: 'leaves', label: 'Leaves' },
      { value: 'settings', label: 'Settings' },
    ]
  }, [isCreate])

  const [activeTab, setActiveTab] = useState(tabs[0]?.value ?? 'personal')
const lastTab = tabs[tabs.length - 1]?.value ?? 'settings'

  // Leave allocations state
  interface LeaveTypeItem { id: string; name: string; code: string; daysEntitled: number; isMandatory: boolean; genderRestriction?: string | null }
  interface LeaveBalanceItem { id: string; leaveTypeId: string; entitled: number; used: number; pending: number }
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeItem[]>([])
  const [leaveAllocations, setLeaveAllocations] = useState<Record<string, { enabled: boolean; entitled: number }>>({})
  const [leavesLoading, setLeavesLoading] = useState(false)
  const [leavesSaving, setLeavesSaving] = useState(false)
  const [leavesLoaded, setLeavesLoaded] = useState(false)
  type IncomeTypeItem = {
    id: string
    name: string
    code?: string | null
    mode: 'FIXED' | 'VARIABLE'
    isTaxable: boolean
    defaultAmount: number
    assigned?: boolean
    fixedAmount?: number
  }
  const [companyIncomeTypes, setCompanyIncomeTypes] = useState<IncomeTypeItem[]>([])
  const [incomeAssignments, setIncomeAssignments] = useState<Record<string, { assigned: boolean; fixedAmount: number }>>({})
  const [incomeAssignmentsLoading, setIncomeAssignmentsLoading] = useState(false)

  function shouldDisableLeaveByGender(lt: { code: string; name: string; genderRestriction?: string | null }, gender?: EmployeeFormData['gender']) {
    if (!gender) return false
    if (lt.genderRestriction && lt.genderRestriction !== gender) return true
    const code = (lt.code || '').toLowerCase()
    const name = (lt.name || '').toLowerCase()
    const isVawc = code.includes('vawc') || name.includes('vawc')
    const isMaternity = code.includes('maternity') || name.includes('maternity')
    const isPaternity = code.includes('paternity') || name.includes('paternity')

    if (gender === 'MALE') return isVawc || isMaternity
    if (gender === 'FEMALE') return isPaternity
    return false
  }

  async function loadLeaveAllocations() {
    if (!employeeId || leavesLoaded) return
    setLeavesLoading(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/leave-balances`)
      const data = await res.json()
      setLeaveTypes(data.leaveTypes ?? [])
      const hasAnyBalance = (data.balances ?? []).length > 0
      const map: Record<string, { enabled: boolean; entitled: number }> = {}
      for (const lt of (data.leaveTypes ?? [])) {
        const bal = (data.balances ?? []).find((b: LeaveBalanceItem) => b.leaveTypeId === lt.id)
        map[lt.id] = bal
          ? { enabled: true, entitled: Number(bal.entitled) }
          : {
              enabled: hasAnyBalance ? false : !shouldDisableLeaveByGender(lt, watch('gender')),
              entitled: lt.daysEntitled,
            }
      }
      setLeaveAllocations(map)
      setLeavesLoaded(true)
    } finally {
      setLeavesLoading(false)
    }
  }

  async function saveLeaveAllocations() {
    if (!employeeId) return
    setLeavesSaving(true)
    try {
      const allocations = Object.entries(leaveAllocations).map(([leaveTypeId, v]) => ({
        leaveTypeId,
        entitled: v.entitled,
        enabled: v.enabled,
      }))
      const res = await fetch(`/api/employees/${employeeId}/leave-balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations }),
      })
      if (res.ok) {
        toast.success('Leave allocations saved')
        setLeavesLoaded(false)
        await loadLeaveAllocations()
      } else {
        toast.error('Failed to save leave allocations')
      }
    } finally {
      setLeavesSaving(false)
    }
  }

  async function loadIncomeAssignments() {
    if (!employeeId) return
    setIncomeAssignmentsLoading(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/income-assignments`)
      if (!res.ok) {
        setIncomeAssignments({})
        return
      }
      const data = await res.json()
      const types = (data.incomeTypes ?? []) as IncomeTypeItem[]
      setCompanyIncomeTypes(types)
      const map: Record<string, { assigned: boolean; fixedAmount: number }> = {}
      for (const type of types) {
        map[type.id] = {
          assigned: Boolean(type.assigned),
          fixedAmount: Number(type.fixedAmount ?? type.defaultAmount ?? 0),
        }
      }
      setIncomeAssignments(map)
    } finally {
      setIncomeAssignmentsLoading(false)
    }
  }

  async function persistIncomeAssignments(targetEmployeeId: string) {
    if (companyIncomeTypes.length === 0) return
    const assignments = companyIncomeTypes.map(type => ({
      incomeTypeId: type.id,
      isActive: Boolean(incomeAssignments[type.id]?.assigned),
      fixedAmount: type.mode === 'FIXED' ? Number(incomeAssignments[type.id]?.fixedAmount ?? type.defaultAmount ?? 0) : null,
    }))
    const res = await fetch(`/api/employees/${targetEmployeeId}/income-assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to save employee income setup')
    }
  }

  const form = useForm<EmployeeFormData, unknown, EmployeeFormInput>({
    resolver: zodResolver(employeeSchema) as never,
    defaultValues: {
      nationality: 'Filipino',
      civilStatus: 'SINGLE',
      gender: 'MALE',
      employmentStatus: 'PROBATIONARY',
      employmentType: 'FULL_TIME',
      rateType: 'MONTHLY',
      payFrequency: 'SEMI_MONTHLY',
      isExemptFromTax: false,
      isMinimumWageEarner: false,
      trackTime: false,
      fingerprintExempt: false,
      geofenceExempt: false,
      selfieExempt: false,
      sssEnabled: true,
      philhealthEnabled: true,
      pagibigEnabled: true,
      withholdingTaxEnabled: true,
      ...defaultValues,
    },
  })

  const { register, handleSubmit, setValue, watch, formState: { errors, isDirty } } = form

  useEffect(() => {
    let active = true
    async function loadManagers() {
      try {
        const res = await fetch('/api/employees?limit=200')
        const data = await res.json()
        const list = (data.employees ?? []) as { id: string; firstName: string; lastName: string; employeeNo: string }[]
        const filtered = employeeId ? list.filter(e => e.id !== employeeId) : list
        if (active) setManagers(filtered)
      } catch {
        // ignore
      }
    }
    loadManagers()
    return () => { active = false }
  }, [employeeId])

  useEffect(() => {
    if (employeeId) void loadIncomeAssignments()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId])

  useEffect(() => {
    if (isCreate) return
    // No workScheduleId → employee is on flexible scheduling (no fixed template)
    if (!defaultValues?.workScheduleId) {
      setEditScheduleMode('FLEXIBLE')
      return
    }
    const selectedSchedule = workSchedules.find(s => s.id === defaultValues.workScheduleId)
    setEditScheduleMode(selectedSchedule?.scheduleType === 'FLEXITIME' ? 'FLEXIBLE' : 'FIXED')
  }, [defaultValues?.workScheduleId, isCreate, workSchedules])

  async function onSubmit(data: EmployeeFormData) {
    setSaving(true)
    try {
      const url = employeeId ? `/api/employees/${employeeId}` : '/api/employees'
      const method = employeeId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to save employee')
        return
      }

      const result = await res.json()
      const targetEmployeeId = (result.employee?.id as string | undefined) || employeeId
      if (targetEmployeeId) {
        await persistIncomeAssignments(targetEmployeeId)
      }

      if (employeeId) {
        toast.success('Employee updated!')
        router.push(targetEmployeeId ? `/employees/${targetEmployeeId}` : '/employees')
        return
      }

      if (!targetEmployeeId) {
        toast.error('Employee was created, but no employee ID was returned.')
        router.push('/employees')
        return
      }

      toast.success('Employee created!')
      setCreatedEmployeeId(targetEmployeeId)
      setCreatedEmployeeName(`${data.firstName} ${data.lastName}`.trim())
      setScheduleSetupMode('FIXED')
      setShowScheduleSetupModal(true)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'An error occurred'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function openScheduleSetup() {
    if (!employeeId) {
      toast.error('Save employee first before setting up work schedule.')
      return
    }
    if (isDirty) {
      toast.error('Please save changes first before opening Work Schedules.')
      return
    }

    // When switching to Flexible, clear the fixed workScheduleId in the DB
    // so the employee appears in the flexible grid immediately.
    if (editScheduleMode === 'FLEXIBLE') {
      try {
        const res = await fetch(`/api/employees/${employeeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workScheduleId: '' }),
        })
        if (!res.ok) {
          toast.error('Failed to switch to flexible schedule')
          return
        }
      } catch {
        toast.error('Failed to switch to flexible schedule')
        return
      }
    }

    router.push(`/schedules?mode=${editScheduleMode}&employeeId=${employeeId}`)
  }

  function openWeeklyGrid() {
    if (!createdEmployeeId) return
    const params = new URLSearchParams({
      mode: scheduleSetupMode,
      employeeId: createdEmployeeId,
    })
    router.push(`/schedules?${params.toString()}`)
  }

  function goToEmployeeProfile() {
    if (createdEmployeeId) {
      router.push(`/employees/${createdEmployeeId}`)
      return
    }
    router.push('/employees')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit as never)}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className={`grid w-full ${isCreate ? 'grid-cols-6' : 'grid-cols-7'}`}>
          {tabs.map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              onClick={tab.value === 'leaves' ? loadLeaveAllocations : undefined}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* PERSONAL INFO */}
        <TabsContent value="personal">
          <Card>
            <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Last Name *" error={errors.lastName?.message}>
                <Input {...register('lastName')} placeholder="dela Cruz" />
              </Field>
              <Field label="First Name *" error={errors.firstName?.message}>
                <Input {...register('firstName')} placeholder="Juan" />
              </Field>
              <Field label="Middle Name">
                <Input {...register('middleName')} placeholder="Santos" />
              </Field>
              <Field label="Suffix">
                <Input {...register('suffix')} placeholder="Jr., Sr., III" />
              </Field>
              <Field label="Gender *" error={errors.gender?.message}>
                <Select
                  defaultValue={defaultValues?.gender || 'MALE'}
                  onValueChange={v => setValue('gender', v as 'MALE' | 'FEMALE' | 'OTHER')}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Civil Status">
                <Select
                  defaultValue={defaultValues?.civilStatus || 'SINGLE'}
                  onValueChange={v => setValue('civilStatus', v as EmployeeFormData['civilStatus'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE">Single</SelectItem>
                    <SelectItem value="MARRIED">Married</SelectItem>
                    <SelectItem value="WIDOWED">Widowed</SelectItem>
                    <SelectItem value="LEGALLY_SEPARATED">Legally Separated</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Birth Date *" error={errors.birthDate?.message}>
                <DatePicker
                  value={watch('birthDate')}
                  onChange={(v) => setValue('birthDate', v)}
                />
                <input type="hidden" {...register('birthDate')} value={watch('birthDate')} />
              </Field>
              <Field label="Birth Place">
                <Input {...register('birthPlace')} placeholder="Manila" />
              </Field>
              <Field label="Nationality">
                <Input {...register('nationality')} placeholder="Filipino" />
              </Field>
              <Field label="Religion">
                <Input {...register('religion')} placeholder="Roman Catholic" />
              </Field>
              <Field label="Personal Email">
                <Input type="email" {...register('personalEmail')} placeholder="juan@email.com" />
              </Field>
              <Field label="Work Email">
                <Input type="email" {...register('workEmail')} placeholder="juan@company.com" />
              </Field>
              <Field label="Mobile Number">
                <Input {...register('mobileNo')} placeholder="09XX-XXX-XXXX" />
              </Field>
              <Field label="Present Address">
                <Input {...register('presentAddress')} placeholder="123 Street, Barangay, City" />
              </Field>
              <Field label="Permanent Address">
                <Input {...register('permanentAddress')} placeholder="Same as present or different" />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMPLOYMENT INFO */}
        <TabsContent value="employment">
          <Card>
            <CardHeader><CardTitle className="text-base">Employment Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Employee Number *" error={errors.employeeNo?.message}>
                <Input {...register('employeeNo')} placeholder="EMP-001" />
              </Field>
              <Field label="Department">
                <Select
                  value={watch('departmentId') || ''}
                  onValueChange={v => {
                    if (v === '__add_dept__') { setDeptDialogOpen(true) }
                    else { setValue('departmentId', v) }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-400">No departments yet</div>
                    )}
                    {departments.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                    <div className="border-t mt-1 pt-1">
                      <SelectItem value="__add_dept__" className="text-blue-600 font-medium">
                        <span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Add new department</span>
                      </SelectItem>
                    </div>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Position">
                <Select
                  value={watch('positionId') || ''}
                  onValueChange={v => {
                    if (v === '__add_pos__') { setPosDialogOpen(true) }
                    else { setValue('positionId', v) }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
                  <SelectContent>
                    {positions.length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-400">No positions yet</div>
                    )}
                    {positions.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                    <div className="border-t mt-1 pt-1">
                      <SelectItem value="__add_pos__" className="text-blue-600 font-medium">
                        <span className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Add new position</span>
                      </SelectItem>
                    </div>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Reports To">
                <Select
                  defaultValue={defaultValues?.directManagerId || ''}
                  onValueChange={v => setValue('directManagerId', v === '__none__' ? undefined : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {managers.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.lastName}, {m.firstName} ({m.employeeNo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Employment Status">
                <Select
                  defaultValue={defaultValues?.employmentStatus || 'PROBATIONARY'}
                  onValueChange={v => setValue('employmentStatus', v as EmployeeFormData['employmentStatus'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROBATIONARY">Probationary</SelectItem>
                    <SelectItem value="REGULAR">Regular</SelectItem>
                    <SelectItem value="CONTRACTUAL">Contractual</SelectItem>
                    <SelectItem value="PROJECT_BASED">Project-Based</SelectItem>
                    <SelectItem value="PART_TIME">Part-Time</SelectItem>
                    <SelectItem value="RESIGNED">Resigned</SelectItem>
                    <SelectItem value="TERMINATED">Terminated</SelectItem>
                    <SelectItem value="RETIRED">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Employment Type">
                <Select
                  defaultValue={defaultValues?.employmentType || 'FULL_TIME'}
                  onValueChange={v => setValue('employmentType', v as EmployeeFormData['employmentType'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">Full-Time</SelectItem>
                    <SelectItem value="PART_TIME">Part-Time</SelectItem>
                    <SelectItem value="CONTRACTUAL">Contractual</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date Hired *" error={errors.hireDate?.message}>
                <DatePicker
                  value={watch('hireDate')}
                  onChange={(v) => setValue('hireDate', v)}
                />
                <input type="hidden" {...register('hireDate')} value={watch('hireDate')} />
              </Field>
              {!isCreate && (
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                  <Field label="Work Schedule">
                    <Select
                      value={editScheduleMode}
                      onValueChange={v => {
                        setEditScheduleMode(v as ScheduleMode)
                        // Clear the fixed schedule when switching to Flexible so
                        // the form submission sets workScheduleId = null in the DB.
                        if (v === 'FLEXIBLE') {
                          setValue('workScheduleId', '', { shouldDirty: true })
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIXED">Fixed Schedule</SelectItem>
                        <SelectItem value="FLEXIBLE">Flexible</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button
                    type="button"
                    onClick={openScheduleSetup}
                    className="text-white w-full md:w-auto"
                    style={{ background: '#fa5e01' }}
                  >
                    Setup Schedule
                  </Button>
                </div>
              )}
              <Field label="Regularization Date">
                <DatePicker
                  value={watch('regularizationDate')}
                  onChange={(v) => setValue('regularizationDate', v)}
                />
                <input type="hidden" {...register('regularizationDate')} value={watch('regularizationDate')} />
              </Field>
              <Field label="Notes">
                <Input {...register('notes')} placeholder="Additional notes..." />
              </Field>
              <div className="md:col-span-3 mt-1 space-y-2">
                <Label className="text-sm font-medium">Attendance Overrides</Label>
                <p className="text-xs text-gray-500">
                  Turn off company attendance requirements for this employee only.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Disable Fingerprint</p>
                      <p className="text-xs text-gray-500">Exempt employee from fingerprint requirement</p>
                    </div>
                    <Switch
                      checked={watch('fingerprintExempt')}
                      onCheckedChange={v => setValue('fingerprintExempt', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Disable Geofencing</p>
                      <p className="text-xs text-gray-500">Allow clock in/out outside geofence</p>
                    </div>
                    <Switch
                      checked={watch('geofenceExempt')}
                      onCheckedChange={v => setValue('geofenceExempt', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Disable Selfie</p>
                      <p className="text-xs text-gray-500">Exempt employee from selfie on clock-in</p>
                    </div>
                    <Switch
                      checked={watch('selfieExempt')}
                      onCheckedChange={v => setValue('selfieExempt', v)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPENSATION */}
        <TabsContent value="compensation">
          <Card className="mb-4">
            <CardHeader><CardTitle className="text-base">Compensation & Pay</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Rate Type">
                <Select
                  defaultValue={defaultValues?.rateType || 'MONTHLY'}
                  onValueChange={v => setValue('rateType', v as EmployeeFormData['rateType'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="HOURLY">Hourly</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label={
                  watch('rateType') === 'HOURLY' ? 'Hourly Rate *'
                  : watch('rateType') === 'DAILY' ? 'Daily Rate *'
                  : 'Basic Monthly Salary *'
                }
                error={errors.basicSalary?.message}
              >
                <Input
                  type="number"
                  step="0.01"
                  {...register('basicSalary', { valueAsNumber: true })}
                  placeholder={
                    watch('rateType') === 'HOURLY' ? '125.00 per hour'
                    : watch('rateType') === 'DAILY' ? '600.00 per day'
                    : '30000.00 per month'
                  }
                />
              </Field>
              <Field label="Pay Frequency">
                <Select
                  defaultValue={defaultValues?.payFrequency || 'SEMI_MONTHLY'}
                  onValueChange={v => setValue('payFrequency', v as EmployeeFormData['payFrequency'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEMI_MONTHLY">Semi-Monthly (1st & 15th)</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="DAILY">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Bank Name">
                <Input {...register('bankName')} placeholder="BDO, BPI, Metrobank..." />
              </Field>
              <Field label="Bank Account Number">
                <Input {...register('bankAccountNo')} placeholder="1234-5678-9012" />
              </Field>
              {/* Toggles — single row spanning full width */}
              <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Minimum Wage Earner</p>
                    <p className="text-xs text-gray-500">Exempt from income tax</p>
                  </div>
                  <Switch
                    checked={watch('isMinimumWageEarner')}
                    onCheckedChange={v => setValue('isMinimumWageEarner', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Tax Exempt</p>
                    <p className="text-xs text-gray-500">No withholding tax deduction</p>
                  </div>
                  <Switch
                    checked={watch('isExemptFromTax')}
                    onCheckedChange={v => setValue('isExemptFromTax', v)}
                  />
                </div>
                <div
                  className="flex items-center justify-between p-3 rounded-lg border-2"
                  style={{
                    background: watch('trackTime') ? 'rgba(250,94,1,0.06)' : '#f9fafb',
                    borderColor: watch('trackTime') ? 'rgba(250,94,1,0.3)' : 'transparent',
                  }}
                >
                  <div>
                    <p className="text-sm font-medium">Track Time (DTR-Based Pay)</p>
                    <p className="text-xs text-gray-500">Payroll computed from daily attendance records</p>
                  </div>
                  <Switch
                    checked={watch('trackTime')}
                    onCheckedChange={v => setValue('trackTime', v)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mandatory Deductions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mandatory Deductions</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Disable a deduction to exclude it from this employee&apos;s payroll computation.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { field: 'sssEnabled', label: 'SSS', desc: 'Social Security System contribution' },
                { field: 'philhealthEnabled', label: 'PhilHealth', desc: 'Philippine Health Insurance contribution' },
                { field: 'pagibigEnabled', label: 'Pag-IBIG / HDMF', desc: 'Home Development Mutual Fund contribution' },
                { field: 'withholdingTaxEnabled', label: 'Withholding Tax', desc: 'BIR income tax withholding' },
              ] as const).map(({ field, label, desc }) => (
                <div key={field} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                  <Switch
                    checked={watch(field)}
                    onCheckedChange={v => setValue(field, v)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {employeeId ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Employee Other Income Setup</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  Assign income types to this employee. These are saved together when you click Save Employee.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {incomeAssignmentsLoading ? (
                  <p className="text-sm text-gray-400">Loading employee income setup...</p>
                ) : companyIncomeTypes.length === 0 ? (
                  <p className="text-sm text-gray-400">Create an income type first.</p>
                ) : (
                  companyIncomeTypes.map(type => {
                    const state = incomeAssignments[type.id] ?? { assigned: false, fixedAmount: Number(type.defaultAmount ?? 0) }
                    return (
                      <div key={type.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center border rounded-lg px-3 py-2">
                        <div className="md:col-span-5">
                          <p className="text-sm font-medium">{type.name}</p>
                          <p className="text-xs text-gray-500">{type.mode === 'FIXED' ? 'Fixed' : 'Variable'} • {type.isTaxable ? 'Taxable' : 'Non-taxable'}</p>
                        </div>
                        <div className="md:col-span-2 flex items-center gap-2">
                          <Switch
                            checked={state.assigned}
                            onCheckedChange={v =>
                              setIncomeAssignments(prev => ({
                                ...prev,
                                [type.id]: { ...state, assigned: v },
                              }))
                            }
                          />
                          <span className="text-xs text-gray-600">Assigned</span>
                        </div>
                        <div className="md:col-span-5">
                          {type.mode === 'FIXED' ? (
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              disabled={!state.assigned}
                              value={state.fixedAmount}
                              onChange={e =>
                                setIncomeAssignments(prev => ({
                                  ...prev,
                                  [type.id]: { ...state, fixedAmount: Number(e.target.value || 0) },
                                }))
                              }
                            />
                          ) : (
                            <p className="text-xs text-gray-500">Amount is entered during payroll run.</p>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-4">
              <CardContent className="py-4">
                <p className="text-xs text-gray-500">
                  Save this employee first to assign other income types.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* GOVERNMENT IDs */}
        <TabsContent value="government">
          <Card>
            <CardHeader><CardTitle className="text-base">Government IDs & Numbers</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="SSS Number">
                <Input {...register('sssNo')} placeholder="XX-XXXXXXX-X" />
              </Field>
              <Field label="TIN Number">
                <Input {...register('tinNo')} placeholder="XXX-XXX-XXX-XXX" />
              </Field>
              <Field label="PhilHealth Number">
                <Input {...register('philhealthNo')} placeholder="XXXXXXXXXXXX" />
              </Field>
              <Field label="Pag-IBIG / HDMF Number">
                <Input {...register('pagibigNo')} placeholder="XXXX-XXXX-XXXX" />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMERGENCY CONTACT */}
        <TabsContent value="emergency">
          <Card>
            <CardHeader><CardTitle className="text-base">Emergency Contact</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Contact Name">
                <Input {...register('emergencyContactName')} placeholder="Maria dela Cruz" />
              </Field>
              <Field label="Relationship">
                <Input {...register('emergencyContactRelation')} placeholder="Spouse, Parent, Sibling..." />
              </Field>
              <Field label="Contact Number">
                <Input {...register('emergencyContactPhone')} placeholder="09XX-XXX-XXXX" />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LEAVE ALLOCATIONS */}
        {employeeId && (
          <TabsContent value="leaves">
            <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  Leave Entitlements — {new Date().getFullYear()}
                </CardTitle>
                <Button type="button" size="sm" onClick={saveLeaveAllocations} disabled={leavesSaving || leavesLoading}>
                  {leavesSaving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving...</> : <><Save className="w-3.5 h-3.5 mr-1.5" />Save Leaves</>}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {leavesLoading ? (
                <div className="space-y-3 py-2">
                  {[1,2,3,4].map(i => <div key={i} className="h-14 rounded-xl animate-pulse bg-gray-100" />)}
                </div>
              ) : leaveTypes.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No leave types configured. Add leave types in Leave Types settings first.</p>
              ) : (
                <div className="space-y-2">
                  {leaveTypes.map(lt => {
                    const alloc = leaveAllocations[lt.id] ?? { enabled: false, entitled: lt.daysEntitled }
                    return (
                      <div key={lt.id} className="flex items-center gap-4 p-3 rounded-xl border transition-colors"
                        style={{ background: alloc.enabled ? 'rgba(250,94,1,0.04)' : '#f9fafb', borderColor: alloc.enabled ? 'rgba(250,94,1,0.25)' : '#e2e8f0' }}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-orange-500"
                          checked={alloc.enabled}
                          onChange={e => setLeaveAllocations(prev => ({ ...prev, [lt.id]: { ...alloc, enabled: e.target.checked } }))}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(14,166,240,0.1)', color: '#0ea6f0' }}>{lt.code}</span>
                            <span className="text-sm font-medium text-gray-800">{lt.name}</span>
                            {lt.isMandatory && <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(250,94,1,0.1)', color: '#fa5e01' }}>Dole-Mandated</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-500">Days entitled:</span>
                          <input
                            type="number"
                            min={0}
                            max={365}
                            value={alloc.entitled}
                            disabled={!alloc.enabled}
                            onChange={e => setLeaveAllocations(prev => ({ ...prev, [lt.id]: { ...alloc, entitled: Number(e.target.value) } }))}
                            className="w-16 border rounded-lg px-2 py-1 text-sm text-center font-medium outline-none disabled:opacity-40 focus:border-orange-400"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          </TabsContent>
        )}

        {/* SETTINGS */}
        <TabsContent value="settings">
          {isCreate ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Portal Settings</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-gray-500">
                  Portal access and biometric settings are available after saving the employee record.
                </p>
              </CardContent>
            </Card>
          ) : (
            <EmployeePortalAccess
              employeeId={employeeId!}
              workEmail={watch('workEmail') || null}
              personalEmail={watch('personalEmail') || null}
              hasUser={hasPortalUser}
              editable
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end mt-6">
        {isCreate && activeTab !== lastTab ? (
          <Button
            type="button"
            size="lg"
            onClick={() => {
              const idx = tabs.findIndex(t => t.value === activeTab)
              const next = tabs[Math.min(idx + 1, tabs.length - 1)]
              if (next) setActiveTab(next.value)
            }}
          >
            Next
          </Button>
        ) : (
          <Button type="submit" disabled={saving} size="lg">
            {saving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" /> Save Employee</>
            )}
          </Button>
        )}
      </div>

      {/* ── Quick-add Department Dialog ─────────────────────────────── */}
      <Dialog open={deptDialogOpen} onOpenChange={open => { setDeptDialogOpen(open); if (!open) setNewDeptName('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Department</DialogTitle>
            <DialogDescription>Create a new department for your company.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Department Name *</Label>
            <Input
              placeholder="e.g. Human Resources"
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddDepartment() }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptDialogOpen(false)} disabled={savingDept}>Cancel</Button>
            <Button onClick={handleAddDepartment} disabled={!newDeptName.trim() || savingDept}>
              {savingDept && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Department
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quick-add Position Dialog ────────────────────────────────── */}
      <Dialog open={posDialogOpen} onOpenChange={open => { setPosDialogOpen(open); if (!open) setNewPosTitle('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Position</DialogTitle>
            <DialogDescription>Create a new job position for your company.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Position Title *</Label>
            <Input
              placeholder="e.g. Software Engineer"
              value={newPosTitle}
              onChange={e => setNewPosTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddPosition() }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPosDialogOpen(false)} disabled={savingPos}>Cancel</Button>
            <Button onClick={handleAddPosition} disabled={!newPosTitle.trim() || savingPos}>
              {savingPos && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showScheduleSetupModal}
        onOpenChange={(open) => {
          setShowScheduleSetupModal(open)
          if (!open) goToEmployeeProfile()
        }}
      >
        <DialogContent className="max-w-xl mx-4">
          <DialogHeader>
            <DialogTitle>Set Work Schedule</DialogTitle>
            <DialogDescription>
              {createdEmployeeName
                ? `Employee ${createdEmployeeName} was saved. Choose a schedule mode, then continue to the weekly grid.`
                : 'Employee was saved. Choose a schedule mode, then continue to the weekly grid.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Work Schedule Mode</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setScheduleSetupMode('FIXED')}
                className={`text-left rounded-xl border p-4 transition ${
                  scheduleSetupMode === 'FIXED'
                    ? 'border-[#fa5e01] bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">Fixed Schedule</p>
                <p className="mt-1 text-xs text-gray-500">Assign one recurring weekly schedule with day offs.</p>
              </button>
              <button
                type="button"
                onClick={() => setScheduleSetupMode('FLEXIBLE')}
                className={`text-left rounded-xl border p-4 transition ${
                  scheduleSetupMode === 'FLEXIBLE'
                    ? 'border-[#fa5e01] bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">Flexible</p>
                <p className="mt-1 text-xs text-gray-500">Assign daily shifts using the weekly grid.</p>
              </button>
            </div>

            <div className="rounded-lg border border-[#fa5e01]/30 bg-[#fff3ec] px-3 py-2 text-xs text-[#c44d00]">
              Manage employee schedules at Work Schedule page.
              {' '}
              <Link href="/schedules" className="font-semibold underline underline-offset-2">
                Open Work Schedules
              </Link>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={goToEmployeeProfile}>
              Skip for now
            </Button>
            <Button type="button" className="text-white" style={{ background: '#fa5e01' }} onClick={openWeeklyGrid}>
              Continue to Weekly Grid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
