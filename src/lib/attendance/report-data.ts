import type { ActivityLocationData } from '@/components/attendance/ActivityLocation'
export type ReportEmployee = { id: string; firstName: string; lastName: string; employeeNo: string; department: { name: string } | null }
export type ReportActivity = ActivityLocationData & { id: string; dailyNumber: number; notes?: string | null; dtrRecordId: string; description: string; loggedAt: string; photoUrls?: string[]; photoUrl: string | null }
export type ReportRecord = { absentDays?: number; leaveDays?: number; derived?: boolean; id: string; employeeId: string; date: string; timeIn: string | null; timeOut: string | null; regularHours: number; overtimeHours: number; lateMinutes: number; undertimeMinutes: number; nightDiffHours: number; isAbsent: boolean; isLeave: boolean; isRestDay: boolean; isHoliday: boolean; approvedBy: string | null; activities: ReportActivity[] }
export type AttendanceReport = { companyName: string; month: string; reportDate?: string | null; rangeStart?: string | null; rangeEnd?: string | null; generatedAt: string; employees: ReportEmployee[]; records: ReportRecord[] }
export const reportTypes = { summary: 'Attendance summary', daily: 'Daily attendance', exceptions: 'Late and undertime', absence: 'Absences and approved leave', overtime: 'Recorded overtime', activities: 'Daily activity report' }
export type ReportType = keyof typeof reportTypes
export function summarize(records: ReportRecord[]) {
  return { present: new Set(records.filter(r => r.timeIn).map(r => r.date.slice(0, 10))).size,
    absent: sumDays(records, 'absent'),
    leave: sumDays(records, 'leave'),
    regular: records.reduce((sum, r) => sum + r.regularHours, 0), overtime: records.reduce((sum, r) => sum + r.overtimeHours, 0),
    late: records.reduce((sum, r) => sum + r.lateMinutes, 0), undertime: records.reduce((sum, r) => sum + r.undertimeMinutes, 0),
    activities: records.reduce((sum, r) => sum + r.activities.length, 0) }
}
export function csvCell(value: unknown) {
  const text = String(value ?? '')
  return '"' + (/^[\s]*[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"'
}

function sumDays(records:ReportRecord[],kind:'absent'|'leave') {
 const days=new Map<string,number>()
 for(const r of records){const value=kind==='absent'?(r.absentDays??(r.isAbsent?1:0)):(r.leaveDays??(r.isLeave?1:0));const key=r.date.slice(0,10);days.set(key,Math.max(days.get(key)??0,value))}
 return [...days.values()].reduce((a,b)=>a+b,0)
}
