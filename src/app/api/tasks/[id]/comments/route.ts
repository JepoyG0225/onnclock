/**
 * GET  /api/tasks/[id]/comments
 * POST /api/tasks/[id]/comments — comment and notify the task's assignees
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { guardTask } from '@/lib/tasks/guard'
import { taskKey } from '@/lib/tasks/access'
import { logTaskActivity, notifyTaskCommented, notifyTaskMentions } from '@/lib/tasks/activity'
import { mentionedUserIds, stripMentionMarkup } from '@/lib/tasks/mentions'

const createSchema = z.object({
  body: z.string().trim().min(1).max(5000),
})

async function withNames(comments: Array<{ userId: string }>) {
  const ids = Array.from(new Set(comments.map(c => c.userId)))
  if (ids.length === 0) return new Map<string, string>()
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  })
  return new Map(users.map(u => [u.id, u.name || u.email || 'Unknown user']))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await guardTask(req, id, 'view')
  if (!guard.ok) return guard.response

  const comments = await prisma.taskComment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: 'asc' },
  })
  const names = await withNames(comments)

  return NextResponse.json({
    comments: comments.map(c => ({ ...c, authorName: names.get(c.userId) ?? 'Unknown user' })),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Anyone who can see the task may comment on it — commenting is how you
  // participate without owning the work.
  const guard = await guardTask(req, id, 'view')
  if (!guard.ok) return guard.response

  const payload = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const body = parsed.data.body
  const comment = await prisma.taskComment.create({
    data: { taskId: id, userId: guard.ctx.userId, body },
  })

  const task = await prisma.task.findUnique({
    where: { id },
    select: { title: true, number: true },
  })

  await logTaskActivity({ taskId: id, userId: guard.ctx.userId, action: 'commented' })

  if (task) {
    const actor = await prisma.user.findUnique({
      where: { id: guard.ctx.userId },
      select: { name: true, email: true },
    })
    const actorName = actor?.name || actor?.email || 'Someone'
    const key = taskKey(task.number)

    // Mentions first, so anyone explicitly named gets the more specific
    // "mentioned you" notification rather than the generic comment one.
    const mentioned = await notifyTaskMentions({
      companyId: guard.companyId,
      taskId: id,
      userIds: mentionedUserIds(body),
      actorUserId: guard.ctx.userId,
      actorName,
      taskKey: key,
      taskTitle: task.title,
      excerpt: stripMentionMarkup(body),
    })

    if (mentioned.length > 0) {
      await prisma.taskComment
        .update({ where: { id: comment.id }, data: { mentions: mentioned } })
        .catch(() => {})
    }

    await notifyTaskCommented({
      companyId: guard.companyId,
      taskId: id,
      actorUserId: guard.ctx.userId,
      actorName,
      taskKey: key,
      taskTitle: task.title,
      // Assignees already pinged by the mention pass shouldn't get a second
      // notification for the same comment.
      skipUserIds: mentioned,
    })
  }

  const names = await withNames([comment])
  return NextResponse.json(
    { comment: { ...comment, authorName: names.get(comment.userId) ?? 'Unknown user' } },
    { status: 201 },
  )
}
