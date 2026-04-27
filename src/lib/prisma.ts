import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const baseDbUrl = process.env.DATABASE_URL
const envConnectionLimit = process.env.PRISMA_CONNECTION_LIMIT
const envPoolTimeout = process.env.PRISMA_POOL_TIMEOUT

function withPgBouncerMode(url?: string) {
  if (!url) return url
  try {
    const parsed = new URL(url)
    // Disables prepared statements; prevents "prepared statement does not exist"
    // with pooled Postgres connections in dev/hot-reload environments.
    parsed.searchParams.set('pgbouncer', 'true')

    const currentConnectionLimit = Number(parsed.searchParams.get('connection_limit') ?? '')
    const currentPoolTimeout = Number(parsed.searchParams.get('pool_timeout') ?? '')
    const targetConnectionLimit = Number(envConnectionLimit || '5')
    const targetPoolTimeout = Number(envPoolTimeout || '30')

    // Prevent starvation from overly strict defaults like connection_limit=1.
    if (!Number.isFinite(currentConnectionLimit) || currentConnectionLimit < 2) {
      if (Number.isFinite(targetConnectionLimit) && targetConnectionLimit >= 2) {
        parsed.searchParams.set('connection_limit', String(targetConnectionLimit))
      }
    }
    // Avoid short pool wait windows that frequently fail under bursty traffic.
    if (!Number.isFinite(currentPoolTimeout) || currentPoolTimeout < 20) {
      if (Number.isFinite(targetPoolTimeout) && targetPoolTimeout >= 20) {
        parsed.searchParams.set('pool_timeout', String(targetPoolTimeout))
      }
    }

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
