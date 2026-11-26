import { paperSizeSchema } from './document-paper'
import { documentHeaderSchema } from './document-header'
import { z } from 'zod'
import { dateOnly } from '@/lib/expenses/policy'
import type { Permission } from '@/lib/auth/permissions'

export const kinds = ['CONTRACT', 'EXPIRY', 'COMPLIANCE', 'TEMPLATE', 'DOCUMENT', 'SSS_CASE', 'WAGE_ORDER', 'PROFILE_CHANGE', 'SALARY_CHANGE', 'SAFETY_INCIDENT'] as const
export type Kind = typeof kinds[number]
export const permissions: Record<Kind, Permission> = {
  EXPIRY:'documents:manage',
  SALARY_CHANGE: 'salarychanges:manage', SAFETY_INCIDENT: 'safety:manage',
  CONTRACT: 'contracts:manage', COMPLIANCE: 'compliance:manage', TEMPLATE: 'documents:manage', DOCUMENT: 'documents:manage',
  SSS_CASE: 'ssscases:manage', WAGE_ORDER: 'wageorders:manage', PROFILE_CHANGE: 'profilechanges:manage',
}
export const names: Record<Kind, string> = { EXPIRY:'Document & certification expiry', SALARY_CHANGE: 'Salary changes', SAFETY_INCIDENT: 'Workplace safety', CONTRACT: 'Contracts & regularization', COMPLIANCE: 'Government compliance', TEMPLATE: 'Document templates', DOCUMENT: 'Issued documents', SSS_CASE: 'SSS benefit cases', WAGE_ORDER: 'Wage-order checks', PROFILE_CHANGE: 'Profile changes & privacy' }
export const statuses: Record<Kind, readonly string[]> = {
  EXPIRY:['OPEN','IN_REVIEW','RENEWED','CANCELLED'],
  SALARY_CHANGE: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  SAFETY_INCIDENT: ['OPEN', 'INVESTIGATING', 'ACTION_REQUIRED', 'MONITORING', 'COMPLETED', 'CANCELLED'],
  CONTRACT: ['OPEN', 'IN_REVIEW', 'REGULARIZED', 'RENEWED', 'ENDED', 'CANCELLED'],
  COMPLIANCE: ['OPEN', 'PREPARING', 'SUBMITTED', 'PAID', 'COMPLETED', 'CANCELLED'],
  TEMPLATE: ['ACTIVE', 'ARCHIVED'], DOCUMENT: ['ISSUED', 'ACKNOWLEDGED', 'VOID'],
  SSS_CASE: ['OPEN', 'NOTIFIED', 'ADVANCED', 'FILED', 'APPROVED', 'REIMBURSED', 'REJECTED', 'CANCELLED'],
  WAGE_ORDER: ['ACTIVE', 'ARCHIVED'], PROFILE_CHANGE: ['PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED'],
}
export const terminal = ['PAID','REGULARIZED', 'RENEWED', 'ENDED', 'CANCELLED', 'COMPLETED', 'ARCHIVED', 'ACKNOWLEDGED', 'VOID', 'REIMBURSED', 'REJECTED', 'APPROVED', 'APPLIED']
const text = z.string().trim().max(5000).default('')
const short = z.string().trim().max(200).default('')
const optionalDate = dateOnly.nullable().default(null)
const money = z.coerce.number().finite().min(0).max(999999999).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001, 'Use two decimal places.')
export const payloadSchemas = {
  EXPIRY:z.object({documentType:z.string().trim().min(1).max(200),expiryDate:dateOnly,reference:short,renewedDate:optionalDate,notes:text}),
  SALARY_CHANGE: z.object({ effectiveDate: dateOnly, amount: money.refine(n=>n>0,'Enter a positive salary / rate.'), reason: z.string().trim().min(5).max(5000), changeType: z.enum(['INCREASE','PROMOTION','CORRECTION','OTHER']), notes: text }),
  SAFETY_INCIDENT: z.object({ incidentDate: dateOnly, incidentTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'Enter the incident time.'), location:z.string().trim().min(1).max(200), category:z.enum(['NEAR_MISS','INJURY','ILLNESS','PROPERTY_DAMAGE','OTHER']), severity:z.enum(['LOW','MODERATE','SERIOUS','FATAL']), description:z.string().trim().min(10).max(5000), witnesses:text, immediateAction:text, injuryDetails:text, lostDays:z.coerce.number().int().min(0).max(36500), rootCause:text, investigationFindings:text, correctiveActions:z.array(z.object({description:z.string().trim().min(3).max(1000),ownerId:z.string().min(1),dueDate:dateOnly,completedDate:optionalDate,effectiveness:text})).max(50).default([]), officialReference:short, reportedDate:optionalDate, closureNotes:text, notes:text }),
  CONTRACT: z.object({ contractType: z.enum(['PROBATIONARY', 'FIXED_TERM', 'PROJECT', 'OTHER']), startDate: dateOnly, endDate: optionalDate, effectiveDate: optionalDate, notes: text }),
  COMPLIANCE: z.object({ agency: z.enum(['BIR', 'SSS', 'PHILHEALTH', 'PAGIBIG', 'DOLE', 'OTHER']), form: z.string().trim().min(1).max(150), period: z.string().trim().min(1).max(100), reference: short, submittedDate: optionalDate, paidAmount: money.default(0), reconciliationNote:text, notes: text }),
  TEMPLATE: z.object({ paperSize: paperSizeSchema, bodyFormat: z.enum(['PLAIN','HTML']).default('PLAIN'), header: documentHeaderSchema, footer: documentHeaderSchema, body: z.string().trim().min(10).max(20000), notes: text }),
  DOCUMENT: z.object({ templateId: z.string().min(1), purpose: short, signatory: z.string().trim().min(1).max(200) }),
  SSS_CASE: z.object({ benefit: z.enum(['MATERNITY', 'SICKNESS']), startDate: dateOnly, endDate: dateOnly, notificationDate: optionalDate, filingDate: optionalDate, reference: short, approvedAmount: money.default(0), advancePaid: money.default(0), reimbursedAmount: money.default(0), reimbursementDate: optionalDate, checklist: z.array(z.enum(['NOTIFICATION', 'SUPPORTING_DOCUMENTS', 'ADVANCE_PROOF', 'EMPLOYEE_CONFIRMATION', 'FILING_RECEIPT', 'REIMBURSEMENT_PROOF'])).default([]), notes: text }),
  WAGE_ORDER: z.object({ region: z.string().trim().min(1).max(100), sector: z.string().trim().min(1).max(200), orderNumber: z.string().trim().min(1).max(100), effectiveDate: dateOnly, minimumDaily: money.refine(n=>n>0), hoursPerDay: z.coerce.number().positive().max(24), monthlyDivisor: z.coerce.number().positive().max(366), sourceUrl: z.string().url().max(1000).refine(s=>{const u=new URL(s);return u.protocol==='https:'&&(u.hostname==='nwpc.dole.gov.ph'||u.hostname.endsWith('.dole.gov.ph'))}, 'Use an official HTTPS NWPC or DOLE source.'), employeeIds: z.array(z.string().min(1)).min(1).max(5000), notes: text }),
}
export const operationSchema = z.object({ requestKey: z.string().uuid(), previewHash:z.string().length(64).optional(), kind: z.enum(kinds).exclude(['PROFILE_CHANGE']), title: z.string().trim().min(3).max(200), employeeId: z.string().nullable().default(null), ownerId: z.string().nullable().default(null), dueDate: optionalDate, data: z.unknown() })
export const editSchema = operationSchema.omit({requestKey:true,kind:true}).extend({ version: z.number().int().positive(), status: z.string() })
export const actionSchema = z.object({action:z.enum(['ACKNOWLEDGE','VOID','APPROVE','REJECT','CANCEL']),version:z.number().int().positive(),note:z.string().trim().max(2000).default('')})
export const settingsSchema = z.object({profileApproval:z.boolean(),retentionReviewDays:z.number().int().min(30).max(3650),privacyContact:z.string().trim().max(200),privacyNotice:z.string().trim().max(5000)})
export const defaultSettings = { profileApproval:false, retentionReviewDays:365, privacyContact:'', privacyNotice:'' }
export function readSettings(value:unknown) { const p=settingsSchema.safeParse(value);return p.success?p.data:defaultSettings }
export function phToday() { return new Date(Date.now()+8*3600000).toISOString().slice(0,10) }
export function validateState(kind:Kind,status:string,data:Record<string,unknown>,dueDate:string|null) {
  if(!statuses[kind].includes(status)) return 'Invalid status for this record.'
  if(['CONTRACT','COMPLIANCE','SSS_CASE'].includes(kind)&&!dueDate)return 'Set the next review or filing due date.'
  if(data.startDate&&data.endDate&&String(data.startDate)>String(data.endDate))return 'End date must be on or after the start date.'
  if(kind==='CONTRACT'&&status==='REGULARIZED'&&(!data.effectiveDate||String(data.effectiveDate)>phToday()))return 'Enter a regularization effective date on or before today.'
  if(kind==='CONTRACT'&&['REGULARIZED','RENEWED','ENDED'].includes(status)&&!data.notes)return 'Record the decision and reason in Notes.'
  if(kind==='COMPLIANCE'&&['SUBMITTED','PAID','COMPLETED'].includes(status)&&(!data.reference||!data.submittedDate))return 'Record the submission date and official reference.'
  if(kind==='COMPLIANCE'&&status==='PAID'&&!(Number(data.paidAmount)>0))return 'Record the amount paid before marking this obligation paid.'
  if(kind==='EXPIRY'&&!dueDate)return 'Set the next review date.'
  if(kind==='EXPIRY'&&status==='RENEWED'&&(!data.renewedDate||!data.notes))return 'Record the renewal date and notes.'
  if(kind==='SAFETY_INCIDENT') {
    if(String(data.incidentDate)>phToday())return 'Incident date cannot be in the future.'
    if(!dueDate)return 'Set the next safety review date.'
    const actions=data.correctiveActions as {completedDate:string|null;dueDate:string;effectiveness:string}[]
    if(actions.some(a=>!a.completedDate&&a.dueDate<dueDate))return 'Set the next review date on or before the earliest pending corrective action.'
    if(actions.some(a=>a.completedDate&&a.completedDate>phToday()))return 'Completion dates cannot be in the future.'
    if(data.reportedDate&&(!data.officialReference||String(data.reportedDate)<String(data.incidentDate)||String(data.reportedDate)>phToday()))return 'Enter the official reference and a valid reporting date.'
    if(['ACTION_REQUIRED','MONITORING','COMPLETED'].includes(status)&&(!data.rootCause||!data.investigationFindings||!actions.length))return 'Record investigation findings, root cause, and corrective actions.'
    if(status==='COMPLETED'&&(!data.closureNotes||actions.some(a=>!a.completedDate||!a.effectiveness)))return 'Complete and verify every corrective action and enter closure notes.'
    if(status==='CANCELLED'&&!data.closureNotes)return 'Explain the cancellation in closure notes.'
  }
  if(kind==='SSS_CASE') {
    if(['NOTIFIED','ADVANCED','FILED','APPROVED','REIMBURSED'].includes(status)&&!data.notificationDate)return 'Record the notification date.'
    if(['FILED','APPROVED','REIMBURSED'].includes(status)&&(!data.filingDate||!data.reference))return 'Record the filing date and SSS reference.'
    if(status==='ADVANCED'&&Number(data.advancePaid)<=0)return 'Enter the amount advanced to the employee.'
    if(status==='REIMBURSED'&&(!data.reimbursementDate||Number(data.reimbursedAmount)<=0))return 'Record the reimbursement date and amount.'
    if(Number(data.reimbursedAmount)>Number(data.approvedAmount))return 'Reimbursement cannot exceed the approved benefit.'
  }
  return null
}
export const templateVariables = ['employee_name','employee_number','company_name','position','department','hire_date','employment_status','date_issued','purpose','signatory'] as const
export function renderTemplate(body:string,variables:Record<string,string>) {
  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,rawKey:string)=>{const key=rawKey.trim();if(!(templateVariables as readonly string[]).includes(key))throw new Error(`Unknown variable: ${key}`);return variables[key]??''})
}
export const starterTemplates = {
  'Certificate of Employment': 'CERTIFICATE OF EMPLOYMENT\n\nThis certifies that {{employee_name}} ({{employee_number}}) is employed by {{company_name}} as {{position}} in {{department}} since {{hire_date}}. Employment status: {{employment_status}}.\n\nIssued on {{date_issued}} for {{purpose}}.\n\n{{signatory}}\nAuthorized signatory',
  'Regularization notice': 'REGULARIZATION NOTICE\n\nDear {{employee_name}},\n\n{{purpose}}\n\nIssued by {{company_name}} on {{date_issued}}.\n\n{{signatory}}',
  'Policy acknowledgment': 'POLICY ACKNOWLEDGMENT\n\n{{company_name}}\nEmployee: {{employee_name}} ({{employee_number}})\n\n{{purpose}}\n\nIssued on {{date_issued}} by {{signatory}}.\nAcknowledgment records receipt of this document.',
}
export function wageResult(employee:{rateType:string;basicSalary:unknown;dailyRate:unknown;hourlyRate:unknown},rule:{minimumDaily:number;monthlyDivisor:number;hoursPerDay:number}) {
  const daily=employee.rateType==='MONTHLY'?Number(employee.basicSalary)*12/rule.monthlyDivisor:employee.rateType==='HOURLY'?Number(employee.hourlyRate)*rule.hoursPerDay:employee.dailyRate==null?NaN:Number(employee.dailyRate)
  if(!Number.isFinite(daily)||daily<=0)return {daily:null,gap:null,status:'MISSING_RATE'}
  const gap=Math.round((daily-rule.minimumDaily)*100)/100
  return {daily:Math.round(daily*100)/100,gap,status:gap<0?'BELOW_MINIMUM':'MEETS_CONFIGURED_RATE'}
}
