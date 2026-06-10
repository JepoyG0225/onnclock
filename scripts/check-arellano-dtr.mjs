import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const emp = await prisma.employee.findFirst({
  where: { firstName: { contains: 'ALEXA', mode: 'insensitive' }, lastName: { contains: 'ARELLANO', mode: 'insensitive' } },
})
const dtrs = await prisma.dTRRecord.findMany({
  where: {
    employeeId: emp.id,
    date: { gte: new Date('2026-05-16'), lte: new Date('2026-05-31') },
  },
  orderBy: { date: 'asc' },
})
console.log('DTR rows:', dtrs.length)
for (const d of dtrs) {
  console.log(
    d.date.toISOString().slice(0,10),
    'in=', d.timeIn?.toISOString().slice(11,16) ?? '—',
    'out=', d.timeOut?.toISOString().slice(11,16) ?? '—',
    'reg=', d.regularHours?.toString() ?? '0',
    'ot=', d.overtimeHours?.toString() ?? '0',
    'late=', d.lateMinutes ?? 0,
    'ut=', d.undertimeMinutes ?? 0,
    'absent=', d.isAbsent,
    'leave=', d.isLeave, d.isLeavePaid ? '(paid)' : '',
    'source=', d.source,
    d.notes ? `note="${d.notes.slice(0,40)}"` : '',
  )
}
const workedDays = dtrs.filter(d => Number(d.regularHours ?? 0) > 0 && !d.isAbsent).length
const paidLeaveDays = dtrs.filter(d => d.isLeave && d.isLeavePaid).length
console.log('\nWorked days (regularHours>0, not absent):', workedDays)
console.log('Paid leave days:', paidLeaveDays)
console.log('Sum regularHours:', dtrs.reduce((s,d) => s + Number(d.regularHours ?? 0), 0))
process.exit(0)
