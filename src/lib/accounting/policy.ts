import { z } from 'zod'
export const mappingLabels = {
 expenseAccountId:'Expense claims', bankAccountId:'Bank payments', cashAccountId:'Cash payments',
 employeeAdvancesAccountId:'Employee loans and advances (asset)', budgetFundsAccountId:'Budget funds awaiting liquidation (asset)',
 payrollExpenseAccountId:'Payroll expense', payrollPayableAccountId:'Net payroll payable',
 employerExpenseAccountId:'Employer contribution expense', sssPayableAccountId:'SSS and EC payable',
 philhealthPayableAccountId:'PhilHealth payable', pagibigPayableAccountId:'Pag-IBIG payable',
 taxPayableAccountId:'Withholding tax payable', otherDeductionsAccountId:'Other payroll deductions payable',
 attendanceAccountId:'Attendance deductions (contra expense)',
} as const
export type AccountMapping = Partial<Record<keyof typeof mappingLabels,string>>
export const mappingSchema=z.object(Object.fromEntries(Object.keys(mappingLabels).map(k=>[k,z.string().trim().max(100).optional()])) as Record<keyof typeof mappingLabels,z.ZodOptional<z.ZodString>>)
export type LedgerLine={account:keyof typeof mappingLabels;amount:number;description:string}
export type AccountingDocument={sourceType:string;sourceId:string;sourceVersion:string;date:string;currency:string;description:string;contactName?:string;lines:LedgerLine[];payment?:{date:string;method:'BANK'|'CASH';reference:string}}
export const cents=(n:unknown)=>Math.round(Number(n)*100)
export function validateDocument(doc:AccountingDocument){
 if(!doc.lines.length||doc.lines.some(l=>!Number.isFinite(l.amount)))throw new Error('Invalid transaction amounts.')
 if(doc.lines.reduce((n,l)=>n+cents(l.amount),0)!==0)throw new Error('This transaction does not balance. Correct the source breakdown before syncing.')
}
export function providerPayload(provider:string, doc:AccountingDocument, mapping:AccountMapping, reference:string){
 validateDocument(doc)
 const account=(key:keyof AccountMapping)=>{const value=mapping[key];if(!value)throw new Error(`Map ${mappingLabels[key]} before syncing.`);return value}
 const lines=doc.lines.filter(l=>cents(l.amount)!==0)
 if(provider==='QUICKBOOKS')return {path:'/journalentry',entity:'JournalEntry',idField:'Id',body:{TxnDate:doc.date,DocNumber:reference,PrivateNote:doc.description,CurrencyRef:{value:doc.currency},Line:lines.map(l=>({Description:l.description,Amount:Math.abs(cents(l.amount))/100,DetailType:'JournalEntryLineDetail',JournalEntryLineDetail:{PostingType:l.amount>0?'Debit':'Credit',AccountRef:{value:account(l.account)}}}))}}
 const payment=lines.find(l=>l.account==='bankAccountId'||l.account==='cashAccountId')
 if(payment){
  const receive=payment.amount>0
  const body={Type:receive?'RECEIVE':'SPEND',Contact:{Name:doc.contactName||'OnClock payroll and employee expenses'},BankAccount:{AccountID:account(payment.account)},Date:doc.date,Reference:reference,Status:'AUTHORISED',LineAmountTypes:'NoTax',LineItems:lines.filter(l=>l!==payment).map(l=>({Description:l.description,Quantity:1,UnitAmount:(receive?-1:1)*l.amount,AccountCode:account(l.account),TaxType:'NONE'}))}
  return {path:'/BankTransactions',entity:'BankTransactions',idField:'BankTransactionID',body:{BankTransactions:[body]}}
 }
 return {path:'/ManualJournals',entity:'ManualJournals',idField:'ManualJournalID',body:{ManualJournals:[{Date:doc.date,Narration:`${reference} ${doc.description}`,Status:'POSTED',LineAmountTypes:'NoTax',JournalLines:lines.map(l=>({Description:l.description,LineAmount:l.amount,AccountCode:account(l.account),TaxType:'NONE'}))}]}}
}
