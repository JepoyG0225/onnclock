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

    // Per-Prisma-client connection limit. Vercel serverless can spawn
    // dozens of concurrent function instances under traffic; each one
    // opens its own Prisma client with `connection_limit` slots into
    // Supabase pgBouncer. With the previous default of 5 and bursts of
    // ~30 instances we were saturating the downstream pgBouncer pool
    // (default 200 transaction-mode connections) and queries timed out
    // waiting 30s for a slot. Dropping to 3 per instance gives Supabase
    // more headroom across many instances at the cost of slightly more
    // contention within a single instance — fine because each instance
    // typically processes 1 request at a time.
    const targetConnectionLimit = Number(envConnectionLimit || '3')
    // Pool wait timeout. Was 30s — too long, because the function
    // itself only has 15s on Vercel and my own query timeout was 5s.
    // The query timeout was firing before the pool wait, so users got
    // a labeled "Prisma query timeout" error when the underlying issue
    // was actually "no connection available." Trim the wait to 3s so
    // Prisma fails fast and Next.js error boundaries can render
    // gracefully instead of the request hanging for 15s.
    const targetPoolTimeout = Number(envPoolTimeout || '3')

    parsed.searchParams.set('connection_limit', String(targetConnectionLimit))
    parsed.searchParams.set('pool_timeout', String(targetPoolTimeout))

    return parsed.toString()
  } catch {
    return url
  }
}

const runtimeDbUrl = withPgBouncerMode(baseDbUrl)

// ── System-wide query timeout ────────────────────────────────────────
// Every Prisma operation is wrapped in a Promise.race against a hard
// 5-second clock. If a query hangs (pgBouncer pool exhaustion during a
// burst, a transient Supabase pause, etc.) it rejects fast with a
// labeled error instead of dragging the Vercel function to its 15-second
// timeout and 500-ing with an empty response body. Route handlers can
// then catch the rejection and return a structured error, or fall back
// to an empty-state UI in the case of layouts.
//
// The window is intentionally generous (5s) — Supabase from Tokyo
// (hnd1) to Singapore typically completes in <200ms, so 5s only fires
// when something is actually wrong. Override at runtime via the
// PRISMA_QUERY_TIMEOUT_MS env var if needed.
// 8s gives legitimate queries room: 3s pool wait (worst case) + 5s
// actual query. The Vercel function ceiling is ~15s so we still have
// headroom for the rest of the route handler. Override at runtime via
// PRISMA_QUERY_TIMEOUT_MS for ops tuning.
const QUERY_TIMEOUT_MS = Number(process.env.PRISMA_QUERY_TIMEOUT_MS || '8000')

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: runtimeDbUrl,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

// $extends covers TYPED model operations (prisma.user.findFirst etc).
// Raw query methods ($queryRawUnsafe, $executeRawUnsafe, $transaction)
// bypass the extension's $allOperations handler, so we wrap those
// directly on the base client below. 88 raw query sites across the
// codebase would otherwise have no timeout protection.
function withQueryTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Prisma query timeout (${QUERY_TIMEOUT_MS}ms): ${label}`)),
        QUERY_TIMEOUT_MS,
      ),
    ),
  ])
}

// Wrap raw query methods in place on the base client BEFORE applying
// $extends. Each wrap captures the original method and races it against
// the timeout. $transaction gets a longer ceiling (3× the per-query
// budget) because legitimate transactions can do multiple sequential
// queries.
const TX_TIMEOUT_MS = QUERY_TIMEOUT_MS * 3

type RawMethod = (...args: unknown[]) => Promise<unknown>
;(function wrapRawMethods() {
  const methods: Array<keyof PrismaClient> = [
    '$queryRaw',
    '$queryRawUnsafe',
    '$executeRaw',
    '$executeRawUnsafe',
  ]
  for (const m of methods) {
    const orig = (basePrisma as unknown as Record<string, RawMethod>)[m as string]
    if (typeof orig !== 'function') continue
    ;(basePrisma as unknown as Record<string, RawMethod>)[m as string] = function (...args: unknown[]) {
      return withQueryTimeout(orig.apply(basePrisma, args), String(m))
    }
  }
  // $transaction is special — it accepts either an array of promises or
  // a callback. We only intercept the callback shape (interactive tx)
  // since that's what holds connections open.
  const origTx = basePrisma.$transaction.bind(basePrisma) as unknown as (
    arg: unknown,
    opts?: unknown,
  ) => Promise<unknown>
  ;(basePrisma as unknown as { $transaction: unknown }).$transaction = function (arg: unknown, opts?: unknown) {
    return withQueryTimeout(origTx(arg, opts), '$transaction') as unknown
  }
})()

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        return withQueryTimeout(query(args), `${model}.${operation}`)
      },
    },
  },
}) as unknown as typeof basePrisma

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma
