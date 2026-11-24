import { requireAuth } from '@/lib/api-auth'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
import { kinds, permissions, type Kind } from './policy'
export async function hrAccess() {
  const auth=await requireAuth()
  if(auth.error)return {...auth,employeeId:null,kinds:[] as Kind[],granted:[] as string[]}
  const [granted,employee]=await Promise.all([getEffectivePermissions(auth.ctx.role,auth.ctx.companyId,auth.ctx.userId),prisma.employee.findFirst({where:{companyId:auth.ctx.companyId,userId:auth.ctx.userId,isActive:true},select:{id:true}})])
  return {...auth,employeeId:employee?.id??null,granted,kinds:kinds.filter(k=>(granted.includes(permissions[k])||(k==='SALARY_CHANGE'&&granted.includes('salarychanges:approve'))))}
}
export const personSelect={id:true,firstName:true,lastName:true,employeeNo:true} as const
export const fileSelect={id:true,fileName:true,mime:true,size:true,createdAt:true} as const
export function ownVisible(kind:string,status:string) {return kind==='PROFILE_CHANGE'||(kind==='DOCUMENT'&&['ISSUED','ACKNOWLEDGED','VOID'].includes(status))}
