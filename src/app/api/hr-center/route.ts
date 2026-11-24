import { createHash } from 'node:crypto'
import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { hrAccess,personSelect } from '@/lib/hr-center/access'
import { kinds,operationSchema,readSettings, type Kind } from '@/lib/hr-center/policy'
import { prepareData,jsonData,addEvent,notifyEmployee,HrError } from '@/lib/hr-center/service'
export async function GET(req:NextRequest) {
 const a=await hrAccess();if(a.error)return a.error
 const q=req.nextUrl.searchParams,kind=q.get('kind') as Kind,portal=q.get('portal')==='true'
 if(!kinds.includes(kind))return NextResponse.json({error:'Select an HR Center section.'},{status:422})
 const manager=a.kinds.includes(kind)&&!portal
 if(!manager&&(!['DOCUMENT','PROFILE_CHANGE'].includes(kind)||!a.employeeId))return NextResponse.json({error:'Access denied.'},{status:403})
 const page=Math.max(1,Math.min(10000,Math.floor(Number(q.get('page'))||1))),search=(q.get('q')??'').trim().slice(0,100)
 const scope:Prisma.HrOperationWhereInput={companyId:a.ctx.companyId,kind,...(!manager?{employeeId:a.employeeId}:{})}
 const where:Prisma.HrOperationWhereInput={...scope,...(q.get('status')?{status:q.get('status')!}:{}),...(search?{OR:[
  {title:{contains:search,mode:'insensitive'}},
  {employee:{is:{OR:[{firstName:{contains:search,mode:'insensitive'}},{lastName:{contains:search,mode:'insensitive'}},{employeeNo:{contains:search,mode:'insensitive'}}]}}},
 ]}:{})}

 const [records,total,counts,employees,owners,templates,company,openReviews]=await Promise.all([
  prisma.hrOperation.findMany({where,include:{employee:{select:personSelect}},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*50,take:50}),prisma.hrOperation.count({where}),prisma.hrOperation.groupBy({where:scope,by:['status'],_count:true}),
  manager?prisma.employee.findMany({where:{companyId:a.ctx.companyId},select:{...personSelect,isActive:true,employmentStatus:true,hireDate:true,regularizationDate:true},orderBy:[{lastName:'asc'},{firstName:'asc'}]}):[],
  manager?prisma.userCompany.findMany({where:{companyId:a.ctx.companyId,isActive:true,user:{isActive:true}},select:{userId:true,user:{select:{name:true,email:true}}}}):[],
  manager&&kind==='DOCUMENT'?prisma.hrOperation.findMany({where:{companyId:a.ctx.companyId,kind:'TEMPLATE',status:'ACTIVE'},select:{id:true,title:true,data:true,version:true}}):[],
  kind==='PROFILE_CHANGE'?prisma.company.findUnique({where:{id:a.ctx.companyId},select:{hrOperationsSettings:true}}):null,
  manager&&kind==='CONTRACT'?prisma.hrOperation.findMany({where:{companyId:a.ctx.companyId,kind:'CONTRACT',status:{in:['OPEN','IN_REVIEW']}},select:{employeeId:true}}):[],
 ])
 return NextResponse.json({records,total,counts,employees,owners,templates,allowedKinds:a.kinds,canManage:manager,page,reviewEmployeeIds:openReviews.map(r=>r.employeeId),settings:readSettings(company?.hrOperationsSettings)},{headers:{'Cache-Control':'private, no-store'}})
}
export async function POST(req:NextRequest) {
 const a=await hrAccess();if(a.error)return a.error
 const parsed=operationSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:422})
 const {kind,requestKey,title,employeeId,ownerId,dueDate,data}=parsed.data
 if(!a.kinds.includes(kind)||(kind==='SALARY_CHANGE'&&!a.granted.includes('salarychanges:manage')))return NextResponse.json({error:'Access denied.'},{status:403})
 const status=kind==='TEMPLATE'||kind==='WAGE_ORDER'?'ACTIVE':kind==='DOCUMENT'?'ISSUED':kind==='SALARY_CHANGE'?'PENDING':'OPEN'
 try {
  const {payload,employee}=await prepareData(a.ctx.companyId,kind,data,employeeId,ownerId,status,dueDate)
  if(kind==='SALARY_CHANGE'){payload.rateType=employee!.rateType;payload.originalAmount=Number(employee!.basicSalary)}
  if(kind==='DOCUMENT'){
   const previewHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex')
   if(req.nextUrl.searchParams.get('preview')==='true')return NextResponse.json({preview:payload,previewHash})
   if(parsed.data.previewHash!==previewHash)throw new HrError('Document details changed or have not been previewed. Preview again before issuing.',409)
  }
  const record=await prisma.$transaction(async tx=>{
   if(kind==='CONTRACT'&&employeeId){
    await tx.$queryRaw`SELECT id FROM employees WHERE id=${employeeId} AND "companyId"=${a.ctx.companyId} FOR UPDATE`
    const prior=await tx.hrOperation.findFirst({where:{companyId:a.ctx.companyId,employeeId,kind:'CONTRACT',status:{in:['OPEN','IN_REVIEW']}}})
    if(prior&&prior.requestKey!==requestKey)throw new HrError('This employee already has an open contract review. Update that review first.',409)
   }
   const r=await tx.hrOperation.create({data:{companyId:a.ctx.companyId,requestKey,kind,title,employeeId,ownerId,dueDate:dueDate?new Date(dueDate+'T00:00:00Z'):null,status,data:jsonData(payload),createdBy:a.ctx.userId}})
   await addEvent(tx,r.id,a.ctx.userId,'CREATED',{title,status,data:payload})
   if(kind==='DOCUMENT')await notifyEmployee(tx,employeeId,a.ctx.companyId,'HR document issued',title)
   return r
  })
  return NextResponse.json({record},{status:201})
 }catch(e){
  if(e instanceof HrError)return NextResponse.json({error:e.message},{status:e.status})
  if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002'){
   const record=await prisma.hrOperation.findFirst({where:{companyId:a.ctx.companyId,requestKey,kind,createdBy:a.ctx.userId}})
   return record?NextResponse.json({record}):NextResponse.json({error:'Request reference already used.'},{status:409})
  }
  throw e
 }
}
