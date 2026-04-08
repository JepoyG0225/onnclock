import { NextResponse } from 'next/server'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function getRpID() {
  const url = process.env.NEXTAUTH_URL
  if (url) {
    try { return new URL(url).hostname } catch { /* fall through */ }
  }
  return 'localhost'
}

export async function POST() {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
    select: { id: true, biometricCredential: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (!employee.biometricCredential) {
    return NextResponse.json({ error: 'No biometric credential enrolled' }, { status: 400 })
  }

  const cred = employee.biometricCredential as { id: string; transports?: string[] }
  const rpID = getRpID()

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: [{ id: cred.id, transports: cred.transports as never[] | undefined }],
  })

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      biometricChallenge: options.challenge,
      biometricChallengeAt: new Date(),
    },
  })

  return NextResponse.json(options)
}
