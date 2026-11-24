import { Prisma } from '@prisma/client'
export async function encashmentPayrollIssue(db:Prisma.TransactionClient,runId:string,companyId:string):Promise<string|null>{
 const [entries,slips]=await Promise.all([
  db.leaveEncashment.findMany({where:{companyId,payrollRunId:runId,status:'APPROVED'},include:{balance:{select:{employeeId:true}}}}),
  db.payslip.findMany({where:{payrollRunId:runId},select:{employeeId:true,grossPay:true,netPay:true,totalDeductions:true,withholdingTax:true,calculationBasis:true}}),
 ])
 if(!entries.length||slips.length!==new Set(entries.map(e=>e.balance.employeeId)).size)return 'This leave encashment batch is empty or inconsistent. Review it in Leave Encashment.'
 for(const slip of slips){
  const linked=entries.filter(e=>e.balance.employeeId===slip.employeeId),basis=slip.calculationBasis as {rows?:{id:string;amount:number;withholdingTax:number}[]}|null
  if(!linked.length||!basis?.rows||basis.rows.length!==linked.length||linked.some(e=>!basis.rows!.some(r=>r.id===e.id&&Math.abs(r.amount-Number(e.amount))<.01)))return 'Payslips do not match the approved leave conversions.'
  const amount=linked.reduce((n,e)=>n+Number(e.amount),0),tax=basis.rows.reduce((n,r)=>n+r.withholdingTax,0)
  if(Math.abs(Number(slip.grossPay)-amount)>.01||Math.abs(Number(slip.withholdingTax)-tax)>.01||Number(slip.totalDeductions)!==Number(slip.withholdingTax)||Math.abs(Number(slip.netPay)-(amount-tax))>.01||Number(slip.netPay)<0)return 'Review the leave encashment payroll totals before approval or payment.'
 }
 return null
}
