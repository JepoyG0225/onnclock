/**
 * Full re-sync of auto-OT requests for a company. Iterates every closed DTR
 * in the date range and creates/updates/deletes auto-OT requests so they
 * match each DTR's current overtimeHours. Mirrors the logic in
 * src/lib/overtime-requests.ts (syncAutoOvertimeRequest).
 *
 * Usage:
 *   node scripts/full-sync-auto-ot.mjs --company "Loyola" --days 30
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => {
    if (!a.startsWith('--')) return null
    const key = a.slice(2)
    const next = arr[i + 1]
    if (next && !next.startsWith('--')) return [key, next]
    return [key, true]
  }).filter(Boolean),
)
const COMPANY = args.company
const DAYS = parseInt(args.days || '30', 10)
const AUTO_OT_PREFIX = '[AUTO_OT]'

if (!COMPANY) { console.error('Usage: --company "Loyola" [--days N]'); process.exit(1) }

function formatManilaDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}
function formatManilaTime(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  return `${parts.find(p => p.type === 'hour')?.value ?? '00'}:${parts.find(p => p.type === 'minute')?.value ?? '00'}`
}
function buildAutoReason(hours) {
  return `${AUTO_OT_PREFIX} Auto-generated from attendance (${hours.toFixed(2)}h). Awaiting approval.`
}

async function syncOne({ companyId, employeeId, date, timeIn, timeOut, overtimeHours }) {
  const norm = Math.round(Math.max(0, Number(overtimeHours || 0)) * 100) / 100
  const dayStart = new Date(date); dayStart.setHours(0,0,0,0)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)

  const existing = await prisma.overtimeRequest.findFirst({
    where: { companyId, employeeId, date: { gte: dayStart, lt: dayEnd },
      reason: { startsWith: AUTO_OT_PREFIX } },
    orderBy: { createdAt: 'desc' },
  })

  if (!timeIn || !timeOut || norm <= 0) {
    if (existing?.status === 'PENDING') {
      await prisma.overtimeRequest.delete({ where: { id: existing.id } })
      return 'deleted'
    }
    return 'noop'
  }

  const startTime = formatManilaTime(timeIn)
  const endTime = formatManilaTime(timeOut)
  const reason = buildAutoReason(norm)
  const normalizedDate = new Date(formatManilaDateKey(date))

  if (existing) {
    if (existing.status === 'PENDING') {
      await prisma.overtimeRequest.update({
        where: { id: existing.id },
        data: { date: normalizedDate, startTime, endTime, hours: norm, reason },
      })
      return 'updated'
    }
    return 'noop'
  }

  await prisma.overtimeRequest.create({
    data: { companyId, employeeId, date: normalizedDate, startTime, endTime,
      hours: norm, reason, status: 'PENDING' },
  })
  return 'created'
}

const company = await prisma.company.findFirst({
  where: { name: { contains: COMPANY, mode: 'insensitive' } },
  select: { id: true, name: true },
})
if (!company) { console.error(`No company matching "${COMPANY}"`); process.exit(1) }
console.log(`\n=== ${company.name} — full auto-OT sync ===`)

const since = new Date(); since.setDate(since.getDate() - DAYS)
const dtrs = await prisma.dTRRecord.findMany({
  where: { employee: { companyId: company.id }, date: { gte: since },
    timeIn: { not: null }, timeOut: { not: null } },
  select: { employeeId: true, date: true, timeIn: true, timeOut: true, overtimeHours: true },
  orderBy: { date: 'desc' },
})
console.log(`Processing ${dtrs.length} closed DTRs...`)

const counts = { created: 0, updated: 0, deleted: 0, noop: 0 }
for (const d of dtrs) {
  const r = await syncOne({
    companyId: company.id,
    employeeId: d.employeeId,
    date: d.date,
    timeIn: d.timeIn,
    timeOut: d.timeOut,
    overtimeHours: Number(d.overtimeHours ?? 0),
  })
  counts[r]++
}
console.log(`✓ created=${counts.created} updated=${counts.updated} deleted=${counts.deleted} noop=${counts.noop}`)
await prisma.$disconnect()
