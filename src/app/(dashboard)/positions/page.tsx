'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Briefcase, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { peso } from '@/lib/utils'

interface Department { id: string; name: string }
interface Position {
  id: string; title: string; code: string | null; description: string | null
  department: { name: string } | null
  payGrade: { grade: string; minSalary: number; maxSalary: number } | null
  _count: { employees: number }
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', code: '', departmentId: '', description: '' })

  async function load() {
    setLoading(true)
    const [posRes, deptRes] = await Promise.all([
      fetch('/api/positions'),
      fetch('/api/departments'),
    ])
    const posData  = await posRes.json()
    const deptData = await deptRes.json()
    setPositions(posData.positions ?? [])
    setDepartments(deptData.departments ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function add() {
    if (!form.title) { toast.error('Position title is required'); return }
    const res = await fetch('/api/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, departmentId: form.departmentId || null }),
    })
    if (res.ok) {
      toast.success('Position created')
      setShowForm(false)
      setForm({ title: '', code: '', departmentId: '', description: '' })
      load()
    } else {
      toast.error('Failed to create position')
    }
  }

  async function del(id: string) {
    await fetch(`/api/positions?id=${id}`, { method: 'DELETE' })
    toast.success('Position removed')
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Positions</h1>
          <p className="text-gray-500 text-sm mt-1">Job positions and pay grade assignments</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" />Add Position
        </Button>
      </div>

      {showForm && (
        <Card className="border-teal-200">
          <CardHeader><CardTitle className="text-base">New Position</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Title *</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Software Engineer" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Code</label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. SE-1" maxLength={20} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Department</label>
                <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">Not assigned</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the role" />
            </div>
            <div className="flex gap-2">
              <Button onClick={add}>Create Position</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-400">Loading...</div>
      ) : positions.length === 0 ? (
        <div className="p-8 text-center text-gray-400">No positions yet</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {positions.map(p => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <Briefcase className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{p.title}</span>
                        {p.code && <Badge variant="outline" className="text-xs">{p.code}</Badge>}
                      </div>
                      {p.department && <p className="text-xs text-gray-500">{p.department.name}</p>}
                      {p.payGrade && (
                        <p className="text-xs text-gray-400">
                          Grade {p.payGrade.grade}: {peso(p.payGrade.minSalary)} – {peso(p.payGrade.maxSalary)}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                        <Users className="w-3 h-3" />
                        {p._count.employees} employees
                      </div>
                    </div>
                  </div>
                  <button onClick={() => del(p.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
