import { createHash } from 'crypto'
export const correctionFields=['basicSalary','regularOtAmount','restDayOtAmount','holidayOtAmount','nightDiffAmount','holidayPayAmount','lateDeduction','undertimeDeduction','absenceDeduction','restDayWork'] as const
export type CorrectionAmounts=Record<typeof correctionFields[number],number>
export function correctionAmounts(row:Record<string,unknown>):CorrectionAmounts{
 const basis=(row.calculationBasis??{}) as {retroItems?:{basic:number}[];corrections?:{basic:number}[];restDayBreakdown?:{total:number}[]}
 const values=Object.fromEntries(correctionFields.map(k=>[k,Number(row[k]??0)])) as CorrectionAmounts
 values.basicSalary-= [...(basis.retroItems??[]),...(basis.corrections??[])].reduce((n,r)=>n+Number(r.basic),0)
 values.restDayWork=(basis.restDayBreakdown??[]).reduce((n,r)=>n+Number(r.total),0)
 return values
}
export function correctionDifference(before:CorrectionAmounts,after:CorrectionAmounts){
 const round=(n:number)=>Number(n.toFixed(2))
 const basic=round(after.basicSalary-before.basicSalary-(['lateDeduction','undertimeDeduction','absenceDeduction'] as const).reduce((n,k)=>n+after[k]-before[k],0))
 const other=round((['regularOtAmount','restDayOtAmount','holidayOtAmount','nightDiffAmount','holidayPayAmount','restDayWork'] as const).reduce((n,k)=>n+after[k]-before[k],0))
 return {basic,other,total:round(basic+other)}
}
export function correctionHash(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
