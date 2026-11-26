import {NextRequest,NextResponse} from 'next/server'
import {requireAuth} from '@/lib/api-auth'
import {ctxHasPermission} from '@/lib/auth/effective-permissions'
import {prisma} from '@/lib/prisma'
import {agencies,agencyNames,remittanceAmount,payrollCost,monthBounds,type Agency} from '@/lib/payroll/operations'
import {dateOnly} from '@/lib/expenses/policy'
import {z} from 'zod'
import {jsonData} from '@/lib/hr-center/service'
export async function GET(req:NextRequest){
 const {ctx,error}=await requireAuth();if(error)return error
 if(!await ctxHasPermission(ctx,'payroll:read'))return NextResponse.json({error:'Payroll read permission required.'},{status:403})
 try{
 const month=req.nextUrl.searchParams.get('month')??new Date(Date.now()+8*3600000).toISOString().slice(0,7),bounds=monthBounds(month),runId=req.nextUrl.searchParams.get('runId'),canTrack=await ctxHasPermission(ctx,'compliance:manage')
 const runs=await prisma.payrollRun.findMany({where:{companyId:ctx.companyId,status:{in:['COMPUTED','FOR_APPROVAL','APPROVED','LOCKED','DISBURSED']}},select:{id:true,periodLabel:true,status:true,payDate:true},orderBy:{payDate:'desc'},take:100})
 const [slips,records,costSlips]=await Promise.all([
 canTrack?prisma.payslip.findMany({where:{payrollRun:{companyId:ctx.companyId,payDate:bounds,status:{in:['APPROVED','LOCKED','DISBURSED']}}},include:{employee:{select:{employeeNo:true,firstName:true,lastName:true}},payrollRun:{select:{periodLabel:true}}}}):[],
 canTrack?prisma.hrOperation.findMany({where:{companyId:ctx.companyId,kind:'COMPLIANCE',data:{path:['period'],equals:month}},orderBy:{createdAt:'desc'}}):[],
 runId?prisma.payslip.findMany({where:{payrollRunId:runId,payrollRun:{companyId:ctx.companyId,status:{in:['COMPUTED','FOR_APPROVAL','APPROVED','LOCKED','DISBURSED']}}},include:{employee:{select:{id:true,employeeNo:true,firstName:true,lastName:true,department:{select:{name:true}}}}}}):[]])
 const remittances=agencies.map(agency=>({agency,name:agencyNames[agency],expected:Number(slips.reduce((n,s)=>n+remittanceAmount(s as unknown as Record<string,unknown>,agency),0).toFixed(2)),record:records.find(r=>(r.data as {remittanceType?:string}).remittanceType===agency)??null,rows:slips.map(s=>({employeeNo:s.employee.employeeNo,name:`${s.employee.lastName}, ${s.employee.firstName}`,period:s.payrollRun.periodLabel,amount:remittanceAmount(s as unknown as Record<string,unknown>,agency)}))}))
 return NextResponse.json({month,runs,canTrack,remittances,costs:costSlips.map(s=>({id:s.employeeId,name:`${s.employee.lastName}, ${s.employee.firstName}`,employeeNo:s.employee.employeeNo,department:s.employee.department?.name??'Unassigned',...payrollCost(s as unknown as Record<string,unknown>),ot:Number(s.regularOtAmount)+Number(s.restDayOtAmount)+Number(s.holidayOtAmount),other:Number(s.otherEarnings),accrual:Number(s.thirteenthMonthContribution)}))},{headers:{'Cache-Control':'no-store'}})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to load payroll operations'},{status:422})}
}
const schema=z.object({month:z.string(),agency:z.enum(agencies),dueDate:dateOnly})
export async function POST(req:NextRequest){
 const {ctx,error}=await requireAuth();if(error)return error
 if(!await ctxHasPermission(ctx,'payroll:read')||!await ctxHasPermission(ctx,'compliance:manage'))return NextResponse.json({error:'Payroll read and compliance management permissions required.'},{status:403})
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:422})
 try{const {month,agency,dueDate}=parsed.data,bounds=monthBounds(month)
 const record=await prisma.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.companyId}))`
 const requestKey=`remittance:${ctx.companyId}:${month}:${agency}`
 const prior=await tx.hrOperation.findUnique({where:{requestKey}});if(prior)return prior
 const slips=await tx.payslip.findMany({where:{payrollRun:{companyId:ctx.companyId,payDate:bounds,status:{in:['APPROVED','LOCKED','DISBURSED']}}},include:{employee:{select:{employeeNo:true,firstName:true,lastName:true}},payrollRun:{select:{periodLabel:true}}}})
 if(!slips.length)throw Error('No finalized payrolls with pay dates in this month.')
 const rows=slips.map(s=>({payslipId:s.id,runId:s.payrollRunId,employeeNo:s.employee.employeeNo,name:`${s.employee.lastName}, ${s.employee.firstName}`,period:s.payrollRun.periodLabel,amount:remittanceAmount(s as unknown as Record<string,unknown>,agency as Agency)})),expected=Number(rows.reduce((n,s)=>n+s.amount,0).toFixed(2))
 return tx.hrOperation.create({data:{requestKey,companyId:ctx.companyId,kind:'COMPLIANCE',title:`${agencyNames[agency]} - ${month}`,status:'PREPARING',dueDate:new Date(dueDate+'T00:00:00Z'),createdBy:ctx.userId,data:jsonData({agency:agency.replace('_LOANS',''),form:agencyNames[agency],period:month,reference:'',submittedDate:null,paidAmount:0,notes:'Prepared from finalized payrolls by pay-date month. Reconcile against the agency billing before payment.',remittanceType:agency,remittanceSnapshot:{expected,rows,preparedAt:new Date().toISOString()}}),events:{create:{actorId:ctx.userId,action:'PREPARED_FROM_PAYROLL',detail:jsonData({expected,sourceCount:slips.length})}}}})
 },{timeout:30000});return NextResponse.json({id:record.id})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to prepare remittance'},{status:409})}
}
