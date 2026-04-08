import { NextResponse } from 'next/server'
import { generateRegistrationOptions } from '@simplewebauthn/server'
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
    select: { id: true, firstName: true, lastName: true, workEmail: true, personalEmail: true, biometricCredential: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const rpID = getRpID()
  const rpName = 'OnClock HR'
  const userName = employee.workEmail ?? employee.personalEmail ?? ctx.email
  const displayName = `${employee.firstName} ${employee.lastName}`.trim()

  // If already enrolled, exclude existing credential to prevent duplicate registration
  const existingCred = employee.biometricCredential as { id: string; transports?: string[] } | null
  const excludeCredentials = existingCred
    ? [{ id: existingCred.id, transports: existingCred.transports as never[] | undefined }]
    : []

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName,
    userDisplayName: displayName,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  // Store challenge on the employee record (expires in 5 minutes)
  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      biometricChallenge: options.challenge,
      biometricChallengeAt: new Date(),
    },
  })

  return NextResponse.json(options)
}
