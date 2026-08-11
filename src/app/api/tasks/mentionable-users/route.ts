/**
 * GET /api/tasks/mentionable-users?q=… — users who can be @mentioned.
 *
 * Scoped to the whole company: the requirement is to be able to mention ANY
 * user, e.g. pulling in Finance on a task they aren't assigned to. Mentioning
 * grants no extra access — the notification links to the task, and the normal
 * task guard still decides whether that person can open it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guardTasks } from '@/lib/tasks/guard'

export async function GET(req: NextRequest) {
  const guard = await guardTasks(req)
  if (!guard.ok) return guard.response

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''

  const links = await prisma.userCompany.findMany({
    where: {
      companyId: guard.companyId,
      user: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    },
    select: {
      role: true,
      user: { select: { id: true, name: true, email: true } },
    },
    take: 25,
  })

  // Attach the employee record where one exists, so the picker can show a
  // job title and the same initials the board uses.
  const userIds = links.map(l => l.user.id)
  const employees = userIds.length
    ? await prisma.employee.findMany({
        where: { companyId: guard.companyId, userId: { in: userIds } },
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          employeeNo: true,
          position: { select: { title: true } },
        },
      })
    : []
  const empByUser = new Map(employees.map(e => [e.userId, e]))

  const users = links
    .map(l => {
      const emp = empByUser.get(l.user.id)
      return {
        userId: l.user.id,
        name: emp ? `${emp.firstName} ${emp.lastName}` : l.user.name || l.user.email,
        email: l.user.email,
        role: l.role,
        employeeNo: emp?.employeeNo ?? null,
        position: emp?.position?.title ?? null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ users })
}
