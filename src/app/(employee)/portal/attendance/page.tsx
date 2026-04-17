'use client'

import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface DTRRecord {
  id: string
  date: string
  timeIn: string | null
  timeOut: string | null
  regularHours: number | null
  overtimeHours: number | null
  lateMinutes: number | null
  undertimeMinutes: number | null
  isAbsent: boolean
  isHoliday: boolean
  isLeave: boolean
  isRestDay: boolean
  holidayType: string | null
  remarks: string | null
  source: string
  clockInAddress: string | null
  clockOutAddress: string | null
}

function statusBadge(record: DTRRecord) {
  if (record.isAbsent) return <Badge className="bg-red-100 text-red-700 border-red-200">Absent</Badge>
  if (record.isLeave) {
    return (
      <Badge
        className="border"
        style={{ background: 'rgba(170,183,183,0.28)', color: '#1A2D42', borderColor: 'rgba(170,183,183,0.5)' }}
      >
        On Leave
      </Badge>
    )
  }
  if (record.isHoliday && !record.timeIn) return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Holiday</Badge>
  if (record.isRestDay && !record.timeIn) return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Rest Day</Badge>
  if (record.timeIn && !record.timeOut) {
    return (
      <Badge
        className="border"
        style={{ background: 'rgba(46,65,86,0.12)', color: '#2E4156', borderColor: 'rgba(170,183,183,0.45)' }}
      >
        Clocked In
      </Badge>
    )
  }
  if (record.timeIn && record.timeOut) {
    return (
      <Badge
        className="border"
        style={{ background: 'rgba(46,65,86,0.12)', color: '#2E4156', borderColor: 'rgba(170,183,183,0.45)' }}
      >
        Present
      </Badge>
    )
  }
  return <Badge className="bg-gray-100 text-gray-500 border-gray-200">-</Badge>
}

export default function AttendancePage() {
  const [records, setRecords] = useState<DTRRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const from = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
        const to = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
        const res = await fetch(`/api/dtr?from=${from}&to=${to}&limit=31`)
        const data = await res.json()
        setRecords(data.records ?? [])
      } catch {
        // silent fail
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentMonth])

  const totals = records.reduce(
    (acc, r) => ({
      present: acc.present + (!r.isAbsent && !r.isLeave && r.timeIn ? 1 : 0),
      absent: acc.absent + (r.isAbsent ? 1 : 0),
      late: acc.late + ((r.lateMinutes ?? 0) > 0 ? 1 : 0),
      hours: acc.hours + Number(r.regularHours ?? 0),
      ot: acc.ot + Number(r.overtimeHours ?? 0),
    }),
    { present: 0, absent: 0, late: 0, hours: 0, ot: 0 }
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
          <p className="text-gray-500 text-sm mt-1">Your daily time records</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="p-1.5 hover:bg-gray-100 rounded"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 px-2 min-w-[130px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, -1))}
            disabled={currentMonth >= new Date()}
            className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Days Present', value: totals.present, color: 'text-[#2E4156]' },
          { label: 'Days Absent', value: totals.absent, color: 'text-red-600' },
          { label: 'Days Late', value: totals.late, color: 'text-amber-600' },
          { label: 'Total Hours', value: `${totals.hours.toFixed(1)}h`, color: '' },
          { label: 'OT Hours', value: `${totals.ot.toFixed(1)}h`, color: 'text-[#1A2D42]' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`} style={s.label === 'Total Hours' ? { color: '#2E4156' } : undefined}>
              {s.value}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Time In</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Time Out</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Hours</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Late</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No records for this month
                  </td>
                </tr>
              ) : (
                records.map(record => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {format(new Date(record.date), 'EEE, MMM d')}
                    </td>
                    <td className="px-4 py-3">{statusBadge(record)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {record.timeIn ? (
                        <span className="flex items-center gap-1">
                          {format(new Date(record.timeIn), 'hh:mm a')}
                          {record.clockInAddress && (
                            <MapPin className="w-3 h-3" style={{ color: '#2E4156' }} aria-label={record.clockInAddress} />
                          )}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {record.timeOut ? (
                        <span className="flex items-center gap-1">
                          {format(new Date(record.timeOut), 'hh:mm a')}
                          {record.clockOutAddress && (
                            <MapPin className="w-3 h-3" style={{ color: '#2E4156' }} aria-label={record.clockOutAddress} />
                          )}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className="flex items-center gap-1">
                        {record.regularHours ? `${record.regularHours}h` : '-'}
                        {Number(record.overtimeHours) > 0 && (
                          <span className="text-xs" style={{ color: '#1A2D42' }}>+{record.overtimeHours}h OT</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(record.lateMinutes ?? 0) > 0 ? (
                        <span className="text-amber-600 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {record.lateMinutes}min
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={
                          record.source === 'GPS'
                            ? { background: 'rgba(46,65,86,0.12)', color: '#2E4156' }
                            : { background: '#f9fafb', color: '#6b7280' }
                        }
                      >
                        {record.source}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

