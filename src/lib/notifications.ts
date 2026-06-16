/**
 * In-app notification helpers. Any module that wants to fire a notification
 * imports `createNotification` and writes a row — the bell + dropdown UI
 * polls /api/notifications and renders the rest.
 *
 * Notifications are best-effort: failures do not throw, so the calling
 * route's main work isn't blocked if the notifications table is missing or
 * a write transiently fails.
 */
import { prisma } from '@/lib/prisma'
import type { NotificationType } from '@prisma/client'

export interface CreateNotificationInput {
  companyId: string
  userId: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      },
    })
  } catch (err) {
    console.error('[notifications] create failed', { type: input.type, userId: input.userId, err })
  }
}

/**
 * Batch helper — same payload to many users. Useful for announcements.
 * Fans out as one createMany call.
 */
export async function createNotificationsForUsers(
  userIds: string[],
  shared: Omit<CreateNotificationInput, 'userId'>,
): Promise<void> {
  if (userIds.length === 0) return
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        companyId: shared.companyId,
        userId,
        type: shared.type,
        title: shared.title,
        body: shared.body ?? null,
        link: shared.link ?? null,
      })),
    })
  } catch (err) {
    console.error('[notifications] createMany failed', { type: shared.type, count: userIds.length, err })
  }
}

/**
 * Resolve the userId of an Employee record's primary login user. Returns null
 * if the employee has no linked user yet (admin-created without portal access).
 */
export async function userIdForEmployee(employeeId: string): Promise<string | null> {
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { userId: true },
    })
    return emp?.userId ?? null
  } catch {
    return null
  }
}
