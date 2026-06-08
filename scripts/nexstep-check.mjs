import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const company = await prisma.company.findFirst({
  where: { name: { contains: 'nextstep', mode: 'insensitive' } },
  select: { id: true, name: true, email: true, _count: { select: { employees: true } } },
})

if (!company) {
  console.log('No company matching "nexstep" found. Looking for similar names...')
  const candidates = await prisma.company.findMany({
    where: { OR: [
      { name: { contains: 'next', mode: 'insensitive' } },
      { name: { contains: 'step', mode: 'insensitive' } },
      { name: { contains: 'va', mode: 'insensitive' } },
    ]},
    select: { id: true, name: true },
    take: 15,
  })
  console.log('Candidates:', JSON.stringify(candidates, null, 2))
  process.exit(0)
}

console.log('=== Company ===')
console.log(JSON.stringify(company, null, 2))

const employees = await prisma.employee.findMany({
  where: { companyId: company.id, isActive: true },
  select: {
    id: true, employeeNo: true, firstName: true, lastName: true, workScheduleId: true,
    workSchedule: { select: { id: true, name: true, timeIn: true, timeOut: true, workDays: true, scheduleType: true } },
  },
  take: 30,
})
const fullName = (e) => `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim()
console.log(`\n=== Active employees (${employees.length}, first 30) ===`)
for (const e of employees) {
  const ws = e.workSchedule
  const schedDesc = ws ? `${ws.name} [${ws.scheduleType ?? 'FIXED'}] ${ws.timeIn ?? '?'}→${ws.timeOut ?? '?'}` : '— no schedule'
  console.log(`  ${(e.employeeNo ?? '—').padEnd(8)} ${fullName(e).padEnd(28)} ${schedDesc}`)
}

const fourteenDaysAgo = new Date()
fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
const empIds = employees.map(e => e.id)

// === Shift assignments ===
let assignments = []
try {
  assignments = await prisma.employeeShiftAssignment.findMany({
    where: { employeeId: { in: empIds }, date: { gte: fourteenDaysAgo } },
    select: { employeeId: true, date: true, timeIn: true, timeOut: true, isRestDay: true, scheduleId: true },
    orderBy: [{ date: 'desc' }],
  })
} catch (e) { console.log('shift assignment query error:', e.message) }

console.log(`\n=== Shift assignments (past 14d): ${assignments.length} ===`)

// Double shifts (>1 assignment for same employee+date)
const byEmpDate = {}
for (const a of assignments) {
  const k = `${a.employeeId}|${a.date.toISOString().slice(0,10)}`
  ;(byEmpDate[k] ||= []).push(a)
}
const doubles = Object.entries(byEmpDate).filter(([,arr]) => arr.length > 1)
console.log(`Days with >1 shift assignment: ${doubles.length}`)
if (doubles.length) {
  console.log('Sample double-shift days:')
  for (const [k, arr] of doubles.slice(0, 5)) {
    const emp = employees.find(e => e.id === k.split('|')[0])
    console.log(`  ${fullName(emp ?? {})}  ${k.split('|')[1]}:`)
    for (const a of arr) console.log(`     ${a.timeIn ?? '—'} → ${a.timeOut ?? '—'}`)
  }
}

// Overnight shifts
const overnight = assignments.filter(a => a.timeIn && a.timeOut && a.timeIn > a.timeOut)
console.log(`\nOvernight shift assignments (timeIn > timeOut): ${overnight.length}`)
if (overnight.length) {
  console.log('Sample:')
  for (const a of overnight.slice(0, 8)) {
    const emp = employees.find(e => e.id === a.employeeId)
    console.log(`  ${fullName(emp ?? {}).padEnd(28)} ${a.date.toISOString().slice(0,10)}  ${a.timeIn} → ${a.timeOut}`)
  }
}

// === DTR records ===
const dtrs = await prisma.dTRRecord.findMany({
  where: { employeeId: { in: empIds }, date: { gte: fourteenDaysAgo } },
  select: { employeeId: true, date: true, timeIn: true, timeOut: true,
    regularHours: true, overtimeHours: true, nightDiffHours: true, lateMinutes: true },
  orderBy: [{ date: 'desc' }, { timeIn: 'asc' }],
})
console.log(`\n=== DTR records (past 14d): ${dtrs.length} ===`)

const dtrByEmpDate = {}
for (const d of dtrs) {
  const k = `${d.employeeId}|${d.date.toISOString().slice(0,10)}`
  ;(dtrByEmpDate[k] ||= []).push(d)
}
const dtrDoubles = Object.entries(dtrByEmpDate).filter(([,arr]) => arr.length > 1)
console.log(`Dates with >1 DTR record (multi-shift logged): ${dtrDoubles.length}`)
if (dtrDoubles.length) {
  console.log('Sample:')
  for (const [k, arr] of dtrDoubles.slice(0, 5)) {
    const emp = employees.find(e => e.id === k.split('|')[0])
    console.log(`  ${fullName(emp ?? {})}  ${k.split('|')[1]}:`)
    for (const d of arr) {
      console.log(`     in=${d.timeIn?.toISOString() ?? '—'}  out=${d.timeOut?.toISOString() ?? '—'}  reg=${d.regularHours}  OT=${d.overtimeHours}  ND=${d.nightDiffHours}`)
    }
  }
}

// DTRs where timeIn is after timeOut on UTC clock = crossed midnight
const overnightDtrs = dtrs.filter(d => d.timeIn && d.timeOut && d.timeIn > d.timeOut)
console.log(`\nDTRs with timeIn > timeOut on UTC clock (crossed midnight): ${overnightDtrs.length}`)
if (overnightDtrs.length) {
  console.log('Sample:')
  for (const d of overnightDtrs.slice(0, 5)) {
    const emp = employees.find(e => e.id === d.employeeId)
    console.log(`  ${fullName(emp ?? {}).padEnd(28)} dtr.date=${d.date.toISOString().slice(0,10)}  in=${d.timeIn.toISOString()}  out=${d.timeOut.toISOString()}  reg=${d.regularHours} OT=${d.overtimeHours} ND=${d.nightDiffHours}`)
  }
}

// Open (un-clocked-out) DTRs older than 1 day = stuck shifts
const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
const stuck = dtrs.filter(d => d.timeIn && !d.timeOut && d.timeIn < yesterday)
console.log(`\nStuck open DTRs (clock-in but no clock-out, >24h old): ${stuck.length}`)
if (stuck.length) {
  for (const d of stuck.slice(0, 5)) {
    const emp = employees.find(e => e.id === d.employeeId)
    console.log(`  ${fullName(emp ?? {}).padEnd(28)} dtr.date=${d.date.toISOString().slice(0,10)}  in=${d.timeIn.toISOString()}`)
  }
}

await prisma.$disconnect()
