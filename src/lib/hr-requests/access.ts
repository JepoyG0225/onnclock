import { requireAuth } from '@/lib/api-auth'
import { ctxHasPermission, getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { prisma } from '@/lib/prisma'
export async function hrRequestAccess() {
 const auth = await requireAuth()
 if (auth.error) return {...auth, employeeId:null, canManage:false}
 const [employee,canManage] = await Promise.all([
  prisma.employee.findFirst({where:{companyId:auth.ctx.companyId,userId:auth.ctx.userId,isActive:true},select:{id:true}}),
  ctxHasPermission(auth.ctx,'hrrequests:manage'),
 ])
 return {...auth,employeeId:employee?.id ?? null,canManage}
}
export async function hrRequestAssignees(companyId:string) {
 const users=await prisma.userCompany.findMany({where:{companyId,isActive:true,user:{isActive:true}},select:{userId:true,role:true,user:{select:{name:true,email:true}}}})
 const result=[]
 for(const member of users) if((await getEffectivePermissions(member.role,companyId,member.userId)).includes('hrrequests:manage')) result.push({id:member.userId,name:member.user.name || member.user.email})
 return result
}
export const attachmentSelect={id:true,fileName:true,mime:true,size:true,isDeliverable:true,createdAt:true} as const
