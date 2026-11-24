import { prisma } from '@/lib/prisma'
import { type AccountingDocument, type LedgerLine, cents, validateDocument } from './policy'
import { payslipTotals, EARNING_FIELDS, EMPLOYEE_DEDUCTION_FIELDS } from '@/lib/payroll/payslip-totals'
import { dateOnly } from '@/lib/expenses/policy'
export type PaymentConfirmation={date:string;method:'BANK'|'CASH';reference:string}
export async function sourceDocument(companyId:string,type:string,id:string,payment?:PaymentConfirmation):Promise<AccountingDocument>{
 const company=await prisma.company.findUniqueOrThrow({where:{id:companyId},select:{payrollCurrency:true}})
 const currency=company.payrollCurrency||'PHP'
 const day=(d:Date)=>d.toISOString().slice(0,10)
 const lines:LedgerLine[]=[]
 const add=(account:LedgerLine['account'],amount:number,description:string)=>{if(amount)lines.push({account,amount:cents(amount)/100,description})}
 let doc:AccountingDocument
 if(type==='PAYROLL'){
  const run=await prisma.payrollRun.findFirst({where:{id,companyId,status:{in:['APPROVED','LOCKED','DISBURSED']}},include:{payslips:true}})
  if(!run||!run.payslips.length)throw new Error('Approved payroll not found.')
  const sum=(key:string)=>run.payslips.reduce((n,p)=>n+cents((p as unknown as Record<string,unknown>)[key]||0),0)/100
  for(const p of run.payslips){
   const components=Object.fromEntries([...EARNING_FIELDS,...EMPLOYEE_DEDUCTION_FIELDS].map(key=>[key,Number(p[key])]))
   const totals=payslipTotals(components)
   if(cents(totals.grossPay)!==cents(p.grossPay)||cents(totals.totalDeductions)!==cents(p.totalDeductions)||cents(totals.netPay)!==cents(p.netPay))throw new Error('A payslip total does not match its breakdown. Resolve it before syncing.')
  }
  const employer=sum('sssEmployer')+sum('sssEc')+sum('philhealthEmployer')+sum('pagibigEmployer')
  const attendance=sum('lateDeduction')+sum('undertimeDeduction')+sum('absenceDeduction')
  const loans=sum('companyLoan')
  const statutory=sum('sssEmployee')+sum('philhealthEmployee')+sum('pagibigEmployee')+sum('withholdingTax')
  add('payrollExpenseAccountId',sum('grossPay'),'Gross payroll')
  add('employerExpenseAccountId',employer,'Employer contributions including EC')
  add('payrollPayableAccountId',-sum('netPay'),'Net payroll payable')
  add('sssPayableAccountId',-(sum('sssEmployee')+sum('sssEmployer')+sum('sssEc')),'SSS and EC')
  add('philhealthPayableAccountId',-(sum('philhealthEmployee')+sum('philhealthEmployer')),'PhilHealth')
  add('pagibigPayableAccountId',-(sum('pagibigEmployee')+sum('pagibigEmployer')),'Pag-IBIG')
  add('taxPayableAccountId',-sum('withholdingTax'),'Withholding tax')
  add('employeeAdvancesAccountId',-loans,'Company loan and advance recoveries')
  add('attendanceAccountId',-attendance,'Late, undertime and absence deductions')
  add('otherDeductionsAccountId',-(sum('totalDeductions')-statutory-attendance-loans),'Other deductions')
  doc={sourceType:type,sourceId:id,sourceVersion:run.updatedAt.toISOString(),date:day(run.payDate),currency,description:`Payroll ${run.periodLabel}`,lines}
 }else if(type==='EXPENSE'){
  const c=await prisma.expenseClaim.findFirst({where:{id,companyId,status:'PAID'},include:{employee:{select:{firstName:true,lastName:true,employeeNo:true}}}})
  if(!c||c.approvedAmount==null||!c.paidAt||c.settledAmount==null||!['BANK','CASH'].includes(c.paymentMethod||''))throw new Error('A settled claim with payment details is required.')
  const approved=Number(c.approvedAmount),advance=c.isLiquidation?Number(c.cashAdvanceAmount):0
  if(cents(approved)-cents(advance)!==cents(c.settledAmount))throw new Error('Expense settlement does not match the approved amount and advance.')
  add('expenseAccountId',approved,c.description)
  add('employeeAdvancesAccountId',-advance,'Liquidation of previously recorded advance')
  add(c.paymentMethod==='CASH'?'cashAccountId':'bankAccountId',-Number(c.settledAmount),c.paymentReference||'Expense settlement')
  doc={sourceType:type,sourceId:id,sourceVersion:c.updatedAt.toISOString(),date:day(c.paidAt),currency:c.currency,description:`Expense ${c.id}: ${c.description}`,contactName:`${c.employee.firstName} ${c.employee.lastName} (${c.employee.employeeNo})`,lines}
 }else if(type==='CASH_ADVANCE'||type==='BUDGET'){
  if(!payment||!dateOnly.safeParse(payment.date).success||payment.reference.trim().length<3||!['BANK','CASH'].includes(payment.method))throw new Error('Confirm the actual payment date, bank/cash method and reference.')
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date())
  const c=type==='CASH_ADVANCE'?await prisma.cashAdvanceRequest.findFirst({where:{id,companyId,status:'APPROVED'},include:{employee:true}}):await prisma.budgetRequisition.findFirst({where:{id,companyId,status:'APPROVED'},include:{employee:true}})
  if(!c)throw new Error('Approved source not found.')
  const approvedAt='approvedAt' in c?c.approvedAt:c.reviewedAt
  if(!approvedAt||payment.date<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(approvedAt)||payment.date>today)throw new Error('Payment date must be between approval and today.')
  const amount='amountRequested' in c?Number(c.amountRequested):Number(c.totalAmount)
  add(type==='CASH_ADVANCE'?'employeeAdvancesAccountId':'budgetFundsAccountId',amount,type==='CASH_ADVANCE'?'Cash advance released':'Budget funds released, awaiting liquidation')
  add(payment.method==='CASH'?'cashAccountId':'bankAccountId',-amount,payment.reference)
  doc={sourceType:type,sourceId:id,sourceVersion:c.updatedAt.toISOString(),date:payment.date,currency:'currency' in c?c.currency:currency,description:`${type==='BUDGET'?'Budget funding':'Cash advance'} ${id}: ${payment.reference}`,contactName:`${c.employee.firstName} ${c.employee.lastName} (${c.employee.employeeNo})`,lines,payment}
 }else throw new Error('Unsupported transaction type.')
 validateDocument(doc);return doc
}
