import { faceBetaAvailable } from '@/lib/face/availability'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
export async function GET(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error
  if (!(await faceBetaAvailable(ctx.companyId))) return NextResponse.json({ error: 'Facial recognition is not available for this company.' }, { status: 403 })
  if (!await ctxHasPermission(ctx, 'settings:read')) return NextResponse.json({ error: 'Attendance settings permission required.' }, { status: 403 })
  const company = await prisma.company.findUnique({ where: { id: ctx.companyId }, select: { faceRecognitionRequired: true } })
  if (!company?.faceRecognitionRequired) return NextResponse.json({ error: 'Enable and save face verification first.' }, { status: 403 })
  return NextResponse.redirect(new URL('/downloads/onclock-office-kiosk-1.0.1.apk', req.url))
}
