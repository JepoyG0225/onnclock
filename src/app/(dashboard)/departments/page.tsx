'use client'
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Plus, Pencil, Trash2, Search, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface EmployeeMini {
  id: string
  firstName: string
  lastName: string
  photoUrl: string | null
  employeeNo: string
  position?: { title: string } | null
}

interface Department {
  id: string
  name: string
  code: string | null
  _count: { employees: number }
  employees?: EmployeeMini[]
}

const COLORS = [
  { hex: '#14b8a6', iconBg: 'bg-[#D4D8DD]',   iconText: 'text-[#2E4156]',   avatarBg: 'bg-[#C0C8CA]',   avatarText: 'text-[#1A2D42]',   badge: 'bg-[#C0C8CA] text-[#1A2D42]'   },
  { hex: '#3b82f6', iconBg: 'bg-blue-50',   iconText: 'text-blue-600',   avatarBg: 'bg-blue-100',   avatarText: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700'   },
  { hex: '#a855f7', iconBg: 'bg-purple-50', iconText: 'text-purple-600', avatarBg: 'bg-purple-100', avatarText: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  { hex: '#f97316', iconBg: 'bg-orange-50', iconText: 'text-orange-600', avatarBg: 'bg-orange-100', avatarText: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  { hex: '#22c55e', iconBg: 'bg-green-50',  iconText: 'text-green-600',  avatarBg: 'bg-green-100',  avatarText: 'text-green-700',  badge: 'bg-green-100 text-green-700'  },
  { hex: '#ec4899', iconBg: 'bg-pink-50',   iconText: 'text-pink-600',   avatarBg: 'bg-pink-100',   avatarText: 'text-pink-700',   badge: 'bg-pink-100 text-pink-700'   },
  { hex: '#6366f1', iconBg: 'bg-indigo-50', iconText: 'text-indigo-600', avatarBg: 'bg-indigo-100', avatarText: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700' },
]

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', code: '' })
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [editForm, setEditForm] = useState({ name: '', code: '' })
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState<Department | null>(null)
  const [deleteInput, setDeleteInput] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/departments?includeEmployees=1')
      const data = await res.json().catch(() => ({}))
      setDepartments(data.departments ?? [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(t)
  }, [])

  const totalEmployees = useMemo(
    () => departments.reduce((s, d) => s + (d._count?.employees ?? 0), 0),
    [departments]
  )

  const filtered = useMemo(
    () => departments.filter(d =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.code || '').toLowerCase().includes(search.toLowerCase())
    ),
    [departments, search]
  )

  async function createDepartment() {
    if (!form.name.trim()) { toast.error('Department name is required'); return }
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim(), code: form.code.trim() || null }),
    })
    if (res.ok) {
      toast.success('Department created')
      setForm({ name: '', code: '' })
      setOpen(false)
      load()
    } else {
      toast.error('Failed to create department')
    }
  }

  function openEdit(dept: Department) {
    setEditing(dept)
    setEditForm({ name: dept.name, code: dept.code ?? '' })
    setEditOpen(true)
  }

  async function saveEditDepartment() {
    if (!editing) return
    if (!editForm.name.trim()) { toast.error('Department name is required'); return }
    const res = await fetch('/api/departments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editing.id, name: editForm.name.trim(), code: editForm.code.trim() || null }),
    })
    if (res.ok) {
      toast.success('Department updated')
      setEditOpen(false)
      setEditing(null)
      setEditForm({ name: '', code: '' })
      load()
    } else {
      toast.error('Failed to update department')
    }
  }

  function openDelete(dept: Department) {
    setDeleting(dept)
    setDeleteInput('')
    setDeleteOpen(true)
  }

  async function confirmDeleteDepartment() {
    if (!deleting) return
    if (deleteInput !== 'DELETE') { toast.error('Please type DELETE to confirm'); return }
    const res = await fetch(`/api/departments?id=${deleting.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Department deleted')
      setDeleteOpen(false)
      setDeleting(null)
      setDeleteInput('')
      load()
    } else {
      toast.error('Failed to delete department')
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {departments.length} departments · {totalEmployees} employees
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              className="pl-9 w-52 h-9 text-sm"
              placeholder="Search departments..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => setOpen(true)} style={{ background: '#fa5e01' }} className="text-white h-9">
            <Plus className="w-4 h-4 mr-1.5" /> Add Department
          </Button>
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-44 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="w-14 h-14 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium text-lg">
            {search ? `No departments matching "${search}"` : 'No departments yet'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {search ? 'Try a different search term' : 'Create your first department to get started'}
          </p>
          {!search && (
            <Button className="mt-5 text-white" style={{ background: '#fa5e01' }} onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add your first department
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((dept, idx) => {
            const color = COLORS[idx % COLORS.length]
            const isExpanded = expandedId === dept.id
            const employees = dept.employees ?? []

            return (
              <Card key={dept.id} className="shadow-sm hover:shadow-md transition-all overflow-hidden" style={{ borderTop: `4px solid ${color.hex}` }}>

                {/* Clickable body */}
                <div
                  className="cursor-pointer select-none"
                  onClick={() => setExpandedId(isExpanded ? null : dept.id)}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${color.iconBg} flex items-center justify-center shrink-0`}>
                          <Building2 className={`w-5 h-5 ${color.iconText}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 leading-tight">{dept.name}</h3>
                          {dept.code && (
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded mt-0.5 inline-block ${color.badge}`}>
                              {dept.code}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Users className="w-3 h-3" />
                          {dept._count?.employees ?? 0}
                        </Badge>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />
                        }
                      </div>
                    </div>

                    {/* Avatar stack */}
                    <div className="flex items-center gap-2 min-h-[28px]">
                      {employees.length > 0 ? (
                        <>
                          <div className="flex -space-x-2">
                            {employees.slice(0, 7).map(emp => (
                              emp.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={emp.id}
                                  src={emp.photoUrl}
                                  alt={emp.firstName}
                                  className="w-7 h-7 rounded-full border-2 border-white object-cover"
                                />
                              ) : (
                                <div
                                  key={emp.id}
                                  className={`w-7 h-7 rounded-full border-2 border-white ${color.avatarBg} ${color.avatarText} text-[10px] font-bold flex items-center justify-center`}
                                >
                                  {(emp.firstName?.[0] || '')}{(emp.lastName?.[0] || '')}
                                </div>
                              )
                            ))}
                            {(dept._count?.employees ?? 0) > 7 && (
                              <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center">
                                +{(dept._count?.employees ?? 0) - 7}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">
                            {isExpanded ? 'Click to collapse' : 'Click to view members'}
                          </span>
                        </>
                      ) : (
                        <p className="text-xs text-gray-400">No members yet</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons — stopPropagation so they don't toggle expand */}
                <div
                  className="px-5 pb-4 flex items-center gap-2"
                  onClick={e => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => openEdit(dept)}
                  >
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => openDelete(dept)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                  </Button>
                </div>

                {/* ── Expanded Employee List ── */}
                {isExpanded && (
                  <div className="border-t bg-gray-50/80">
                    <div className="px-4 pt-3 pb-4">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
                        Members · {dept._count?.employees ?? 0}
                      </p>
                      {employees.length === 0 ? (
                        <div className="text-center py-6">
                          <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">No employees assigned yet</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                          {employees.map((emp) => (
                            <div
                              key={emp.id}
                              className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-gray-100"
                            >
                              {emp.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={emp.photoUrl}
                                  alt=""
                                  className="w-8 h-8 rounded-full object-cover shrink-0"
                                />
                              ) : (
                                <div className={`w-8 h-8 rounded-full ${color.avatarBg} ${color.avatarText} text-xs font-bold flex items-center justify-center shrink-0`}>
                                  {(emp.firstName?.[0] || '')}{(emp.lastName?.[0] || '')}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {emp.firstName} {emp.lastName}
                                </p>
                                <p className="text-xs text-gray-400 truncate">
                                  {emp.position?.title || '—'}
                                </p>
                              </div>
                              <span className="text-xs text-gray-400 font-mono shrink-0">
                                {emp.employeeNo}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Add Modal ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Add Department</h3>
              <p className="text-sm text-gray-500 mt-0.5">Create a new organizational department</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Department Name *</label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Human Resources"
                  onKeyDown={e => e.key === 'Enter' && createDepartment()}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Department Code</label>
                <Input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. HR"
                  maxLength={10}
                />
                <p className="text-xs text-gray-400 mt-1">Optional short identifier</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={createDepartment} style={{ background: '#fa5e01' }} className="text-white">
                Create Department
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Edit Department</h3>
              <p className="text-sm text-gray-500 mt-0.5">Update department information</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Department Name *</label>
                <Input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Human Resources"
                  onKeyDown={e => e.key === 'Enter' && saveEditDepartment()}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Department Code</label>
                <Input
                  value={editForm.code}
                  onChange={e => setEditForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. HR"
                  maxLength={10}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditOpen(false); setEditing(null) }}>Cancel</Button>
              <Button onClick={saveEditDepartment} style={{ background: '#fa5e01' }} className="text-white">
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {deleteOpen && deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Department</h3>
                  <p className="text-sm text-red-500 mt-0.5">This action cannot be undone</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">
                You are about to delete <strong>{deleting.name}</strong>.
                {deleting._count.employees > 0 && (
                  <> The <strong>{deleting._count.employees}</strong> employee(s) will become unassigned.</>
                )}
              </p>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  Type <span className="text-red-600 font-mono">DELETE</span> to confirm
                </label>
                <Input
                  value={deleteInput}
                  onChange={e => setDeleteInput(e.target.value)}
                  placeholder="DELETE"
                  className="border-red-200 focus-visible:ring-red-400"
                  onKeyDown={e => e.key === 'Enter' && deleteInput === 'DELETE' && confirmDeleteDepartment()}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => { setDeleteOpen(false); setDeleting(null); setDeleteInput('') }}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmDeleteDepartment}
                disabled={deleteInput !== 'DELETE'}
              >
                Delete Department
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

