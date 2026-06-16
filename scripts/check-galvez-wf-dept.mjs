import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const wf = await prisma.approvalWorkflow.findUnique({ where: { id: 'cmq02difi001pg5qvwpvbp1bg' } })
console.log('departmentId:', wf?.departmentId, '| isActive:', wf?.isActive)
process.exit(0)
