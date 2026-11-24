import type { ScheduledPayDay } from './scheduled-hours'

export interface HourlyCalculationBasis {
  version: 1
  method: 'SCHEDULED_HOURLY'
  hourlyRate: number
  scheduledHours: number
  computedBasicPay: number
  days: Array<ScheduledPayDay & { amount: number }>
}

export function hourlyCalculationBasis(hourlyRate: number, days: ScheduledPayDay[]): HourlyCalculationBasis {
  let hours = 0
  let previous = 0
  const rows = days.map(day => {
    hours += day.hours
    const runningAmount = Number((hours * hourlyRate).toFixed(2))
    const amount = Number((runningAmount - previous).toFixed(2))
    previous = runningAmount
    return { ...day, amount }
  })
  return { version: 1, method: 'SCHEDULED_HOURLY', hourlyRate, scheduledHours: hours, computedBasicPay: previous, days: rows }
}

export function readHourlyCalculationBasis(value: unknown): HourlyCalculationBasis | null {
  if (!value || typeof value !== 'object') return null
  const v = value as HourlyCalculationBasis
  return v.version === 1 && v.method === 'SCHEDULED_HOURLY' && Number.isFinite(v.hourlyRate)
    && Number.isFinite(v.scheduledHours) && Number.isFinite(v.computedBasicPay) && Array.isArray(v.days)
    && v.days.every(d => typeof d.date === 'string' && Number.isFinite(d.hours) && Number.isFinite(d.amount)) ? v : null
}
