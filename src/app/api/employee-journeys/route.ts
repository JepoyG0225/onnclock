import {NextRequest,NextResponse} from 'next/server'
import {requireAuth} from '@/lib/api-auth'
import {ctxHasPermission} from '@/lib/auth/effective-permissions'
import {prisma} from '@/lib/prisma'
import {requireHrisProApi} from '@/lib/hris-pro'
export async function GET(req:NextRequest){
 const {ctx,error}=await requireAuth();if(error)return error
 const gate=await requireHrisProApi(ctx.companyId);if(gate)return gate
 const own=req.nextUrl.searchParams.get('scope')==='mine'
 const [canOnboard,canOffboard,canFinalPay,employee]=await Promise.all([ctxHasPermission(ctx,'onboarding:manage'),ctxHasPermission(ctx,'offboarding:manage'),ctxHasPermission(ctx,'payroll:read'),prisma.employee.findFirst({where:{companyId:ctx.companyId,userId:ctx.userId},select:{id:true}})])
 if(!own&&!canOnboard&&!canOffboard&&!canFinalPay)return NextResponse.json({error:'Journey access is not assigned to your role.'},{status:403})
 if(own&&!employee)return NextResponse.json({error:'Employee profile not found'},{status:404})
 const requested=req.nextUrl.searchParams.get('employeeId')
 const employeeId=own?employee!.id:requested??undefined
 const [onboarding,offboarding]=await Promise.all([
 own||canOnboard?prisma.onboardingProcess.findMany({where:{companyId:ctx.companyId,...(employeeId?{employeeId}:{})},include:{employee:{select:{firstName:true,lastName:true,employeeNo:true}},steps:{orderBy:{sortOrder:'asc'}}},orderBy:{createdAt:'desc'},take:200}):[],
 own||canOffboard||canFinalPay&&!!requested?prisma.offboardingProcess.findMany({where:{companyId:ctx.companyId,...(employeeId?{employeeId}:{})},include:{employee:{select:{firstName:true,lastName:true,employeeNo:true}},items:{orderBy:{sortOrder:'asc'}}},orderBy:{createdAt:'desc'},take:200}):[]])
 const staffIds=[...new Set(onboarding.flatMap(p=>p.steps.map(s=>s.assigneeUserId)).filter((id):id is string=>!!id))]
 const staff=await prisma.userCompany.findMany({where:{companyId:ctx.companyId,userId:{in:staffIds}},select:{userId:true,user:{select:{name:true}}}})
 const journeys=[...onboarding.map(p=>({id:p.id,employeeId:p.employeeId,name:`${p.employee.lastName}, ${p.employee.firstName}`,employeeNo:p.employee.employeeNo,type:'ONBOARDING',status:p.status,canManage:!own&&canOnboard,steps:p.steps.map(s=>({id:s.id,title:s.title,done:s.status==='COMPLETED'||s.status==='SKIPPED',required:s.isRequired,dueDate:s.dueDate,owner:staff.find(u=>u.userId===s.assigneeUserId)?.user.name??'Unassigned',category:s.stepType}))})),...offboarding.map(p=>({id:p.id,employeeId:p.employeeId,name:`${p.employee.lastName}, ${p.employee.firstName}`,employeeNo:p.employee.employeeNo,type:'CLEARANCE',status:p.status,canManage:!own&&canOffboard,steps:p.items.map(s=>({id:s.id,title:s.title,done:s.isDone,required:true,dueDate:p.lastWorkingDate,owner:s.category,category:s.category}))}))]
 return NextResponse.json({journeys,canOnboard:!own&&canOnboard,canOffboard:!own&&canOffboard,canFinalPay:!own&&canFinalPay},{headers:{'Cache-Control':'private, no-store'}})
}
