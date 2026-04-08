import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const baseDbUrl =
  process.env.NODE_ENV === 'development'
    ? (process.env.DIRECT_URL || process.env.DATABASE_URL)
    : process.env.DATABASE_URL

function withPgBouncerMode(url?: string) {
  if (!url) return url
  try {
    const parsed = new URL(url)
    // Disables prepared statements; prevents "prepared statement does not exist"
    // with pooled Postgres connections in dev/hot-reload environments.
    parsed.searchParams.set('pgbouncer', 'true')
    return parsed.toString()
  } catch {
    return url
  }
}

const runtimeDbUrl = withPgBouncerMode(baseDbUrl)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: runtimeDbUrl,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
