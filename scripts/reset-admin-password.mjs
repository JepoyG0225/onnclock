import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

const email = 'admin@onclock.om'
const newPassword = 'Onclock2026!!'

const passwordHash = await hash(newPassword, 12)

const updated = await prisma.user.update({
  where: { email },
  data: { passwordHash },
  select: { id: true, email: true },
})

console.log('Password reset for:', updated.email)
await prisma.$disconnect()
