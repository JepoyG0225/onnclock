/**
 * Time logged against a task. This is the bridge between Project Management
 * and the payroll side of the app — logged hours priced at the employee's
 * effective rate is what gives a project a real labour cost.
 *
 * GET    /api/tasks/[id]/time-logs
 * POST   /api/tasks/[id]/time-logs
 * DELETE /api/tasks/[id]/time-logs?logId=…
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { guardTask } from '@/lib/tasks/guard'
import { logTaskActivity } from '@/lib/tasks/activity'
import { EMPLOYEE_BRIEF_SELECT } from '@/lib/tasks/select'

const createSchema = z.object({
  /** Defaults to the caller's own employee record when omitted. */
  employeeId: z.string().optional(),
  date: z.string(),
  hours: z.coerce.number().positive().max(24),
  note: z.string().trim().max(500).optional().nullable(),
  billable: z.boolean().optional(),
})


async function listLogs(taskId: string) {
  const logs = await prisma.taskTimeLog.findMany({
    where: { taskId },
    orderBy: { date: 'desc' },
    include: { employee: { select: EMPLOYEE_BRIEF_SELECT } },
  })
  return logs.map(l => ({ ...l, hours: Number(l.hours) }))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTask(req, id, 'view')
  if (!g.ok) return g.response
  return NextResponse.json({ timeLogs: await listLogs(id) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTask(req, id, 'edit')
  if (!g.ok) return g.response
  const guard = g

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const d = parsed.data

  // Logging time for somebody else is a manager action; everyone else may
  // only log their own hours.
  const targetEmployeeId = d.employeeId ?? guard.actor.employeeId
  if (!targetEmployeeId) {
    return NextResponse.json({ error: 'No employee record linked to your account' }, { status: 400 })
  }
  if (targetEmployeeId !== guard.actor.employeeId && !guard.actor.canManage) {
    return NextResponse.json({ error: 'Only managers can log time for other people' }, { status: 403 })
  }

  const employee = await prisma.employee.findFirst({
    where: { id: targetEmployeeId, companyId: guard.companyId },
    select: { id: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 400 })

  await prisma.taskTimeLog.create({
    data: {
      taskId: id,
      employeeId: employee.id,
      date: new Date(d.date),
      hours: d.hours,
      note: d.note ?? null,
      billable: d.billable ?? true,
      createdByUserId: guard.ctx.userId,
    },
  })

  await logTaskActivity({
    taskId: id,
    userId: guard.ctx.userId,
    action: 'time_logged',
    meta: { hours: d.hours, employeeId: employee.id },
  })

  return NextResponse.json({ timeLogs: await listLogs(id) }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTask(req, id, 'edit')
  if (!g.ok) return g.response
  const guard = g

  const logId = req.nextUrl.searchParams.get('logId')
  if (!logId) return NextResponse.json({ error: 'logId is required' }, { status: 400 })

  const log = await prisma.taskTimeLog.findFirst({
    where: { id: logId, taskId: id },
    select: { id: true, employeeId: true },
  })
  if (!log) return NextResponse.json({ error: 'Time log not found' }, { status: 404 })

  if (log.employeeId !== guard.actor.employeeId && !guard.actor.canManage) {
    return NextResponse.json({ error: 'You can only remove your own time entries' }, { status: 403 })
  }

  await prisma.taskTimeLog.delete({ where: { id: logId } })
  return NextResponse.json({ timeLogs: await listLogs(id) })
}
