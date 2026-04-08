'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface Holiday {
  id: string
  name: string
  date: string
  type: 'REGULAR' | 'SPECIAL_NON_WORKING' | 'SPECIAL_WORKING'
  description: string | null
}

const TYPE_CONFIG = {
  REGULAR: {
    label: 'Regular Holiday',
    bg: '#fee2e2',
    text: '#b91c1c',
    dot: '#ef4444',
    border: '#fca5a5',
  },
  SPECIAL_NON_WORKING: {
    label: 'Special Non-Working',
    bg: '#fef3c7',
    text: '#92400e',
    dot: '#f59e0b',
    border: '#fcd34d',
  },
  SPECIAL_WORKING: {
    label: 'Special Working',
    bg: '#dbeafe',
    text: '#1e40af',
    dot: '#227f84',
    border: '#93c5fd',
  },
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_HEADERS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function HolidaysPage() {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    date: '',
    type: 'REGULAR' as Holiday['type'],
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/holidays?year=${year}`)
      const data = await res.json().catch(() => ({}))
      setHolidays(data.holidays ?? [])
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  async function addHoliday() {
    if (!form.name.trim() || !form.date) { toast.error('Name and date are required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success('Holiday added')
        setShowForm(false)
        setForm({ name: '', date: '', type: 'REGULAR', description: '' })
        load()
      } else {
        toast.error('Failed to add holiday')
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteHoliday(id: string, name: string) {
    if (!confirm(`Remove "${name}"?`)) return
    const res = await fetch(`/api/holidays?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Holiday removed'); load() }
    else toast.error('Failed to remove holiday')
  }

  async function syncFromGoogle() {
    setSyncing(true)
    try {
      const res = await fetch('/api/holidays/sync-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || 'Failed to sync holidays from Google Calendar')
        return
      }
      const sourceLabel = data?.source === 'google_calendar' ? 'Google' : 'Public API'
      toast.success(`${sourceLabel} sync complete: ${data.imported} imported, ${data.skippedManual} skipped`)
      await load()
    } finally {
      setSyncing(false)
    }
  }

  // Build calendar cells
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDOW = new Date(year, month, 1).getDay()
  const totalCells = Math.ceil((firstDOW + daysInMonth) / 7) * 7

  // Map day → holiday for this month
  const holidayMap: Record<number, Holiday> = {}
  holidays.forEach(h => {
    const d = new Date(h.date)
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
      holidayMap[d.getUTCDate()] = h
    }
  })

  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#227f84' }}>Holiday Calendar</h1>
          <p className="text-sm text-slate-500 mt-0.5">Philippine public holidays and special non-working days</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncFromGoogle}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ color: '#227f84', border: '1.5px solid rgba(34,127,132,0.22)', background: '#fff' }}
            title={`Sync ${year} holidays`}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Holidays'}
          </button>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: '#fa5e01', boxShadow: '0 2px 8px rgba(250,94,1,0.3)' }}
          >
            <Plus className="w-4 h-4" />
            Add Holiday
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div
          className="rounded-2xl p-5"
          style={{ background: '#fff', border: '1px solid rgba(250,94,1,0.25)', boxShadow: '0 2px 12px rgba(250,94,1,0.08)' }}
        >
          <p className="text-sm font-bold mb-4" style={{ color: '#227f84' }}>Add New Holiday</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[
              { label: 'Holiday Name *', field: 'name', type: 'text', placeholder: 'e.g. Independence Day' },
              { label: 'Date *', field: 'date', type: 'date', placeholder: '' },
            ].map(({ label, field, type, placeholder }) => (
              <div key={field}>
                <label className="text-xs font-semibold block mb-1.5" style={{ color: '#64748b' }}>{label}</label>
                <input
                  type={type}
                  value={form[field as 'name' | 'date']}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ border: '1.5px solid rgba(10,53,59,0.15)', background: 'rgba(10,53,59,0.02)', color: '#227f84' }}
                  onFocus={e => (e.target.style.borderColor = '#fa5e01')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(10,53,59,0.15)')}
                />
              </div>
            ))}
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: '#64748b' }}>Type *</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as Holiday['type'] }))}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ border: '1.5px solid rgba(10,53,59,0.15)', background: 'rgba(10,53,59,0.02)', color: '#227f84' }}
                onFocus={e => (e.target.style.borderColor = '#fa5e01')}
                onBlur={e => (e.target.style.borderColor = 'rgba(10,53,59,0.15)')}
              >
                <option value="REGULAR">Regular Holiday (200%)</option>
                <option value="SPECIAL_NON_WORKING">Special Non-Working (130%)</option>
                <option value="SPECIAL_WORKING">Special Working Day</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addHoliday}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: '#fa5e01' }}
            >
              {saving ? 'Saving…' : 'Add Holiday'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-5 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100"
              style={{ color: '#64748b', border: '1.5px solid rgba(10,53,59,0.12)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Calendar Card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#fff', border: '1px solid rgba(10,53,59,0.1)', boxShadow: '0 2px 12px rgba(10,53,59,0.06)' }}
      >
        {/* Month Navigation */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ background: '#227f84' }}
        >
          <button
            onClick={prevMonth}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <p className="text-white font-bold text-lg tracking-wide">
              {MONTH_NAMES[month]}
            </p>
            <p className="text-white/50 text-xs font-medium">{year}</p>
          </div>

          <button
            onClick={nextMonth}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b" style={{ borderColor: 'rgba(10,53,59,0.08)' }}>
          {DAY_HEADERS.map(d => (
            <div
              key={d}
              className="py-3 text-center text-xs font-bold tracking-wide"
              style={{ color: d === 'Sun' ? '#ef4444' : '#94a3b8' }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day Cells */}
        <div className="grid grid-cols-7">
          {Array.from({ length: totalCells }, (_, i) => {
            const day = i - firstDOW + 1
            const isValid = day >= 1 && day <= daysInMonth
            const holiday = isValid ? holidayMap[day] : undefined
            const cfg = holiday ? TYPE_CONFIG[holiday.type] : null
            const isSun = i % 7 === 0
            const isTodayCell = isValid && isToday(day)

            if (!isValid) {
              return (
                <div
                  key={`empty-${i}`}
                  style={{
                    minHeight: 88,
                    background: 'rgba(10,53,59,0.015)',
                    borderTop: '1px solid rgba(10,53,59,0.05)',
                    borderLeft: i % 7 !== 0 ? '1px solid rgba(10,53,59,0.05)' : undefined,
                  }}
                />
              )
            }

            return (
              <div
                key={day}
                className="relative group flex flex-col p-2 gap-1"
                style={{
                  minHeight: 88,
                  background: cfg ? cfg.bg : isSun ? 'rgba(239,68,68,0.025)' : '#fff',
                  borderTop: '1px solid rgba(10,53,59,0.05)',
                  borderLeft: i % 7 !== 0 ? '1px solid rgba(10,53,59,0.05)' : undefined,
                  transition: 'background 0.15s',
                }}
              >
                {/* Day number */}
                <span
                  className="w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold self-start"
                  style={{
                    background: isTodayCell ? '#fa5e01' : 'transparent',
                    color: isTodayCell ? '#fff' : cfg ? cfg.text : isSun ? '#ef4444' : '#374151',
                    fontWeight: isTodayCell ? 700 : 500,
                    boxShadow: isTodayCell ? '0 2px 6px rgba(250,94,1,0.35)' : 'none',
                  }}
                >
                  {day}
                </span>

                {/* Holiday pill */}
                {holiday && cfg && (
                  <div
                    className="rounded-lg px-2 py-1 flex items-start gap-1"
                    style={{ background: cfg.border }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
                      style={{ background: cfg.dot }}
                    />
                    <span
                      className="text-xs font-semibold leading-snug"
                      style={{ color: cfg.text, wordBreak: 'break-word' }}
                    >
                      {holiday.name}
                    </span>
                  </div>
                )}

                {/* Delete on hover */}
                {holiday && (
                  <button
                    onClick={() => deleteHoliday(holiday.id, holiday.name)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(239,68,68,0.12)' }}
                    title="Remove holiday"
                  >
                    <Trash2 className="w-3 h-3" style={{ color: '#ef4444' }} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
          <span
            key={key}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
            {cfg.label}
          </span>
        ))}
      </div>

      {loading && (
        <p className="text-xs text-center text-slate-400 pb-2">Loading holidays…</p>
      )}
    </div>
  )
}
