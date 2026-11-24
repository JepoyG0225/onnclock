import { zonedDate, zonedParts, zonedInstant, scheduleInstants, timezone } from './timezone'
import { prisma } from '@/lib/prisma'
import { getManilaDateOnly } from '@/lib/date-manila'
import { effectiveGeofence, type EffectiveGeofence } from './location-policy'

function minutes(value: string | null | undefined) {
  if (!value) return null
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

export function manilaMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  return Number(parts.find(p => p.type === 'hour')?.value) * 60 + Number(parts.find(p => p.type === 'minute')?.value)
}

export function chooseAssignment<T extends { timeIn: string | null; date?: Date; schedule: { timeIn: string | null; timezone?: string } | null }>(assignments: T[], actual: Date | null, fallbackZone = 'Asia/Manila'): T | undefined {
  if (!actual) return assignments[0]
  const now = manilaMinutes(actual)
  return [...assignments].sort((a, b) => {
    const distance = (v: T) => {
      const start = minutes(v.timeIn ?? v.schedule?.timeIn)
      if (start == null) return Infinity
      if(v.date)return Math.abs(actual.getTime()-zonedInstant(v.date,v.timeIn??v.schedule!.timeIn!,timezone(v.schedule?.timezone??fallbackZone)).getTime())
      const diff = Math.abs(start - zonedParts(actual, timezone(v.schedule?.timezone??fallbackZone)).minutes)
      return Math.min(diff, 1440 - diff)
    }
    return distance(a) - distance(b)
  })[0]
}

export async function resolveAttendanceLocation(companyId: string, employeeId: string, actual = new Date(), date?: Date) {
  const employee = await prisma.employee.findFirstOrThrow({
    where: { id: employeeId, companyId }, include: { workSchedule: true, company: true },
  })
  const fallbackZone=timezone(employee.workSchedule?.timezone)
  let day = date ?? zonedDate(actual,fallbackZone)
  const nearby=await prisma.employeeShiftAssignment.findMany({where:{companyId,employeeId,date:date?date:{gte:new Date(day.getTime()-2*86400000),lte:new Date(day.getTime()+2*86400000)},isRestDay:false},include:{schedule:true},orderBy:{id:'asc'}})
  const candidates=nearby.filter(a=>{
    if(date)return true
    const local=zonedDate(actual,timezone(a.schedule?.timezone??fallbackZone))
    if(a.date.getTime()===local.getTime())return true
    const bounds=scheduleInstants(a.date,a.timeIn??a.schedule?.timeIn,a.timeOut??a.schedule?.timeOut,timezone(a.schedule?.timezone??fallbackZone))
    return !!bounds.scheduledStart&&!!bounds.scheduledEnd&&actual>=bounds.scheduledStart&&actual<=bounds.scheduledEnd
  })
  const assigned=[...candidates].sort((a,b)=>{
    const distance=(v:typeof a)=>{const bounds=scheduleInstants(v.date,v.timeIn??v.schedule?.timeIn,v.timeOut??v.schedule?.timeOut,timezone(v.schedule?.timezone??fallbackZone));return bounds.scheduledStart?Math.abs(actual.getTime()-bounds.scheduledStart.getTime()):Infinity}
    return distance(a)-distance(b)
  })[0]
  const schedule = assigned?.schedule ?? employee.workSchedule
  if(assigned)day=assigned.date
  else if(!date){
    const previous=new Date(day.getTime()-86400000)
    const bounds=scheduleInstants(previous,schedule?.timeIn,schedule?.timeOut,fallbackZone)
    if(bounds.scheduledStart&&bounds.scheduledEnd&&actual>=bounds.scheduledStart&&actual<=bounds.scheduledEnd)day=previous
  }
  return {
    date: day, schedule,
    shiftTimeIn: assigned?.timeIn ?? schedule?.timeIn ?? null,
    shiftTimeOut: assigned?.timeOut ?? schedule?.timeOut ?? null,
    policy: effectiveGeofence(schedule?.attendanceLocation, employee.geofenceExempt, employee.company),
  }
}

export function savedGeofence(raw: unknown): EffectiveGeofence | null {
  if (!raw || typeof raw !== 'object' || !('locations' in raw) || !('enabled' in raw)) return null
  return raw as EffectiveGeofence
}
