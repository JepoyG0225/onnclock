import { payslipTotals,EARNING_FIELDS,EMPLOYEE_DEDUCTION_FIELDS } from '@/lib/payroll/payslip-totals'
import { readCalculatedValues } from '@/lib/payroll/review'
import { readDailyBreakdown } from '@/lib/payroll/daily-breakdown'
import { readDeductionCarryover } from '@/lib/payroll/deduction-carryover'
export const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100
export function reconcileSlip(slip:Record<string,unknown>,prior:Record<string,unknown>|null) {
 const values=Object.fromEntries([...EARNING_FIELDS,...EMPLOYEE_DEDUCTION_FIELDS].map(k=>[k,Number(slip[k]??0)]))
 const expected=payslipTotals(values),calculated=readCalculatedValues(slip.calculationBasis),daily=readDailyBreakdown(slip.calculationBasis)
 const manual=slip.manualEdits&&typeof slip.manualEdits==='object'?slip.manualEdits as Record<string,unknown>:{}
 const findings:string[]=[]
 for(const key of ['grossPay','totalDeductions','netPay'] as const)if(Math.abs(round(Number(slip[key])-expected[key]))>.01)findings.push(`${key}: components total ${expected[key].toFixed(2)}; saved ${Number(slip[key]).toFixed(2)}`)
 const basicDelta=typeof calculated.basicSalary==='number'?round(Number(slip.basicSalary)-calculated.basicSalary):null
 if(basicDelta!==null&&Math.abs(basicDelta)>.01)findings.push(('basicSalary'in manual?'Manual basic-pay adjustment':'Basic pay differs from saved calculation')+`: ${basicDelta.toFixed(2)}`)
 if(!daily)findings.push('Detailed daily calculation snapshot unavailable')
 else {const delta=round(Number(slip.basicSalary)-daily.rows.reduce((s,r)=>s+r.basic+r.holidayCredit,0));if(Math.abs(delta)>.01)findings.push(`Daily basic-pay allocation difference: ${delta.toFixed(2)}`)}
 if(Number(slip.netPay)<0)findings.push('Negative net pay')
 const carryover=readDeductionCarryover(slip.calculationBasis)?.deferredTotal??0
 if(carryover>0)findings.push(`Deductions carried forward: ${carryover.toFixed(2)}`)
 return {expected,calculatedBasic:calculated.basicSalary??null,basicDelta,priorNet:prior?Number(prior.netPay):null,netChange:prior?round(Number(slip.netPay)-Number(prior.netPay)):null,manual:Object.keys(manual).length>0,carryover,findings,daily}
}
