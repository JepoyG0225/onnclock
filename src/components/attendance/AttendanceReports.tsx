'use client'
import { useEffect, useState } from 'react'
import { ActivityLocation } from './ActivityLocation'
import { Button } from '@/components/ui/button'
import { type AttendanceReport, type ReportEmployee, type ReportType, reportTypes, summarize, csvCell } from '@/lib/attendance/report-data'

const phTime = (value: string | null) => value ? new Date(value).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }) : '—'
export default function AttendanceReports({ standalone = false }: { standalone?: boolean }) {
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(new Date()))
  const [period, setPeriod] = useState<'month' | 'date' | 'range'>('month')
  const [reportDate, setReportDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))
  const [rangeStart, setRangeStart] = useState(reportDate), [rangeEnd, setRangeEnd] = useState(reportDate)
  const [employeeId, setEmployeeId] = useState(''), [departmentId, setDepartmentId] = useState('')
  const [type, setType] = useState<ReportType>('summary'), [employees, setEmployees] = useState<ReportEmployee[]>([]), [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [data, setData] = useState<AttendanceReport | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [generatedType, setGeneratedType] = useState<ReportType>('summary')
  useEffect(() => {
    let cancelled = false
    if (standalone) {
      const query = new URLSearchParams(window.location.search), selected = query.get('type') ?? 'summary'
      const reportType = selected in reportTypes ? selected as ReportType : 'summary'
      setBusy(true); setGeneratedType(reportType)
      fetch(`/api/attendance/reports?${query}`, { cache: 'no-store' }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error); if (!cancelled) setData(body) }).catch(e => { if (!cancelled) setError(e.message) }).finally(() => { if (!cancelled) setBusy(false) })
    } else {
      const current = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(new Date())
      fetch(`/api/attendance/reports?options=1&month=${current}`, { cache: 'no-store' }).then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error); if (!cancelled) { setEmployees(body.employees); setDepartments(body.departments) } }).catch(e => { if (!cancelled) setError(e.message) })
    }
    return () => { cancelled = true }
  }, [standalone])
  const query = () => new URLSearchParams({ ...(period === 'range' ? { from: rangeStart, to: rangeEnd } : period === 'date' ? { date: reportDate } : { month }), type, ...(employeeId ? { employeeId } : {}), ...(departmentId ? { departmentId } : {}) })
  async function generate() {
    setBusy(true); setError(''); setData(null)
    try {
      const response = await fetch(`/api/attendance/reports?${query()}`, { cache: 'no-store' })
      const body = await response.json(); if (!response.ok) throw new Error(body.error)
      setData(body); setGeneratedType(type)
    } catch (e) { setError(e instanceof Error ? e.message : 'Report failed.') } finally { setBusy(false) }
  }
  async function print() {
    setBusy(true); setError('')
    try {
      await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('#attendance-report img')).map(image => image.decode()))
      window.print()
    } catch { setError('A photo could not be loaded. Refresh the report before printing.') } finally { setBusy(false) }
  }
  function csv() {
    if (!data) return
    const rows: unknown[][] = generatedType === 'summary'
      ? [['Employee number', 'Employee', 'Present days', 'Absent days', 'Leave days', 'Regular hours', 'Recorded OT hours', 'Late minutes', 'Undertime minutes', 'Activity logs'], ...data.employees.map(e => { const s = summarize(data.records.filter(r => r.employeeId === e.id)); return [e.employeeNo, `${e.lastName}, ${e.firstName}`, s.present, s.absent, s.leave, s.regular.toFixed(2), s.overtime.toFixed(2), s.late, s.undertime, s.activities] })]
      : generatedType === 'activities'
        ? [['Employee number', 'Employee', 'Shift date', 'Logged at (Philippine time)', 'Activity number', 'Activity', 'Notes', 'Photo attached', 'Latitude', 'Longitude', 'GPS accuracy (m)', 'Location captured at'], ...data.employees.flatMap(e => data.records.filter(r => r.employeeId === e.id).flatMap(r => r.activities.map(a => [e.employeeNo, `${e.lastName}, ${e.firstName}`, r.date.slice(0, 10), new Date(a.loggedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }), a.dailyNumber, a.description, a.notes ?? '', a.photoUrl ? 'Yes' : 'No', a.latitude, a.longitude, a.locationAccuracy, a.locationCapturedAt ? new Date(a.locationCapturedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : ''])))]
        : [['Employee number', 'Employee', 'Shift date', 'Time in (PH)', 'Time out (PH)', 'Regular hours', 'Recorded OT hours', 'Late minutes', 'Undertime minutes', 'Absent', 'Leave', 'Activity logs'], ...data.employees.flatMap(e => filtered(data.records.filter(r => r.employeeId === e.id), generatedType).map(r => [e.employeeNo, `${e.lastName}, ${e.firstName}`, r.date.slice(0, 10), phTime(r.timeIn), phTime(r.timeOut), r.regularHours, r.overtimeHours, r.lateMinutes, r.undertimeMinutes, r.isAbsent ? 'Yes' : 'No', r.isLeave ? 'Yes' : 'No', r.activities.length]))]
    const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `attendance-${generatedType}-${periodLabel(data)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className={standalone ? 'max-w-5xl mx-auto p-6' : 'space-y-5'}>
    <div className="no-print space-y-4"><h1 className="text-2xl font-semibold">Attendance reports</h1>
      {!standalone && <><p className="text-sm text-gray-500">Generate reports for a month, a specific date, or a date range, by employee or department. Activity reports include daily entries and photos.</p>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2"><label className="text-sm">Period<select value={period} onChange={e => setPeriod(e.target.value as 'month' | 'date' | 'range')} className="block border rounded p-2 w-full"><option value="month">Monthly</option><option value="date">Specific date</option><option value="range">Date range</option></select></label>{period === 'range' ? <div className="grid grid-cols-2 gap-2"><label className="text-sm">From<input type="date" value={rangeStart} max={rangeEnd} onChange={e=>setRangeStart(e.target.value)} className="block w-full border rounded p-2" /></label><label className="text-sm">To<input type="date" value={rangeEnd} min={rangeStart} onChange={e=>setRangeEnd(e.target.value)} className="block w-full border rounded p-2" /></label></div> : period === 'month' ? <label className="block text-sm">Month<input type="month" value={month} onChange={e => setMonth(e.target.value)} className="block border rounded p-2 w-full" /></label> : <label className="block text-sm">Date (Philippine time)<input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="block border rounded p-2 w-full" /></label>}</div>
          <label className="text-sm">Report<select value={type} onChange={e => setType(e.target.value as ReportType)} className="block border rounded p-2 w-full">{Object.entries(reportTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-sm">Employee<select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="block border rounded p-2 w-full"><option value="">All employees</option>{employees.map(e => <option key={e.id} value={e.id}>{e.employeeNo} · {e.lastName}, {e.firstName}</option>)}</select></label>
          <label className="text-sm">Department<select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="block border rounded p-2 w-full"><option value="">All departments</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        </div>{type === 'activities' && period !== 'date' && !employeeId && <p className="text-sm text-amber-700">Select an employee to generate their daily activity report for this period.</p>}<div className="flex gap-3"><Button disabled={busy || !(period === 'range' ? rangeStart && rangeEnd && rangeEnd >= rangeStart : period === 'date' ? reportDate : month) || (type === 'activities' && period !== 'date' && !employeeId)} onClick={() => void generate()}>Generate report</Button><Button variant="outline" disabled={busy || !(period === 'range' ? rangeStart && rangeEnd && rangeEnd >= rangeStart : period === 'date' ? reportDate : month) || (type === 'activities' && period !== 'date' && !employeeId)} onClick={() => window.open(`/attendance-report?${query()}`, '_blank', 'noopener,noreferrer')}>Open printable report</Button></div></>}
      {data && <div className="flex gap-3 mb-5">{standalone && <Button disabled={busy} onClick={() => void print()}>Print / Save as PDF</Button>}<Button variant="outline" disabled={busy} onClick={csv}>Download CSV</Button></div>}
      {error && <p role="alert" className="text-red-600">{error}</p>}{busy && <p>Preparing report…</p>}
    </div>
    {data && <ReportPages data={data} type={generatedType} />}
    <style>{`@media print { @page { size: A4; margin: 14mm; } .no-print { display:none !important; } .report-page { break-before:page; border:0 !important; padding:0 !important; box-shadow:none !important; } .report-page:first-child { break-before:auto; } .activity-entry { break-inside:avoid; } thead { display:table-header-group; } tr { break-inside:avoid; } }`}</style>
  </div>
}
function filtered(records: AttendanceReport['records'], type: ReportType) {
  return records.filter(r => type === 'exceptions' ? r.lateMinutes > 0 || r.undertimeMinutes > 0 : type === 'absence' ? r.isAbsent || r.isLeave : type === 'overtime' ? r.overtimeHours > 0 : true)
}
export function ReportPages({ data, type }: { data: AttendanceReport; type: ReportType }) {
  return <div id="attendance-report" className="space-y-5">{data.employees.length === 0 && <p>No employees match these filters.</p>}{data.employees.map(employee => {
    const records = data.records.filter(r => r.employeeId === employee.id), summary = summarize(records)
    const header = <header className="border-b pb-3 mb-4"><h2 className="font-bold text-lg">{data.companyName} · {reportTypes[type]}</h2><p>{employee.lastName}, {employee.firstName} · {employee.employeeNo} · {employee.department?.name ?? 'No department'}</p><p className="text-xs text-gray-500">{data.rangeStart ? 'Date range' : data.reportDate ? 'Date' : 'Month'}: {periodLabel(data)} · Philippine time · Generated {new Date(data.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p></header>
    const activityRecords = records.filter(record => record.activities.length > 0)
    const activityDay = (loggedAt: string) => new Date(new Date(loggedAt).getTime()+480*60000).toISOString().slice(0,10)
    const activityDays = [...new Set(activityRecords.flatMap(record => data.rangeStart ? record.activities.map(a=>activityDay(a.loggedAt)) : [data.reportDate ?? record.date.slice(0,10)]))].sort()
    if (type === 'activities' && !activityDays.length) return <p key={employee.id} role="status" className="no-print text-sm text-gray-500">No activity logs for {employee.firstName} {employee.lastName} in {periodLabel(data)}.</p>
    if (type === 'activities') return activityDays.map((day, index) => {
      const shifts = data.rangeStart ? activityRecords.map(r=>({...r,activities:r.activities.filter(a=>activityDay(a.loggedAt)===day)})).filter(r=>r.activities.length) : activityRecords.filter(r => data.reportDate || r.date.slice(0, 10) === day)
      return <section key={`${employee.id}-${day}`} className="report-page border rounded-xl bg-white p-5">{header}<h3 className="font-semibold mb-3">Daily activities — {day}</h3><p className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-semibold">Total activity logs for this day: {shifts.reduce((total,shift)=>total+shift.activities.length,0)} ? Total in report period: {summary.activities}</p>
        {shifts.map(shift => <div key={shift.id} className="mb-4">
          <p className="text-sm mb-3">Shift: {phTime(shift.timeIn)} – {phTime(shift.timeOut)} · Regular hours: {shift.regularHours.toFixed(2)} ? Activity logs: {shift.activities.length}</p>
          {shift.activities.map(activity => <article key={activity.id} className="activity-entry border rounded-lg p-3 mb-3"><p className="font-semibold mb-1">Activity #{activity.dailyNumber}</p><p className="text-xs text-gray-500">{new Date(activity.loggedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p><p className="whitespace-pre-wrap break-words mt-1">{activity.description}</p>{activity.notes && <p className="whitespace-pre-wrap break-words mt-2 text-sm"><strong>Notes: </strong>{activity.notes}</p>}
            <ActivityLocation activity={activity} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {(activity.photoUrls ?? (activity.photoUrl ? [activity.photoUrl] : [])).map((url,index) => <img key={url} src={url} alt={`Employee activity photo ${index+1}`} className="mt-3 max-h-64 max-w-full object-contain" />)}
          </article>)}
        </div>)}<footer className="text-xs text-gray-500 mt-4">Activity day {index + 1} of {activityDays.length} · {data.reportDate ? 'Activities logged on the selected Philippine calendar date, including overnight shifts.' : 'Activities belong to the shift date, including overnight shifts.'}</footer></section>
    })
    return <section key={employee.id} className="report-page border rounded-xl bg-white p-5">{header}
      {type === 'summary' ? <dl className="grid grid-cols-2 gap-3 text-sm">{Object.entries({ 'Days with clock-in': summary.present, 'Absent days': summary.absent, 'Leave days': summary.leave, 'Regular hours': summary.regular.toFixed(2), 'Recorded OT hours': summary.overtime.toFixed(2), 'Late minutes': summary.late, 'Undertime minutes': summary.undertime, 'Activity logs': summary.activities }).map(([label, value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
        : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left">{['Date', 'In', 'Out', 'Regular h', 'Recorded OT h', 'Late min', 'UT min', 'Activity logs', 'Status'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{filtered(records, type).map(r => <tr key={r.id} className="border-b"><td className="p-2">{r.date.slice(0, 10)}</td><td>{phTime(r.timeIn)}</td><td>{phTime(r.timeOut)}</td><td>{r.regularHours.toFixed(2)}</td><td>{r.overtimeHours.toFixed(2)}</td><td>{r.lateMinutes}</td><td>{r.undertimeMinutes}</td><td>{r.activities.length}</td><td>{r.isAbsent && r.isLeave ? 'Half-day leave / absent' : r.isAbsent ? (r.derived ? 'Absent (no clock-in)' : 'Absent') : r.isLeave ? 'Leave' : r.timeIn ? (r.timeOut ? 'Present' : 'Open shift') : r.isRestDay ? 'Rest day' : r.isHoliday ? 'Holiday' : 'No punch'}</td></tr>)}</tbody></table>{!filtered(records, type).length && <p className="text-sm py-4">No matching attendance records.</p>}</div>}
      <p className="text-xs text-gray-500 mt-5">Includes saved timesheets and missed scheduled workdays before today after the shift has ended. Approved leave is counted separately; pending leave does not excuse an absence. Rest days, holidays, and days outside employment are excluded from inferred absences. Employees without DTR tracking or a known schedule are not assigned inferred absences. Fixed schedules reflect current settings. Recorded overtime is not a payroll approval.</p>
    </section>
  })}</div>
}

function periodLabel(data:AttendanceReport) { return data.rangeStart && data.rangeEnd ? `${data.rangeStart} to ${data.rangeEnd}` : data.reportDate ?? data.month }
