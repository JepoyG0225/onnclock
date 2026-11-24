import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess } from '@/lib/hr-center/access'
export async function GET() {
 const a=await hrAccess();if(a.error)return a.error
 if(!a.employeeId)return NextResponse.json({error:'Active employee profile required.'},{status:403})
 const [profile,changes,documents]=await Promise.all([
  prisma.employee.findFirst({where:{id:a.employeeId,companyId:a.ctx.companyId},select:{employeeNo:true,firstName:true,lastName:true,middleName:true,suffix:true,gender:true,birthDate:true,civilStatus:true,nationality:true,personalEmail:true,workEmail:true,mobileNo:true,presentAddress:true,permanentAddress:true,sssNo:true,tinNo:true,philhealthNo:true,pagibigNo:true,hireDate:true,employmentStatus:true,regularizationDate:true}}),
  prisma.hrOperation.findMany({where:{companyId:a.ctx.companyId,employeeId:a.employeeId,kind:'PROFILE_CHANGE'},select:{title:true,status:true,data:true,createdAt:true,updatedAt:true}}),
  prisma.hrOperation.findMany({where:{companyId:a.ctx.companyId,employeeId:a.employeeId,kind:'DOCUMENT'},select:{title:true,status:true,data:true,createdAt:true,acknowledgedAt:true}}),
 ])
 return new NextResponse(JSON.stringify({exportedAt:new Date().toISOString(),scope:'Employee profile, profile change history and issued HR documents',profile,changes,documents},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="my-hr-data.json"','Cache-Control':'private, no-store'}})
}
