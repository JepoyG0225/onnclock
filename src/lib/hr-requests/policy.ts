import { z } from 'zod'
import { dateOnly } from '@/lib/expenses/policy'
export const requestCategories = ['Certificate of Employment', 'Employment Verification', 'Payroll Clarification', 'Profile Correction', 'Other HR Request'] as const
export const requestStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_EMPLOYEE', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const
export const createRequestSchema = z.object({ requestKey: z.string().uuid(), payslipId:z.string().min(1).optional(), payslipAmount:z.number().finite().optional(), payslipItem:z.string().trim().min(1).max(200).optional(), category: z.enum(requestCategories), subject: z.string().trim().min(3).max(150), description: z.string().trim().min(5).max(5000), neededBy: dateOnly.optional().nullable() })
export const updateRequestSchema = z.discriminatedUnion('action', [
 z.object({action:z.literal('MESSAGE'),body:z.string().trim().min(1).max(5000),internal:z.boolean().default(false)}),
 z.object({action:z.literal('MANAGE'),updatedAt:z.string().datetime(),status:z.enum(requestStatuses),priority:z.enum(['NORMAL','HIGH']),assigneeId:z.string().nullable(),neededBy:dateOnly.nullable(),resolution:z.string().trim().max(5000).nullable()}),
 z.object({action:z.enum(['CANCEL','REOPEN']),updatedAt:z.string().datetime()}),
])
export function requestActionError(action: string, status: string, owner: boolean, manager: boolean, internal = false) {
 if (!manager && !owner) return 'Access denied.'
 if ((action === 'MANAGE' || internal) && !manager) return 'HR request management permission is required.'
 if (action === 'CANCEL' && (!owner || !['OPEN','IN_PROGRESS','WAITING_EMPLOYEE'].includes(status))) return 'Only the requester can cancel an open request.'
 if (action === 'REOPEN' && (!owner || !['RESOLVED','CLOSED'].includes(status))) return 'Only the requester can reopen a resolved or closed request.'
 if (action === 'MESSAGE' && ['CLOSED','CANCELLED'].includes(status)) return 'Reopen the request before adding a reply.'
 return null
}
