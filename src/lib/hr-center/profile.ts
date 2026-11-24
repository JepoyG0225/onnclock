import { z } from 'zod'
import { dateOnly } from '@/lib/expenses/policy'
export const profileSchema=z.object({
 firstName:z.string().trim().min(1).max(100).optional(),lastName:z.string().trim().min(1).max(100).optional(),middleName:z.string().trim().max(100).nullable().optional(),suffix:z.string().trim().max(30).nullable().optional(),
 gender:z.enum(['MALE','FEMALE','OTHER']).optional(),birthDate:dateOnly.optional(),civilStatus:z.enum(['SINGLE','MARRIED','WIDOWED','LEGALLY_SEPARATED']).optional(),nationality:z.string().trim().min(1).max(100).optional(),
 personalEmail:z.union([z.string().email().max(200),z.literal('')]).nullable().optional(),mobileNo:z.string().trim().max(40).nullable().optional(),
 sssNo:z.string().trim().max(50).nullable().optional(),tinNo:z.string().trim().max(50).nullable().optional(),philhealthNo:z.string().trim().max(50).nullable().optional(),pagibigNo:z.string().trim().max(50).nullable().optional(),
})
export function normalized(value:unknown) { return value instanceof Date?value.toISOString().slice(0,10):value??null }
export function changesFor(existing:Record<string,unknown>,data:Record<string,unknown>) {
 const changes:Record<string,{before:unknown;after:unknown}>={}
 for(const [key,value] of Object.entries(data))if(value!==undefined&&normalized(existing[key])!==normalized(value))changes[key]={before:normalized(existing[key]),after:normalized(value)}
 return changes
}
export function approvedProfileData(existing:Record<string,unknown>,changes:Record<string,{before:unknown;after:unknown}>) {
 const proposed:Record<string,unknown>={}
 for(const [key,value] of Object.entries(changes)){if(normalized(existing[key])!==value.before)throw new Error('Employee data changed since submission. Reject this request and ask the employee to submit again.');proposed[key]=value.after}
 const data=profileSchema.parse(proposed)
 return {...data,...(data.birthDate?{birthDate:new Date(data.birthDate+'T00:00:00Z')}:{})}
}
