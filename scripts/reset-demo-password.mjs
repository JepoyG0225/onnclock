/**
 * Reset a user's login password.
 *
 *   node scripts/reset-demo-password.mjs <email> <newPassword>
 *   node scripts/reset-demo-password.mjs demo@onclockph.com 'S3cret!'
 *
 * The password is taken from argv rather than hardcoded ON PURPOSE — this
 * file is committed, and a literal in here would put a live credential into
 * git history where it cannot be removed by a later edit.
 *
 * bcrypt cost 12, matching what src/lib/auth.ts verifies against with
 * `compare()`.
 */
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const [, , email, newPassword] = process.argv

if (!email || !newPassword) {
  console.error('Usage: node scripts/reset-demo-password.mjs <email> <newPassword>')
  process.exit(1)
}

const prisma = new PrismaClient()

const passwordHash = await hash(newPassword, 12)

const updated = await prisma.user.update({
  where: { email },
  data: {
    passwordHash,
    // Invalidate any outstanding "forgot password" link so an old reset
    // email can't be used to set a different password afterwards.
    passwordResetToken: null,
    passwordResetExpiry: null,
  },
  select: { id: true, email: true },
})

console.log('Password reset for:', updated.email)
await prisma.$disconnect()
