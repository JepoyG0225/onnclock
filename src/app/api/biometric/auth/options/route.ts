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

  // Force on-device (platform) authenticator only. Without this, iOS shows
  // a passkey picker that includes "Use phone via QR" / iCloud Keychain —
  // tapping out of it surfaces as NotAllowedError, which our UI displays
  // as "Fingerprint authentication was cancelled." Restricting transports
  // to "internal" sends the user straight to Face ID / Touch ID.
  const transportsToSend = ['internal']

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: [{ id: cred.id, transports: transportsToSend as never[] }],
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
