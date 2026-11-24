import { prisma } from '@/lib/prisma'
import { taskKey } from './access'

/** Date inputs on tasks are calendar dates stored at midnight UTC. */
export function reminderKind(date: Date | null, today: string): 'today' | 'tomorrow' | null {
  if (!date) return null
  const key = date.toISOString().slice(0, 10)
  if (key === today) return 'today'
  const tomorrow = new Date(`${today}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return key === tomorrow.toISOString().slice(0, 10) ? 'tomorrow' : null
}

// Unique notification ids make cron retries and concurrent edits idempotent.
export async function sendTaskReminders(companyId: string, taskId?: string, now = new Date()) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } })
  if (!company) return 0
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: company.timezone || 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const end = new Date(`${today}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 2)
  const tasks = await prisma.task.findMany({
    where: { companyId, ...(taskId ? { id: taskId } : {}), completedAt: null,
      status: { category: { not: 'DONE' } },
      OR: [
        { dueDate: { gte: new Date(`${today}T00:00:00Z`), lt: end } },
        { startDate: { gte: new Date(`${today}T00:00:00Z`), lt: end } },
      ],
    },
    select: { id: true, title: true, number: true, dueDate: true, startDate: true,
      assignees: { select: { employee: { select: { userId: true, isActive: true } } } },
    },
  })
  let count = 0
  for (const task of tasks) {
    const users = [...new Set(task.assignees.filter(a => a.employee.isActive).map(a => a.employee.userId).filter((id): id is string => !!id))]
    for (const [event, date] of [['due', task.dueDate], ['starts', task.startDate]] as const) {
      const kind = reminderKind(date, today)
      if (!kind || !date) continue
      const result = await prisma.notification.createMany({
        skipDuplicates: true,
        data: users.map(userId => ({
          id: `task-reminder:${task.id}:${userId}:${event}:${date.toISOString().slice(0, 10)}:${kind}`,
          companyId, userId, type: 'TASK_DUE_SOON' as const,
          title: `${taskKey(task.number)} ${event} ${kind}`, body: task.title,
          link: `/tasks?task=${task.id}`,
        })),
      })
      count += result.count
    }
  }
  return count
}
