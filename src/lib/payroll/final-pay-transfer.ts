import { createHash } from 'crypto'
import type { FinalPayResult } from './final-pay'
export function finalPayReviewHash(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
export function finalPayPayslip(result:FinalPayResult,snapshot:{outstandingLoans:number;cashAdvanceBalance:number},assets:number){
 for(const value of [result.grossPay,result.totalDeductions,result.taxWithheld,result.taxableEarnings,result.nonTaxableEarnings])if(!Number.isFinite(value)||value<0)throw Error('Review the final-pay amounts before creating payroll.')
 if(Math.abs(result.grossPay-result.totalDeductions-result.taxWithheld-result.netFinalPay)>.01)throw Error('Final-pay totals do not reconcile. Recompute first.')
 const round=(v:number)=>Number(v.toFixed(2))
 if(!Number.isFinite(result.netFinalPay)||result.netFinalPay<0||result.grossPay<=0)throw Error('Final pay must have positive gross earnings and a non-negative net amount. Review deductions first.')
 const deductions=[{label:'Outstanding loans',amount:snapshot.outstandingLoans},{label:'Cash advances',amount:snapshot.cashAdvanceBalance},{label:'Unreturned assets',amount:assets}].filter(i=>i.amount>0)
 if(Math.abs(deductions.reduce((s,i)=>s+i.amount,0)-result.totalDeductions)>.01)throw Error('Deduction breakdown does not match. Recompute final pay.')
 return {basicSalary:0,dailyRate:result.dailyRate,daysWorked:0,hoursWorked:0,otherEarnings:result.grossPay,grossPay:result.grossPay,otherDeductions:result.totalDeductions,withholdingTax:result.taxWithheld,totalDeductions:round(result.totalDeductions+result.taxWithheld),netPay:result.netFinalPay,taxableIncome:result.taxableEarnings,nonTaxableIncome:result.nonTaxableEarnings,manualEdits:{customIncomes:result.components.filter(c=>c.amount>0).map(c=>({label:c.label,amount:c.amount})),customDeductions:deductions}}
}
