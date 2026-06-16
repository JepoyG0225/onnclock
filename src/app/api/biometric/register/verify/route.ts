import { NextRequest, NextResponse } from 'next/server'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function getRpID() {
  const url = process.env.NEXTAUTH_URL
  if (url) {
    try { return new URL(url).hostname } catch { /* fall through */ }
  }
  return 'localhost'
}

function getExpectedOrigin() {
  const url = process.env.NEXTAUTH_URL
  if (url) return url.replace(/\/$/, '')
  return 'http://localhost:3001'
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await requireAuth()
  if (error) return error

  const employee = await prisma.employee.findFirst({
    where: { userId: ctx.userId, companyId: ctx.companyId },
    select: { id: true, biometricChallenge: true, biometricChallengeAt: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (!employee.biometricChallenge) return NextResponse.json({ error: 'No pending challenge' }, { status: 400 })

  // Challenge expires in 5 minutes
  const challengeAge = Date.now() - (employee.biometricChallengeAt?.getTime() ?? 0)
  if (challengeAge > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Challenge expired. Please try again.' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await req.json()
  const rpID = getRpID()
  const expectedOrigin = getExpectedOrigin()

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: employee.biometricChallenge,
      expectedOrigin,
      expectedRPID: rpID,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Verification failed' }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Registration not verified' }, { status: 400 })
  }

  const { credential } = verification.registrationInfo

  // Store credential: serialize publicKey (Uint8Array) as base64
  const storedCredential = {
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64'),
    counter: credential.counter,
    transports: credential.transports ?? [],
  }

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      biometricCredential: storedCredential,
      biometricChallenge: null,
      biometricChallengeAt: null,
    },
  })

  return NextResponse.json({ verified: true })
}
