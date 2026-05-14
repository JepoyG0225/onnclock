/**
 * Device-facing fingerprint enrollment sync.
 *
 * GET  /api/biometric/enrollments        Returns every enrollment + employee
 *                                        snapshot the kiosk needs to match
 *                                        against. The kiosk caches this in
 *                                        SQLite and resyncs every 5 min.
 *
 * POST /api/biometric/enrollments        Enroll a new fingerprint from the
 *                                        kiosk's enrollment mode.
 *   Body: {
 *     employeeId: string
 *     finger:      string  (RIGHT_THUMB | RIGHT_INDEX | ...)
 *     templateB64: string  (ZK9500 template, base64)
 *     qualityScore?: number
 *   }
 *
 * DELETE /api/biometric/enrollments?employeeId=...&finger=...
 *   Remove an enrollment from the kiosk.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireDeviceAuth } from '@/lib/biometric-device-auth'
import { z } from 'zod'

export const runtime = 'nodejs'

const enrollSchema = z.object({
  employeeId:   z.string().min(1),
  finger:       z.enum([
    'RIGHT_THUMB', 'RIGHT_INDEX', 'RIGHT_MIDDLE', 'RIGHT_RING', 'RIGHT_LITTLE',
    'LEFT_THUMB',  'LEFT_INDEX',  'LEFT_MIDDLE',  'LEFT_RING',  'LEFT_LITTLE',
  ]),
  templateB64:  z.string().min(8).max(1_000_000),
  qualityScore: z.number().int().min(0).max(100).optional(),
})

export async function GET(req: NextRequest) {
  const { ctx, error } = await requireDeviceAuth(req)
  if (error) return error

  const enrollments = await prisma.fingerprintEnrollment.findMany({
    where: { companyId: ctx.companyId },
    select: {
      id: true,
      employeeId: true,
      finger: true,
      templateB64: true,
      qualityScore: true,
      enrolledAt: true,
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeNo: true,
          photoUrl: true,
          isActive: true,
        },
      },
    },
    orderBy: { enrolledAt: 'asc' },
  })

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    enrollments: enrollments
      .filter((e) => e.employee.isActive)
      .map((e) => ({
        id: e.id,
        employeeId: e.employeeId,
        employeeName: `${e.employee.firstName} ${e.employee.lastName}`,
        employeeNo: e.employee.employeeNo,
        finger: e.finger,
        templateB64: e.templateB64,
        qualityScore: e.qualityScore,
        photoUrl: e.employee.photoUrl,
      })),
  })
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireDeviceAuth(req)
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = enrollSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 })
  }
  const { employeeId, finger, templateB64, qualityScore } = parsed.data

  // Make sure the employee belongs to this device's company
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId: ctx.companyId, isActive: true },
    select: { id: true },
  })
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found in this company' }, { status: 404 })
  }

  // Upsert (replace) — re-enrolling the same finger overwrites the old template.
  const enrollment = await prisma.fingerprintEnrollment.upsert({
    where: { employeeId_finger: { employeeId, finger } },
    create: {
      companyId:          ctx.companyId,
      employeeId,
      finger,
      templateB64,
      qualityScore:       qualityScore ?? null,
      enrolledByDeviceId: ctx.deviceId,
    },
    update: {
      templateB64,
      qualityScore:       qualityScore ?? null,
      enrolledAt:         new Date(),
      enrolledByDeviceId: ctx.deviceId,
    },
  })

  // Audit log: also write a BiometricClockEvent of type ENROLL
  await prisma.biometricClockEvent.create({
    data: {
      deviceId:   ctx.deviceId,
      companyId:  ctx.companyId,
      employeeId,
      eventType:  'ENROLL',
      matchScore: qualityScore ?? null,
      syncedAt:   new Date(),
    },
  })

  return NextResponse.json({ enrollment }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { ctx, error } = await requireDeviceAuth(req)
  if (error) return error

  const { searchParams } = new URL(req.url)
  const employeeId = (searchParams.get('employeeId') ?? '').trim()
  const finger     = (searchParams.get('finger') ?? '').trim()
  if (!employeeId || !finger) {
    return NextResponse.json({ error: 'employeeId + finger query params required' }, { status: 400 })
  }

  const deleted = await prisma.fingerprintEnrollment.deleteMany({
    where: { companyId: ctx.companyId, employeeId, finger },
  })
  return NextResponse.json({ removed: deleted.count })
}
