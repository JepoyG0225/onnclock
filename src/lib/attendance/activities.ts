import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { type AuthContext } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'

export async function activityScope(ctx: AuthContext, adminOnly = false): Promise<Prisma.EmployeeWhereInput> {
  if (ctx.role !== 'EMPLOYEE' && await ctxHasPermission(ctx, 'dtr:read')) {
    if (ctx.role === 'DEPARTMENT_HEAD' && !ctx.managedDepartmentId) throw new Error('No managed department is assigned.')
    return { companyId: ctx.companyId, ...(ctx.managedDepartmentId ? { departmentId: ctx.managedDepartmentId } : {}) }
  }
  if (adminOnly) throw new Error('Attendance report access is required.')
  return { companyId: ctx.companyId, userId: ctx.userId }
}
export function monthRange(month: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.')
  const [year, m] = month.split('-').map(Number)
  return { gte: new Date(Date.UTC(year, m - 1, 1)), lt: new Date(Date.UTC(year, m, 1)) }
}
export function decodeActivityPhoto(photo: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo)
  if (!match || photo.length > 2_000_000) throw new Error('Use a JPEG, PNG or WebP photo below 1.5 MB.')
  const bytes = Buffer.from(match[2], 'base64')
  const mime = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg'
    : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' ? 'webp' : null
  if (bytes.length < 12 || mime !== match[1]) throw new Error('Invalid image content.')
  return { bytes, mime: `image/${mime}` }
}
export const activitySelect = { photoCount: true, latitude: true, longitude: true, locationAccuracy: true, locationCapturedAt: true, id: true, notes: true, description: true, loggedAt: true, dtrRecordId: true } as const
export async function normalizeActivityPhoto(photo: string) {
  const { bytes } = decodeActivityPhoto(photo)
  const sharp = (await import('sharp')).default
  const encoded = await sharp(bytes, { limitInputPixels: 25_000_000 }).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
  if (encoded.length > 1_500_000) throw new Error('Photo is too large.')
  return `data:image/jpeg;base64,${encoded.toString('base64')}`
}
export async function listActivities(where: Prisma.AttendanceActivityWhereInput, take = 200) {
  // Select only a photo-presence flag, never the photo bytes in list/report responses.
  const rows = await prisma.attendanceActivity.findMany({ where, select: activitySelect, orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }], take })
  const withPhotos = rows.length ? await prisma.attendanceActivity.findMany({ where: { id: { in: rows.map(r => r.id) }, photo: { not: null } }, select: { id: true } }) : []
  const ids = new Set(withPhotos.map(r => r.id))
  return rows.map(r => ({ ...r, photoUrl: ids.has(r.id) ? `/api/attendance/activities/${r.id}/photo` : null, photoUrls: Array.from({ length: r.photoCount || (ids.has(r.id) ? 1 : 0) }, (_, index) => `/api/attendance/activities/${r.id}/photo?index=${index}`) }))
}

/** Validate calendar dates before constructing Philippine-day or shift-date boundaries. */
export function reportDayRange(day: string, philippineTime = false) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(day)) throw new Error('Choose a valid report date.')
  const utc = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== day) throw new Error('Choose a valid report date.')
  const gte = new Date(utc.getTime() - (philippineTime ? 8 * 3600000 : 0))
  return { gte, lt: new Date(gte.getTime() + 86400000) }
}

/** Rank across every shift for each employee's Philippine calendar day. */
export async function numberActivities<T extends { id: string; loggedAt: Date; dtrRecordId: string }>(activities: T[], scope: Prisma.EmployeeWhereInput) {
  const sources = await prisma.dTRRecord.findMany({ where: { id: { in: [...new Set(activities.map(a => a.dtrRecordId))] }, employee: scope }, select: { id: true, employeeId: true } })
  const employees = new Map(sources.map(r => [r.id, r.employeeId]))
  const days = new Map<string, Map<string, number>>()
  const result = []
  for (const activity of activities) {
    const employeeId = employees.get(activity.dtrRecordId)
    if (!employeeId) continue
    const day = new Date(activity.loggedAt.getTime() + 8 * 3600000).toISOString().slice(0, 10)
    const key = `${employeeId}:${day}`
    if (!days.has(key)) {
      const rows = await prisma.attendanceActivity.findMany({ where: { dtrRecord: { employee: scope, employeeId }, loggedAt: reportDayRange(day, true) }, select: { id: true }, orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }] })
      days.set(key, new Map(rows.map((row, index) => [row.id, index + 1])))
    }
    result.push({ ...activity, dailyNumber: days.get(key)!.get(activity.id)! })
  }
  return result
}
