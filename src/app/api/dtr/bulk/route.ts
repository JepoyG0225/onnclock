/**
 * POST /api/dtr/bulk — bulk-import manual DTR entries.
 *
 * Body: { rows: Array<{ employeeNo?, employeeId?, date, timeIn?, timeOut?,
 *         remarks?, isAbsent?, isRestDay?, isHoliday? }> }
 *
 * Each row is resolved to an employee (by employeeNo within the company, or by
 * employeeId), then run through the same upsert logic as a single manual entry
 * so hours/late/OT are computed identically. Rows are processed independently —
 * a bad row is reported but doesn't abort the rest.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, resolveCompanyIdForRequest } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { dtrSchema, upsertDtrRecord } from '@/lib/timesheet/dtr-upsert'
import { z } from 'zod'

const rowSchema = z.object({
  employeeNo: z.string().optional().nullable(),
  employeeId: z.string().optional().nullable(),
  date: z.string(),
  timeIn: z.string().optional().nullable(),
  timeOut: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  isAbsent: z.boolean().optional(),
  isRestDay: z.boolean().optional(),
  isHoliday: z.boolean().optional(),
})

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(5000),
})

/** Normalize "8:00" → "08:00"; return null for blank/invalid. */
function normTime(v: string | null | undefined): string | null {
  if (!v) return null
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Math.min(23, parseInt(m[1], 10))
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

/** Accept YYYY-MM-DD (also tolerate YYYY/MM/DD). Returns null if unparseable. */
function normDate(v: string): string | null {
  const s = String(v).trim().replace(/\//g, '-')
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  const companyId = resolveCompanyIdForRequest(ctx, req)
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  // Resolve employees by employeeNo / id once for the whole batch.
  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, employeeNo: true },
  })
  const byNo = new Map(employees.map(e => [String(e.employeeNo).trim().toLowerCase(), e.id]))
  const ids = new Set(employees.map(e => e.id))

  const results: Array<{ row: number; employee: string; status: 'imported' | 'error'; error?: string }> = []

  // Sequential to keep DB load predictable and preserve per-row error reporting.
  for (let i = 0; i < parsed.data.rows.length; i++) {
    const raw = parsed.data.rows[i]
    const label = raw.employeeNo || raw.employeeId || `row ${i + 1}`
    try {
      const employeeId = raw.employeeId && ids.has(raw.employeeId)
        ? raw.employeeId
        : raw.employeeNo
          ? byNo.get(raw.employeeNo.trim().toLowerCase())
          : undefined
      if (!employeeId) {
        results.push({ row: i + 1, employee: label, status: 'error', error: 'Employee not found (check employee no.)' })
        continue
      }

      const date = normDate(raw.date)
      if (!date) {
        results.push({ row: i + 1, employee: label, status: 'error', error: 'Invalid date (use YYYY-MM-DD)' })
        continue
      }

      const input = dtrSchema.parse({
        employeeId,
        date,
        timeIn: normTime(raw.timeIn),
        timeOut: normTime(raw.timeOut),
        isAbsent: !!raw.isAbsent,
        isRestDay: !!raw.isRestDay,
        isHoliday: !!raw.isHoliday,
        remarks: raw.remarks ?? null,
      })

      const record = await upsertDtrRecord(companyId, input)
      if (!record) {
        results.push({ row: i + 1, employee: label, status: 'error', error: 'Employee not in this company' })
        continue
      }
      results.push({ row: i + 1, employee: label, status: 'imported' })
    } catch (e) {
      results.push({ row: i + 1, employee: label, status: 'error', error: e instanceof Error ? e.message.slice(0, 160) : 'Failed' })
    }
  }

  const imported = results.filter(r => r.status === 'imported').length
  const failed = results.length - imported
  return NextResponse.json({ ok: true, total: results.length, imported, failed, results })
}
