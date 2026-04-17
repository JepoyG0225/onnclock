import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

const email = 'admin@onclockph.com'
const newPassword = 'OnclockPH2026!!'

const passwordHash = await hash(newPassword, 12)

const updated = await prisma.user.update({
  where: { email },
  data: { passwordHash },
  select: { id: true, email: true },
})

console.log('Password reset for:', updated.email)
await prisma.$disconnect()
