'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export type LearningProgress = { totalLessons: number; completedLessons: number; percent: number | null; status: string; lastActivityAt: string | null }
type ProgressCourse = { id: string; title: string; enrollments: Array<{
  id: string; status: string; dueDate: string | null; completedAt: string | null; score: number | string | null
  employee: { firstName: string; lastName: string; employeeNo: string }; learningProgress: LearningProgress
}> }
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const labels: Record<string, string> = { ASSIGNED: 'Not started', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled' }

export function EmployeeProgressSection({ courses, onRefresh, refreshing }: { courses: ProgressCourse[]; onRefresh: () => void; refreshing: boolean }) {
  const [search, setSearch] = useState('')
  const [courseId, setCourseId] = useState('')
  const [status, setStatus] = useState('')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const rows = courses.flatMap(c => c.enrollments.map(e => ({ ...e, courseId: c.id, courseTitle: c.title,
    overdue: Boolean(e.dueDate && e.dueDate.slice(0, 10) < today && !['COMPLETED', 'CANCELLED'].includes(e.learningProgress.status)),
  }))).filter(e => (!courseId || e.courseId === courseId) && (!search || `${e.employee.firstName} ${e.employee.lastName} ${e.employee.employeeNo}`.toLowerCase().includes(search.toLowerCase())))
  const filtered = rows.filter(e => !status || (status === 'OVERDUE' ? e.overdue : e.learningProgress.status === status))
  return <Card>
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-lg">Employee Course Progress</CardTitle><Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>Refresh progress</Button></div><p className="text-sm text-gray-500">Track assigned courses, recorded lesson completion and employees who need a follow-up.</p></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input aria-label="Search employees" className="max-w-xs" placeholder="Search employee or employee number" value={search} onChange={e => setSearch(e.target.value)} />
        <select aria-label="Filter by course" className="h-9 max-w-full rounded-md border px-3 text-sm" value={courseId} onChange={e => setCourseId(e.target.value)}><option value="">All courses</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        <select aria-label="Filter by progress status" className="h-9 rounded-md border px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="OVERDUE">Overdue</option></select>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[
        ['Assignments', rows.length], ['In progress', rows.filter(r => r.learningProgress.status === 'IN_PROGRESS').length],
        ['Completed', rows.filter(r => r.learningProgress.status === 'COMPLETED').length], ['Overdue', rows.filter(r => r.overdue).length],
      ].map(([label, count]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-gray-500">{label}</div><div className="text-xl font-semibold">{count}</div></div>)}</div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left">{['Employee', 'Course', 'Lesson progress', 'Status', 'Due date', 'Last activity', 'Completed', 'Score'].map(h => <th key={h} className="whitespace-nowrap px-3 py-3 font-medium text-gray-500">{h}</th>)}</tr></thead>
        <tbody>{filtered.map(e => <tr key={e.id} className="border-b last:border-0">
          <td className="px-3 py-3"><div className="font-medium">{e.employee.firstName} {e.employee.lastName}</div><div className="text-xs text-gray-500">{e.employee.employeeNo}</div></td>
          <td className="px-3 py-3">{e.courseTitle}</td>
          <td className="min-w-44 px-3 py-3">{e.learningProgress.percent === null ? <span className="text-gray-500">No lessons configured</span> : <><div className="mb-1 flex justify-between gap-3 text-xs"><span>{e.learningProgress.completedLessons}/{e.learningProgress.totalLessons} lessons</span><span>{e.learningProgress.percent}%</span></div><div role="progressbar" aria-label={`${e.employee.firstName} ${e.employee.lastName}: ${e.courseTitle}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={e.learningProgress.percent} className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${e.learningProgress.percent}%` }} /></div></>}</td>
          <td className="whitespace-nowrap px-3 py-3"><span className={e.learningProgress.status === 'COMPLETED' ? 'text-emerald-700' : 'text-slate-700'}>{labels[e.learningProgress.status] ?? e.learningProgress.status}</span>{e.overdue && <div className="text-xs font-medium text-red-600">Overdue</div>}</td>
          <td className="whitespace-nowrap px-3 py-3">{date(e.dueDate)}</td><td className="whitespace-nowrap px-3 py-3">{date(e.learningProgress.lastActivityAt)}</td><td className="whitespace-nowrap px-3 py-3">{date(e.completedAt)}</td><td className="px-3 py-3">{e.score == null ? '—' : `${Number(e.score)}%`}</td>
        </tr>)}</tbody>
      </table>{!filtered.length && <p className="py-8 text-center text-sm text-gray-500">{courses.every(c => !c.enrollments.length) ? 'Assign a course to an employee to start tracking progress.' : 'No assignments match these filters.'}</p>}</div>
      <p className="text-xs text-gray-500">Lesson progress includes all current lessons. A course may be marked completed after its required lessons or by an HR manager, even when optional lessons remain. Summary counts follow the employee and course filters.</p>
    </CardContent>
  </Card>
}
