import { SignJWT, jwtVerify } from 'jose'

const COOKIE_NAME = '__impersonate'
const secret = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'onclock-dev-secret'
)

export { COOKIE_NAME as IMPERSONATE_COOKIE }

export interface ImpersonatePayload {
  companyId: string
  userId: string
  role: string
  email: string
  companyName: string
  impersonatedBy: string // super admin userId
}

export async function signImpersonateToken(payload: ImpersonatePayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret)
}

export async function verifyImpersonateToken(token: string): Promise<ImpersonatePayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as ImpersonatePayload
  } catch {
    return null
  }
}
