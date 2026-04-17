import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'

const baseDomain = process.env.PORTAL_BASE_DOMAIN || ''
const cookieDomain =
  process.env.NODE_ENV === 'production' && baseDomain ? `.${baseDomain}` : undefined

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'onclock-dev-secret',
  session: { strategy: 'jwt' },
  cookies: cookieDomain
    ? {
        sessionToken: {
          name: '__Secure-next-auth.session-token',
          options: {
            httpOnly: true,
            sameSite: 'lax' as const,
            path: '/',
            secure: true,
            domain: cookieDomain,
          },
        },
      }
    : undefined,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      const portalBase = (process.env.PORTAL_BASE_DOMAIN || '').toLowerCase()
      const effectiveBaseUrl =
        process.env.NODE_ENV === 'production' && portalBase
          ? `https://${portalBase}`
          : baseUrl

      // Allow relative redirects and any host under the configured portal base domain.
      if (url.startsWith('/')) return new URL(url, effectiveBaseUrl).toString()
      try {
        const target = new URL(url)
        const base = new URL(effectiveBaseUrl)
        const targetHost = target.hostname.toLowerCase()
        const baseHost = base.hostname.toLowerCase()

        if (targetHost === baseHost) return url
        if (portalBase && (targetHost === portalBase || targetHost.endsWith(`.${portalBase}`))) {
          return url
        }
      } catch {
        // fall through to baseUrl
      }
      return effectiveBaseUrl
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.role = (user as { role?: string }).role
        token.companyId = (user as { companyId?: string }).companyId
        token.name = user.name
        token.portalSubdomain = (user as { portalSubdomain?: string | null }).portalSubdomain ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.role = token.role as string
        session.user.companyId = token.companyId as string
        session.user.name = token.name as string
        session.user.portalSubdomain = (token.portalSubdomain as string | null) ?? null
      }
      return session
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const normalizedEmail = String(credentials.email).trim().toLowerCase()

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: {
            companies: {
              where: { isActive: true },
              include: { company: { select: { id: true, name: true, portalSubdomain: true } } },
            },
          },
        })

        if (!user || !user.isActive) return null

        const isValid = await compare(credentials.password as string, user.passwordHash)
        if (!isValid) return null

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch(() => null)

        if (!user.companies.length) return null

        // Pick the highest-privilege role — prevents SUPER_ADMIN being downgraded
        // if they also have an older EMPLOYEE entry in a company.
        const ROLE_PRIORITY: Record<string, number> = {
          SUPER_ADMIN: 0, COMPANY_ADMIN: 1, HR_MANAGER: 2, PAYROLL_OFFICER: 3, EMPLOYEE: 4,
        }
        const primaryCompany = [...user.companies].sort(
          (a, b) => (ROLE_PRIORITY[a.role] ?? 9) - (ROLE_PRIORITY[b.role] ?? 9)
        )[0]

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          role: primaryCompany.role ?? 'EMPLOYEE',
          companyId: primaryCompany.companyId ?? null,
          portalSubdomain: primaryCompany.company?.portalSubdomain ?? null,
        }
      },
    }),
  ],
})

// Helper to get auth session in server components / API routes
export { auth as getServerSession }
