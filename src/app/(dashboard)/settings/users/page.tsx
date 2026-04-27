'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, UserPlus, X, KeyRound, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { ROLE_LABELS, ROLE_COLORS, UserRole } from '@/lib/auth/permissions'

interface Member {
  id: string; userId: string; role: UserRole
  email?: string; createdAt: string
  user?: { name?: string | null; email?: string | null }
}

interface EmployeeOption {
  id: string
  firstName: string
  lastName: string
  employeeNo: string
  workEmail?: string | null
  personalEmail?: string | null
}

const ROLE_OPTIONS: UserRole[] = ['COMPANY_ADMIN', 'HR_MANAGER', 'PAYROLL_OFFICER']

const EMPTY_FORM = { name: '', email: '', password: '', role: 'HR_MANAGER' as UserRole, employeeId: '' }

export default function UsersPage() {
  const [members,   setMembers]   = useState<Member[]>([])
  const [loading,   setLoading]   = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [saving,    setSaving]    = useState(false)
  const [mode,      setMode]      = useState<'existing' | 'new'>('existing')
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [showReset, setShowReset] = useState(false)
  const [resetUser, setResetUser] = useState<{ id: string; label: string } | null>(null)
  const [resetPass, setResetPass] = useState('')
  const [resetting, setResetting] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteUser, setDeleteUser] = useState<{ id: string; label: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editUser, setEditUser] = useState<{ id: string; label: string } | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '' })
  const [editing, setEditing] = useState(false)

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/users')
    const data = await res.json().catch(() => ({}))
    setMembers((data.members ?? []).filter((m: Member) => m.role !== 'EMPLOYEE'))
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    async function loadEmployees() {
      const res = await fetch('/api/employees?unlinked=1')
      const data = await res.json().catch(() => ({}))
      setEmployees(data.employees ?? [])
    }
    loadEmployees()
  }, [])

  async function changeRole(userId: string, role: UserRole) {
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    })
    if (res.ok) { toast.success('Role updated'); load() }
    else toast.error('Failed to update role')
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    if (mode === 'existing' && !form.employeeId) {
      toast.error('Please select an employee')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to add user'); return }
      toast.success('User added successfully')
      setShowForm(false)
      setForm(EMPTY_FORM)
      setMode('existing')
      load()
    } finally {
      setSaving(false)
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!resetUser) return
    if (resetPass.trim().length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setResetting(true)
    try {
      const res = await fetch(`/api/users/${resetUser.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPass }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to reset password')
        return
      }
      toast.success('Password reset successfully')
      setShowReset(false)
      setResetUser(null)
      setResetPass('')
    } finally {
      setResetting(false)
    }
  }

  async function confirmDelete() {
    if (!deleteUser) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/users?userId=${encodeURIComponent(deleteUser.id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to delete user')
        return
      }
      toast.success('User removed')
      setShowDelete(false)
      setDeleteUser(null)
      load()
    } finally {
      setDeleting(false)
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editUser) return
    if (!editForm.name.trim()) {
      toast.error('Name is required')
      return
    }
    if (!editForm.email.trim()) {
      toast.error('Email is required')
      return
    }

    setEditing(true)
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to update user details')
        return
      }
      toast.success('User details updated')
      setShowEdit(false)
      setEditUser(null)
      setEditForm({ name: '', email: '' })
      load()
    } finally {
      setEditing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 text-sm mt-1">Manage team access and role assignments</p>
        </div>
        <Button
          onClick={() => setShowForm(v => !v)}
          style={{ background: '#fa5e01' }}
          className="text-white"
        >
          {showForm ? <><X className="w-4 h-4 mr-2" />Cancel</> : <><UserPlus className="w-4 h-4 mr-2" />Add User</>}
        </Button>
      </div>

      {/* Add User Form */}
      {showForm && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-sm text-orange-800">Add New User</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-600 block mb-1">Create User For</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('existing')}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                      mode === 'existing' ? 'bg-white border-orange-300 text-orange-700' : 'bg-white/50 border-gray-200 text-gray-500'
                    }`}
                  >
                    Existing Employee
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('new')}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                      mode === 'new' ? 'bg-white border-orange-300 text-orange-700' : 'bg-white/50 border-gray-200 text-gray-500'
                    }`}
                  >
                    New User
                  </button>
                </div>
              </div>

              {mode === 'existing' && (
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Select Employee *</label>
                  <select
                    value={form.employeeId}
                    onChange={e => {
                      const id = e.target.value
                      const emp = employees.find(x => x.id === id)
                      setForm(f => ({
                        ...f,
                        employeeId: id,
                        name: emp ? `${emp.firstName} ${emp.lastName}` : f.name,
                        email: emp ? (emp.workEmail || emp.personalEmail || f.email) : f.email,
                      }))
                    }}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">— Select employee —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName} ({emp.employeeNo})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">Email will auto-fill if available.</p>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Full Name *</label>
                <input
                  required={mode === 'new'}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Juan dela Cruz"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  disabled={mode === 'existing'}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Email Address *</label>
                <input
                  required={mode === 'new'}
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@company.com"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  disabled={mode === 'existing'}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Password * (min 8 chars)</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min. 8 characters"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Role *</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={saving} style={{ background: '#fa5e01' }} className="text-white">
                  {saving ? 'Adding...' : 'Add User'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Role reference */}
      <Card className="bg-[#D4D8DD] border-[#AAB7B7]">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-[#1A2D42] mb-2">Role Permissions</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-[#1A2D42]">
            <div><strong>Company Admin</strong> — Full access</div>
            <div><strong>HR Manager</strong> — Employees, leaves, DTR, reports</div>
            <div><strong>Payroll Officer</strong> — Payroll, reports, loans</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Team Members
            <Badge variant="outline">{members.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No team members yet. Add your first user above.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600">User</th>
                  <th className="text-center p-3 font-medium text-gray-600">Current Role</th>
                  <th className="text-left p-3 font-medium text-gray-600">Joined</th>
                  <th className="text-center p-3 font-medium text-gray-600">Change Role</th>
                  <th className="text-center p-3 font-medium text-gray-600">Edit Details</th>
                  <th className="text-center p-3 font-medium text-gray-600">Reset Password</th>
                  <th className="text-center p-3 font-medium text-gray-600">Remove</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-sm text-gray-700">
                      {m.user?.name || m.user?.email || m.email || '—'}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[m.role]}`}>
                        {ROLE_LABELS[m.role]}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-400">
                      {new Date(m.createdAt).toLocaleDateString('en-PH')}
                    </td>
                    <td className="p-3 text-center">
                      <select
                        value={m.role}
                        onChange={e => changeRole(m.userId, e.target.value as UserRole)}
                        className="border rounded px-2 py-1 text-xs"
                      >
                        {ROLE_OPTIONS.map(r => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          const label = m.user?.name || m.user?.email || m.email || 'User'
                          setEditUser({ id: m.userId, label })
                          setEditForm({
                            name: (m.user?.name || '').trim(),
                            email: (m.user?.email || m.email || '').trim(),
                          })
                          setShowEdit(true)
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          const label = m.user?.name || m.user?.email || m.email || 'User'
                          setResetUser({ id: m.userId, label })
                          setResetPass('')
                          setShowReset(true)
                        }}
                      >
                        <KeyRound className="w-3.5 h-3.5 mr-1" /> Reset
                      </Button>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs text-red-600 border-red-300 hover:bg-red-600 hover:text-white hover:border-red-600"
                        onClick={() => {
                          const label = m.user?.name || m.user?.email || m.email || 'User'
                          setDeleteUser({ id: m.userId, label })
                          setShowDelete(true)
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {showEdit && editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b">
              <h3 className="text-lg font-semibold">Edit User Details</h3>
              <p className="text-xs text-gray-500 mt-1">Update details for {editUser.label}</p>
            </div>
            <form onSubmit={saveEdit}>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={e => setEditForm(v => ({ ...v, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Juan dela Cruz"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Email Address *</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm(v => ({ ...v, email: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="user@company.com"
                    required
                  />
                </div>
              </div>
              <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowEdit(false)
                    setEditUser(null)
                    setEditForm({ name: '', email: '' })
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={editing} style={{ background: '#fa5e01' }} className="text-white">
                  {editing ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReset && resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b">
              <h3 className="text-lg font-semibold">Reset Password</h3>
              <p className="text-xs text-gray-500 mt-1">For {resetUser.label}</p>
            </div>
            <form onSubmit={resetPassword}>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">New Password *</label>
                  <input
                    type="password"
                    minLength={8}
                    value={resetPass}
                    onChange={e => setResetPass(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Min. 8 characters"
                    required
                  />
                </div>
              </div>
              <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowReset(false); setResetUser(null) }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={resetting} style={{ background: '#fa5e01' }} className="text-white">
                  {resetting ? 'Resetting...' : 'Reset Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDelete && deleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b">
              <h3 className="text-lg font-semibold text-red-700">Remove User</h3>
              <p className="text-xs text-gray-500 mt-1">Remove {deleteUser.label} from this company?</p>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600">
              This will revoke access but will not delete their account globally.
            </div>
            <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowDelete(false); setDeleteUser(null) }}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDelete}
                disabled={deleting}
                className="text-white"
                style={{ background: '#ef4444' }}
              >
                {deleting ? 'Removing...' : 'Remove User'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

