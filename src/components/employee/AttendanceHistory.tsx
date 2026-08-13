'use client'

import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight, Clock, MapPin, ClipboardEdit} from 'lucide-react'
import Link from 'next/link'
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
        style={{ background: 'rgba(170,183,183,0.28)', color: '#021e47', borderColor: 'rgba(170,183,183,0.5)' }}
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
        style={{ background: 'rgba(46,65,86,0.12)', color: '#032b63', borderColor: 'rgba(170,183,183,0.45)' }}
      >
        Clocked In
      </Badge>
    )
  }
  if (record.timeIn && record.timeOut) {
    return (
      <Badge
        className="border"
        style={{ background: 'rgba(46,65,86,0.12)', color: '#032b63', borderColor: 'rgba(170,183,183,0.45)' }}
      >
        Present
      </Badge>
    )
  }
  return <Badge className="bg-gray-100 text-gray-500 border-gray-200">-</Badge>
}

export function AttendanceHistory({ refreshKey = 0 }: { refreshKey?: number }) {
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
  }, [currentMonth, refreshKey])

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
          <h2 className="text-lg font-black" style={{ color: '#032b63' }}>Attendance history</h2>
          <p className="text-gray-500 text-sm mt-1">Your daily time records</p>
          {/* Spotting a wrong punch is exactly what an employee is doing when
              they scroll this list, so the fix is one tap from here rather than
              buried in the More drawer. */}
          <Link
            href="/portal/time-corrections"
            className="inline-flex items-center gap-1 mt-2 text-[12px] font-bold text-slate-500 hover:text-[#032b63] transition-colors"
          >
            <ClipboardEdit className="w-3.5 h-3.5" />
            Request a time correction
          </Link>
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

      {/* Stats: 2 cols on phones, 3 on small tablets, 5 on desktop. 5 cards
          side-by-side at 375px wide would render each cell ≈70px which is
          too cramped for the numeric values. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
        {[
          { label: 'Days Present', value: totals.present, color: 'text-[#032b63]' },
          { label: 'Days Absent', value: totals.absent, color: 'text-red-600' },
          { label: 'Days Late', value: totals.late, color: 'text-amber-600' },
          { label: 'Total Hours', value: `${totals.hours.toFixed(1)}h`, color: '' },
          { label: 'OT Hours', value: `${totals.ot.toFixed(1)}h`, color: 'text-primary' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <p className={`text-lg sm:text-xl font-bold ${s.color}`} style={s.label === 'Total Hours' ? { color: '#032b63' } : undefined}>
              {s.value}
            </p>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* One card per day. This was a seven-column table inside overflow-x-auto,
          which on a phone meant sideways scrolling to reach Hours, Late and
          Source — the columns an employee most wants. A card fits the whole day
          in the viewport with no horizontal movement. */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-white/70 rounded-2xl animate-pulse" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-7 h-7 text-slate-300" />
          </div>
          <p className="text-base font-black text-slate-900">No records this month</p>
          <p className="text-sm text-slate-500 mt-1.5">Try another month using the arrows above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(record => {
            const late = record.lateMinutes ?? 0
            const ot = Number(record.overtimeHours ?? 0)
            return (
              <div key={record.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-black text-slate-900">
                    {format(new Date(record.date), 'EEE, MMM d')}
                  </p>
                  {statusBadge(record)}
                </div>

                <div className="flex items-center gap-4 mt-2.5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">In</p>
                    <p className="text-[13px] font-bold text-slate-800 tabular-nums flex items-center gap-1">
                      {record.timeIn ? format(new Date(record.timeIn), 'h:mm a') : '--'}
                      {record.clockInAddress && (
                        <MapPin className="w-3 h-3 text-slate-300" aria-label={record.clockInAddress} />
                      )}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Out</p>
                    <p className="text-[13px] font-bold text-slate-800 tabular-nums flex items-center gap-1">
                      {record.timeOut ? format(new Date(record.timeOut), 'h:mm a') : '--'}
                      {record.clockOutAddress && (
                        <MapPin className="w-3 h-3 text-slate-300" aria-label={record.clockOutAddress} />
                      )}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Hours</p>
                    <p className="text-[13px] font-black tabular-nums" style={{ color: '#032b63' }}>
                      {record.regularHours ? `${record.regularHours}h` : '--'}
                    </p>
                  </div>
                </div>

                {(late > 0 || ot > 0 || record.source !== 'MANUAL') && (
                  <div className="flex items-center gap-2 flex-wrap mt-2.5">
                    {late > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        <Clock className="w-3 h-3" />
                        {late}m late
                      </span>
                    )}
                    {ot > 0 && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        +{ot}h OT
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 ml-auto">
                      {record.source}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

