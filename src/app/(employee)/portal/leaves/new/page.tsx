'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { DatePicker } from '@/components/ui/date-picker'

const schema = z.object({
  leaveTypeId:   z.string().min(1, 'Please select a leave type'),
  startDate:     z.string().min(1, 'Start date is required'),
  endDate:       z.string().min(1, 'End date is required'),
  isHalfDay:     z.boolean().optional(),
  halfDayStart: z.string().optional(),
  halfDayEnd: z.string().optional(),
  halfDayPeriod: z.enum(['AM', 'PM']).optional(),
  reason:        z.string().min(3, 'Please provide a reason'),
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

export default function NewLeavePage() {
  const router = useRouter()
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [days,setDays]=useState(0)
  const [halfDayShifts,setHalfDayShifts]=useState<Array<{name:string;schedule:{timeIn:string|null;timeOut:string|null;breakMinutes:number;timezone:string};options:Array<{period:'AM'|'PM';start:string;end:string;label:string;workLabel:string;timezone:string}>}>>([])
  const [durationLoading,setDurationLoading]=useState(true)
  const [durationError,setDurationError]=useState('')

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      startDate:     format(new Date(), 'yyyy-MM-dd'),
      endDate:       format(new Date(), 'yyyy-MM-dd'),
      isHalfDay:     false,
      halfDayPeriod: 'AM',
    },
  })

  const startDate     = watch('startDate')
  const endDate       = watch('endDate')
  const leaveTypeId   = watch('leaveTypeId')
  const isHalfDay     = watch('isHalfDay') ?? false
  const halfDayPeriod = watch('halfDayPeriod') ?? 'AM'

  // Half-day only valid when start === end
  const isSameDay = startDate === endDate

  // When dates diverge, auto-clear half-day toggle
  useEffect(() => {
    if (!isSameDay && isHalfDay) setValue('isHalfDay', false)
  }, [isSameDay, isHalfDay, setValue])

  useEffect(()=>{
    let active=true;setDurationLoading(true);setDays(0);setHalfDayShifts([]);setDurationError('')
    const params=new URLSearchParams({duration:'true',startDate:startDate||'',endDate:endDate||'',isHalfDay:String(isHalfDay)})
    fetch('/api/leaves?'+params,{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to calculate leave days.');if(active){setDays(data.totalDays);setHalfDayShifts(data.halfDayShifts??[]);if(!data.totalDays)setDurationError('No scheduled working days in this date range. Choose a workday or contact HR.')}}).catch(e=>{if(active)setDurationError(e.message)}).finally(()=>{if(active)setDurationLoading(false)})
    return()=>{active=false}
  },[startDate,endDate,isHalfDay])
  useEffect(()=>{const option=halfDayShifts[0]?.options[0];setValue('halfDayStart',option?.start??'');setValue('halfDayEnd',option?.end??'')},[halfDayShifts,setValue])
  const selectedBalance = balances.find(b => b.leaveTypeId === leaveTypeId)

  const maxDays=selectedBalance?Math.max(0,Number(selectedBalance.balance)||0):null
  const leaveYear=startDate?.slice(0,4)||String(new Date().getFullYear())
  useEffect(() => {
    async function load() {
      const [typesRes, balRes] = await Promise.all([
        fetch('/api/leaves/types'),
        fetch('/api/leaves?own=true&limit=1&year='+leaveYear),
      ])
      const typesData = await typesRes.json()
      const balData = await balRes.json()
      setLeaveTypes(typesData.types ?? [])
      setBalances((balData.balances ?? []).map((b: { leaveTypeId: string; balance?: number; entitled?: number; used?: number; pending?: number; carriedOver?: number; encashed?: number }) => {
        const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
        const computed = n(b.entitled) + n(b.carriedOver) - n(b.used) - n(b.pending) - n(b.encashed)
        const balance = Number.isFinite(Number(b.balance)) ? Number(b.balance) : computed
        return { leaveTypeId: b.leaveTypeId, balance }
      }))
    }
    load().catch(()=>toast.error('Unable to load leave types and balances. Please refresh.'))
  }, [leaveYear])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const payload = {
        leaveTypeId:   data.leaveTypeId,
        startDate:     data.startDate,
        endDate:       data.isHalfDay ? data.startDate : data.endDate, // half-day: same day
        isHalfDay:     data.isHalfDay ?? false,
        halfDayPeriod: data.isHalfDay ? data.halfDayPeriod : undefined,
        halfDayStart:data.isHalfDay?data.halfDayStart:undefined,
        halfDayEnd:data.isHalfDay?data.halfDayEnd:undefined,

        reason:        data.reason,
      }
      const res = await fetch('/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    <div className="px-4 py-6 sm:p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/portal/leaves" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">File a Leave</h1>
          <p className="text-gray-500 text-sm">Submit a leave request for approval</p>
        </div>
      </div>

      {durationLoading?<p role="status" className="mb-3 text-sm text-slate-500">Checking scheduled leave days...</p>:durationError?<p role="alert" className="mb-3 text-sm text-red-600">{durationError}</p>:null}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Leave Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Leave Type</label>
          <select
            {...register('leaveTypeId')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
            <DatePicker
              value={startDate}
              onChange={(v) => {
                setValue('startDate', v)
                if (!isHalfDay && endDate < v) setValue('endDate', v)
              }}
              className="w-full"
            />
            <input type="hidden" {...register('startDate')} value={startDate} />
            {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">End Date</label>
            <DatePicker
              value={isHalfDay ? startDate : endDate}
              onChange={(v) => setValue('endDate', v)}
              min={startDate}

              disabled={isHalfDay}
              className={`w-full ${isHalfDay ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            <input type="hidden" {...register('endDate')} value={isHalfDay ? startDate : endDate} />
            {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>}
            {!isHalfDay && maxDays !== null && maxDays <= 0 && (
              <p className="text-xs text-amber-600 mt-1">No available balance for this leave type.</p>
            )}
          </div>
        </div>

        {/* Half-day toggle — only show when single day selected */}
        {isSameDay && (
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isHalfDay}
                onChange={e => setValue('isHalfDay', e.target.checked)}
                className="w-4 h-4 rounded accent-[#000000]"
              />
              <span className="text-sm font-medium text-gray-700">Half-day leave (0.5 day)</span>
            </label>
            {isHalfDay && (
              <div className="grid gap-2 pt-2 sm:grid-cols-2">
                {(['AM', 'PM'] as const).map(period => (
                  <button
                    key={period}
                    type="button"
                    aria-pressed={halfDayShifts[0]?.options.some(o=>o.period===period && o.start===watch('halfDayStart') && o.end===watch('halfDayEnd'))??false}
                    disabled={durationLoading}
                    onClick={() => {setValue('halfDayPeriod', period);const option=halfDayShifts[0]?.options.find(o=>o.period===period);if(option){setValue('halfDayStart',option.start);setValue('halfDayEnd',option.end)}}}
                    className={`min-w-0 px-4 py-3 text-left rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 ${
                      halfDayShifts[0]?.options.some(o=>o.period===period && o.start===watch('halfDayStart') && o.end===watch('halfDayEnd'))
                        ? 'bg-orange-50 text-[#162d54] border-[#ff5900]'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-[var(--brand-primary)]'
                    }`}
                  >
                    <span className="block text-xs text-slate-500">{period === 'AM' ? 'First half of shift' : 'Second half of shift'}</span>
                    {durationLoading ? <span className="mt-1 block">Loading shift hours...</span> : halfDayShifts.some(s => s.options.length) ? halfDayShifts.map((shift,index) => {
                      const option=shift.options.find(o=>o.period===period)
                      return option ? <span key={index} className="mt-2 block"><span className="block">{option.label}</span><span className="mt-1 block text-[11px] font-normal text-slate-500">{halfDayShifts.length>1?`${shift.name} / `:''}{option.timezone}<br />Working hours: {option.workLabel}</span></span> : null
                    }) : <span className="mt-1 block text-xs">{period === 'AM' ? 'Before noon' : 'From noon'} / schedule hours unavailable</span>}

                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isHalfDay && <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 space-y-3">
          <p className="text-sm font-medium text-[#162d54]">Custom leave hours</p>
          <p className="text-xs text-slate-500">Choose half of your scheduled working hours. The meal break is excluded. Times follow {halfDayShifts[0]?.schedule.timezone??'your schedule timezone'}.</p>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs">From<input type="time" required {...register('halfDayStart')} className="mt-1 block w-full min-w-0 rounded-xl border bg-white p-3" /></label><label className="text-xs">Until<input type="time" required {...register('halfDayEnd')} className="mt-1 block w-full min-w-0 rounded-xl border bg-white p-3" /></label></div>
          {halfDayShifts.length!==1 && !durationLoading && <p className="text-xs text-amber-700">Ask HR to confirm a single scheduled shift for this date before choosing custom hours.</p>}
          <p className="text-xs text-slate-500">For overnight shifts, an end time earlier on the clock refers to the next day.</p>
        </div>}

        {/* Days Preview */}
        {days > 0 && (
          <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(46,65,86,0.12)', border: '1px solid rgba(170,183,183,0.45)', color: 'var(--brand-primary)' }}>
            <strong>{days} working day{days !== 1 ? 's' : ''}</strong>
            {isHalfDay
              ? ` / ${watch('halfDayStart')??''} - ${watch('halfDayEnd')??''} on ${format(parseISO(startDate), 'MMM d, yyyy')}`
              : ` from ${format(parseISO(startDate), 'MMM d')} to ${format(parseISO(isHalfDay ? startDate : endDate), 'MMM d, yyyy')}`
            }
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] resize-none"
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
            disabled={loading || durationLoading || !!durationError || days <= 0 || (selectedBalance !== undefined && selectedBalance.balance < days)}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors" style={{ background: '#0054d7' }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit Request
          </button>
        </div>
      </form>
    </div>
  )
}
