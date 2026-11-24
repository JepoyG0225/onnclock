import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { kioskAuth, kioskError, identifyKioskEmployee, kioskScanSchema, KIOSK_REPEAT_WINDOW_MS } from '@/lib/office-kiosk'
import { FACE_MODEL_ID } from '@/lib/face/face-api'
import { normalizeActivityPhoto } from '@/lib/attendance/activities'
import { performClockIn } from '@/lib/attendance/clock-in'
import { performBreak } from '@/lib/attendance/break'
import { kioskNextAction, resolveKioskShift } from '@/lib/attendance/kiosk-action'
import { performClockOut } from '@/lib/attendance/clock-out'

export const runtime = 'nodejs'
export async function POST(req: NextRequest) {
  const device = await kioskAuth(req)
  if (!device) return kioskError('Kiosk authorization expired or was revoked.', 401)
  const parsed = kioskScanSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return kioskError('Invalid scan. Start a new face scan.', 422)
  const body = parsed.data
  const attempt = await prisma.officeKioskAttempt.findFirst({ where: { id: body.challengeId, kioskId: device.id } })
  if (!attempt) return kioskError('Scan not found. Start again.', 404)
  if (attempt.state === 'SUCCEEDED') return NextResponse.json(attempt.result, { headers: { 'Cache-Control': 'no-store' } })
  if (attempt.state !== 'CHALLENGE' || attempt.expiresAt.getTime() <= Date.now()) return kioskError('This scan is expired or was already submitted. Check your attendance before starting another scan.', 409)
  const candidates = await prisma.employee.findMany({ where: { companyId: device.companyId, isActive: true, faceEmbeddingModel: FACE_MODEL_ID, faceConsentAt: { not: null }, userId: { not: null } }, select: { id: true, userId: true, faceEmbedding: true, firstName: true, lastName: true }, take: 5001 })
  if (candidates.length > 5000) return kioskError('This company roster exceeds the kiosk capacity. Contact support.', 422)
  const employee = identifyKioskEmployee(candidates, body.embeddings)
  if (!employee?.userId || (attempt.employeeId && attempt.employeeId !== employee.id)) {
    await prisma.officeKioskAttempt.updateMany({ where: { id: attempt.id, state: 'CHALLENGE' }, data: { state: 'REJECTED' } })
    return NextResponse.json({ code: 'FACE_NOT_RECOGNIZED', error: 'Face not recognized. Try again in good light, or register your face in My Profile > Portal Access.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }
  let photo: string
  try { photo = await normalizeActivityPhoto(body.photo) } catch { return kioskError('Could not read the captured photo. Scan again.', 422) }
  // Atomically consume the challenge and serialize this company's single terminal.
  const claim = await prisma.$transaction(async tx => {
    const lock = await tx.officeKiosk.updateMany({ where: { id: device.id, tokenHash: device.tokenHash, company: { faceRecognitionRequired: true }, OR: [{ busyUntil: null }, { busyUntil: { lt: new Date() } }] }, data: { busyUntil: new Date(Date.now() + 120000), lastSeenAt: new Date() } })
    if (!lock.count) return { claimed: false, action: 'IN' }
    const recentSince = new Date(Date.now() - KIOSK_REPEAT_WINDOW_MS)
    const recent = await tx.officeKioskAttempt.findFirst({ where: { kioskId: device.id, employeeId: employee.id, state: { in: ['SUCCEEDED', 'PROCESSING', 'REVIEW'] }, createdAt: { gt: recentSince } } })
    // Also protect a recent punch made through the employee app or another channel.
    const recentPunch = await tx.dTRRecord.findFirst({ where: { employeeId: employee.id, OR: [{ timeIn: { gt: recentSince } }, { timeOut: { gt: recentSince } }, { breakIn: { gt: recentSince } }, { breakOut: { gt: recentSince } }] }, select: { id: true } })
    if (recent || recentPunch) {
      await tx.officeKioskAttempt.updateMany({ where: { id: attempt.id, state: 'CHALLENGE' }, data: { state: 'REJECTED', employeeId: employee.id } })
      await tx.officeKiosk.update({ where: { id: device.id }, data: { busyUntil: null } })
      return { claimed: false, action: 'IN', repeated: true }
    }
    const open = await tx.dTRRecord.findFirst({ where: { employeeId: employee.id, timeIn: { not: null }, timeOut: null }, orderBy: { timeIn: 'desc' } })
    const schedule = open && attempt.action === 'AUTO' ? await resolveKioskShift(device.companyId, employee.id, open) : null
    const action = attempt.action === 'AUTO' ? kioskNextAction(open, schedule?.breakMinutes ?? 0, schedule?.end ?? null) : attempt.action
    const taken = await tx.officeKioskAttempt.updateMany({ where: { id: attempt.id, state: 'CHALLENGE', expiresAt: { gt: new Date() } }, data: { state: 'PROCESSING', employeeId: employee.id, action } })
    if (!taken.count) await tx.officeKiosk.update({ where: { id: device.id }, data: { busyUntil: null } })
    return { claimed: taken.count === 1, action, recordId: open?.id }
  })
  if (!claim.claimed) return kioskError(claim.repeated ? 'Attendance was recently recorded or is still processing. Step away from the camera. Wait two minutes before another punch.' : 'Another attendance request is processing. Check the result before trying again.', 409)
  const action = claim.action
  try {
    // This identity is constructed only after a server-side face match; device
    // cookies never authorize ordinary employee/admin routes.
    const ctx = { userId: employee.userId, companyId: device.companyId, role: 'EMPLOYEE', email: '' }
    const punch = new NextRequest(new URL(`/api/attendance/clock-${action === 'IN' ? 'in' : 'out'}`, req.url), { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'OnClockOfficeKiosk/1.0 Android' }, body: JSON.stringify({ lat: body.lat, lng: body.lng, accuracy: body.accuracy, photo }) })
    const response = action === 'BREAK_START' || action === 'BREAK_END' ? await performBreak(punch, ctx, action, employee.id, claim.recordId) : action === 'IN' ? await performClockIn(punch, ctx, true, employee.id) : await performClockOut(punch, ctx, employee.id)
    const data = await response.json()
    if (!response.ok) {
      await prisma.officeKioskAttempt.update({ where: { id: attempt.id }, data: { state: 'REJECTED' } })
      return kioskError(typeof data.error === 'string' ? data.error : 'Attendance could not be recorded. Contact HR.', response.status)
    }
    // Never expose the full timesheet or employee roster to a shared terminal.
    const result = { ok: true, name: `${employee.firstName} ${employee.lastName}`, action, recordedAt: new Date().toISOString(), message: action === 'BREAK_START' ? 'Break started successfully' : action === 'BREAK_END' ? 'Break ended successfully' : action === 'IN' ? 'Clocked in successfully' : 'Clocked out successfully' }
    await prisma.officeKioskAttempt.update({ where: { id: attempt.id }, data: { state: 'SUCCEEDED', result } })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    await prisma.officeKioskAttempt.update({ where: { id: attempt.id }, data: { state: 'REVIEW' } }).catch(() => {})
    return kioskError('The result could not be confirmed. Ask HR to check your timesheet before submitting again.', 503)
  } finally {
    await prisma.officeKiosk.update({ where: { id: device.id }, data: { busyUntil: null } }).catch(() => {})
  }
}
