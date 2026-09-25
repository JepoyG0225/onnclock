'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, Loader2, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Employee = {
  id: string
  employeeNo: string
  firstName: string
  lastName: string
  canSelectOwnSchedule: boolean
  department: { name: string } | null
  workSchedule: { name: string } | null
}

export function SelfSchedulingTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('ALL')

  useEffect(() => {
    let active = true
    fetch('/api/schedules/self-service', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Unable to load self-scheduling settings')
        if (!active) return
        const rows: Employee[] = Array.isArray(data.employees) ? data.employees : []
        setEnabled(Boolean(data.enabled))
        setEmployees(rows)
        setSelected(new Set(rows.filter(row => row.canSelectOwnSchedule).map(row => row.id)))
      })
      .catch(error => {
        if (active) toast.error(error instanceof Error ? error.message : 'Unable to load settings')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const departments = useMemo(
    () => [...new Set(employees.map(row => row.department?.name).filter((name): name is string => Boolean(name)))].sort(),
    [employees],
  )
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return employees.filter(row => {
      if (department !== 'ALL' && row.department?.name !== department) return false
      if (!term) return true
      return `${row.firstName} ${row.lastName} ${row.employeeNo} ${row.department?.name ?? ''}`.toLowerCase().includes(term)
    })
  }, [department, employees, search])

  function toggleEmployee(id: string) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const response = await fetch('/api/schedules/self-service', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, employeeIds: [...selected] }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to save self-scheduling settings')
      setEmployees(rows => rows.map(row => ({ ...row, canSelectOwnSchedule: selected.has(row.id) })))
      toast.success('Employee self-scheduling settings saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Employee Self-Scheduling</h1>
        <p className="mt-1 text-sm text-gray-500">Choose which employees may select their own default work schedule.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-5 w-5 text-blue-600" />Portal schedule selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 p-4">
            <span>
              <span className="block text-sm font-bold text-slate-900">Enable employee self-scheduling</span>
              <span className="mt-1 block text-xs text-slate-500">Only selected employees will see the schedule chooser in Portal → Clock.</span>
            </span>
            <span className="relative mt-0.5 inline-flex shrink-0 items-center">
              <input
                type="checkbox"
                checked={enabled}
                onChange={event => setEnabled(event.target.checked)}
                className="peer sr-only"
                aria-label="Enable employee self-scheduling"
              />
              <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2" />
              <span className="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
            </span>
          </label>

          <div className={enabled ? '' : 'pointer-events-none opacity-50'}>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search employee, number, or department" className="pl-9" />
              </div>
              <select value={department} onChange={event => setDepartment(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="ALL">All departments</option>
                {departments.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <Button type="button" variant="outline" onClick={() => setSelected(current => new Set([...current, ...filtered.map(row => row.id)]))}>Select shown</Button>
              <Button type="button" variant="outline" onClick={() => setSelected(current => {
                const next = new Set(current)
                filtered.forEach(row => next.delete(row.id))
                return next
              })}>Clear shown</Button>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{selected.size} of {employees.length} employees allowed</span>
              <span>{filtered.length} shown</span>
            </div>

            <div className="mt-3 max-h-[480px] divide-y overflow-y-auto rounded-xl border border-slate-200">
              {filtered.map(employee => {
                const checked = selected.has(employee.id)
                return (
                  <button key={employee.id} type="button" onClick={() => toggleEmployee(employee.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
                      {checked && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900">{employee.lastName}, {employee.firstName}</span>
                      <span className="block truncate text-xs text-slate-500">{employee.employeeNo} · {employee.department?.name || 'No department'}</span>
                    </span>
                    <span className="hidden text-xs text-slate-500 sm:block">{employee.workSchedule?.name || 'No schedule'}</span>
                  </button>
                )
              })}
              {!filtered.length && <p className="px-4 py-10 text-center text-sm text-slate-500">No employees match this filter.</p>}
            </div>
          </div>

          <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save settings</Button></div>
        </CardContent>
      </Card>
    </div>
  )
}
