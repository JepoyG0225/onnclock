// READ-ONLY. Snapshots every payslip carrying employer-borne SSS EC inside
// totalDeductions / netPay, so the correction can be reversed exactly.
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'
const prisma = new PrismaClient()

const slips = await prisma.payslip.findMany({
  where: { sssEc: { gt: 0 } },
  select: {
    id: true, employeeId: true, payrollRunId: true,
    sssEc: true, totalDeductions: true, netPay: true,
    payrollRun: { select: { status: true, payDate: true, companyId: true } },
  },
})
const out = slips.map(s => ({
  id: s.id, employeeId: s.employeeId, payrollRunId: s.payrollRunId,
  runStatus: s.payrollRun.status, companyId: s.payrollRun.companyId,
  payDate: s.payrollRun.payDate,
  sssEc: Number(s.sssEc),
  totalDeductions: Number(s.totalDeductions),
  netPay: Number(s.netPay),
}))
const path = process.argv[2]
writeFileSync(path, JSON.stringify(out, null, 2))
console.log(`backed up ${out.length} payslips -> ${path}`)
await prisma.$disconnect()
