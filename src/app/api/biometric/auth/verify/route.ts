import { NextRequest, NextResponse } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
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
    select: { id: true, biometricCredential: true, biometricChallenge: true, biometricChallengeAt: true },
  })
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (!employee.biometricChallenge) return NextResponse.json({ error: 'No pending challenge' }, { status: 400 })
  if (!employee.biometricCredential) return NextResponse.json({ error: 'No biometric credential enrolled' }, { status: 400 })

  // Challenge expires in 5 minutes
  const challengeAge = Date.now() - (employee.biometricChallengeAt?.getTime() ?? 0)
  if (challengeAge > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Challenge expired. Please try again.' }, { status: 400 })
  }

  const stored = employee.biometricCredential as {
    id: string
    publicKey: string
    counter: number
    transports?: string[]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await req.json()
  const rpID = getRpID()
  const expectedOrigin = getExpectedOrigin()

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: employee.biometricChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: stored.id,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64')),
        counter: stored.counter,
        transports: stored.transports as never[] | undefined,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Authentication failed' }, { status: 400 })
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Authentication not verified' }, { status: 400 })
  }

  // Update counter to prevent replay attacks
  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      biometricCredential: {
        ...stored,
        counter: verification.authenticationInfo.newCounter,
      },
      biometricChallenge: null,
      biometricChallengeAt: null,
    },
  })

  return NextResponse.json({ verified: true })
}
