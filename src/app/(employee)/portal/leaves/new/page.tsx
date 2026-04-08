'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, differenceInCalendarDays, parseISO, isWeekend } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { DatePicker } from '@/components/ui/date-picker'

const schema = z.object({
  leaveTypeId: z.string().min(1, 'Please select a leave type'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().min(3, 'Please provide a reason'),
})

type FormData = z.infer<typeof schema>

interface LeaveType {
  id: string
  name: string
  code: string
  isWithPay: boolean
  requiresDocuments: boolean
  genderRestriction: string | null
}

interface LeaveBalance {
  leaveTypeId: string
  balance: number
}

function workingDays(start: string, end: string) {
  const s = parseISO(start)
  const e = parseISO(end)
  let count = 0
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (!isWeekend(d)) count++
  }
  return count
}

export default function NewLeavePage() {
  const router = useRouter()
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    },
  })

  const startDate = watch('startDate')
  const endDate = watch('endDate')
  const leaveTypeId = watch('leaveTypeId')

  const days = startDate && endDate ? workingDays(startDate, endDate) : 0
  const selectedBalance = balances.find(b => b.leaveTypeId === leaveTypeId)

  function addWorkingDays(start: string, daysToAdd: number) {
    let d = parseISO(start)
    let added = 0
    while (added < daysToAdd) {
      d.setDate(d.getDate() + 1)
      if (!isWeekend(d)) added++
    }
    return d
  }

  const maxDays = selectedBalance ? Math.max(0, Math.floor(Number(selectedBalance.balance) || 0)) : null
  const maxEndDate = startDate && maxDays !== null
    ? format(addWorkingDays(startDate, Math.max(0, maxDays - 1)), 'yyyy-MM-dd')
    : undefined

  useEffect(() => {
    if (!startDate || maxDays === null || maxDays <= 0) return
    if (!endDate) return
    const maxDate = maxEndDate ? parseISO(maxEndDate) : null
    if (maxDate && parseISO(endDate) > maxDate && maxEndDate) {
      setValue('endDate', maxEndDate)
    }
  }, [startDate, endDate, maxDays, maxEndDate, setValue])

  useEffect(() => {
    async function load() {
      const [typesRes, balRes] = await Promise.all([
        fetch('/api/leaves/types'),
        fetch('/api/leaves?own=true&limit=1'),
      ])
      const typesData = await typesRes.json()
      const balData = await balRes.json()
      setLeaveTypes(typesData.types ?? [])
      setBalances((balData.balances ?? []).map((b: { leaveTypeId: string; balance?: number; entitled?: number; used?: number; pending?: number; carriedOver?: number }) => {
        const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
        const computed = n(b.entitled) + n(b.carriedOver) - n(b.used) - n(b.pending)
        const balance = Number.isFinite(Number(b.balance)) ? Number(b.balance) : computed
        return {
          leaveTypeId: b.leaveTypeId,
          balance,
        }
      }))
    }
    load()
  }, [])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, totalDays: days }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to file leave')
      toast.success('Leave request filed successfully!')
      router.push('/portal/leaves')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to file leave')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/portal/leaves" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">File a Leave</h1>
          <p className="text-gray-500 text-sm">Submit a leave request for approval</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Leave Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Leave Type</label>
          <select
            {...register('leaveTypeId')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#227f84]"
          >
            <option value="">Select leave type...</option>
            {leaveTypes.map(lt => (
              <option key={lt.id} value={lt.id}>
                {lt.code} - {lt.name} {!lt.isWithPay ? '(Unpaid)' : ''}
              </option>
            ))}
          </select>
          {errors.leaveTypeId && <p className="text-red-500 text-xs mt-1">{errors.leaveTypeId.message}</p>}
          {selectedBalance !== undefined && (
            <p className={`text-xs mt-1 ${selectedBalance.balance <= 0 ? 'text-red-500' : 'text-gray-500'}`}>
              Available balance: <strong>{selectedBalance.balance.toFixed(1)} day(s)</strong>
            </p>
          )}
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
            <DatePicker
              value={startDate}
              onChange={(v) => setValue('startDate', v)}
              className="w-full"
            />
            <input type="hidden" {...register('startDate')} value={startDate} />
            {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">End Date</label>
            <DatePicker
              value={endDate}
              onChange={(v) => setValue('endDate', v)}
              min={startDate}
              max={maxEndDate}
              className="w-full"
            />
            <input type="hidden" {...register('endDate')} value={endDate} />
            {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>}
            {maxDays !== null && maxDays <= 0 && (
              <p className="text-xs text-amber-600 mt-1">No available balance for this leave type.</p>
            )}
          </div>
        </div>

        {/* Days Preview */}
        {days > 0 && (
          <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(34,127,132,0.10)', border: '1px solid rgba(34,127,132,0.25)', color: '#227f84' }}>
            <strong>{days} working day{days !== 1 ? 's' : ''}</strong> from {format(parseISO(startDate), 'MMM d')} to {format(parseISO(endDate), 'MMM d, yyyy')}
            {selectedBalance !== undefined && selectedBalance.balance < days && (
              <p className="text-red-600 mt-1"> Insufficient balance. You have {selectedBalance.balance.toFixed(1)} day(s) available.</p>
            )}
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason</label>
          <textarea
            {...register('reason')}
            rows={3}
            placeholder="Please state your reason for filing this leave..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#227f84] resize-none"
          />
          {errors.reason && <p className="text-red-500 text-xs mt-1">{errors.reason.message}</p>}
        </div>

        <div className="flex gap-3 pt-2">
          <Link
            href="/portal/leaves"
            className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium text-center hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors" style={{ background: '#227f84' }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit Request
          </button>
        </div>
      </form>
    </div>
  )
}
