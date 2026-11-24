import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hrAccess } from '@/lib/hr-center/access'
import { dateOnly } from '@/lib/expenses/policy'
export async function GET(req:NextRequest){
 const a=await hrAccess();if(a.error)return a.error
 if(!a.kinds.includes('SAFETY_INCIDENT'))return NextResponse.json({error:'Access denied.'},{status:403})
 const from=req.nextUrl.searchParams.get('from'),to=req.nextUrl.searchParams.get('to')
 if(!dateOnly.safeParse(from).success||!dateOnly.safeParse(to).success||from!>to!)return NextResponse.json({error:'Enter a valid incident date range.'},{status:422})
 const records=await prisma.hrOperation.findMany({where:{companyId:a.ctx.companyId,kind:'SAFETY_INCIDENT',AND:[{data:{path:['incidentDate'],gte:from!}},{data:{path:['incidentDate'],lte:to!}}]},include:{employee:{select:{employeeNo:true,firstName:true,lastName:true}}},orderBy:{createdAt:'asc'},take:10001})
 if(records.length>10000)return NextResponse.json({error:'Choose a shorter date range (maximum 10,000 incidents per export).'},{status:422})
 const owners=await prisma.userCompany.findMany({where:{companyId:a.ctx.companyId},select:{userId:true,user:{select:{name:true}}}})
 const fields=['incidentDate','incidentTime','location','category','severity','description','witnesses','immediateAction','injuryDetails','lostDays','rootCause','investigationFindings','reportedDate','officialReference','closureNotes','notes']
 const header=['Record ID','Title','Employee number','Employee','Status','Review due',...fields,'Corrective actions']
 const rows=records.map(r=>{const d=r.data as Record<string,unknown>;const actions=(d.correctiveActions as {description:string;ownerId:string;dueDate:string;completedDate:string|null;effectiveness:string}[]??[]).map((x,i)=>`${i+1}. ${x.description}; owner: ${owners.find(o=>o.userId===x.ownerId)?.user.name??x.ownerId}; due: ${x.dueDate}; completed: ${x.completedDate??'Pending'}; verification: ${x.effectiveness}`).join(' | ');return [r.id,r.title,r.employee?.employeeNo??'',r.employee?[r.employee.firstName,r.employee.lastName].join(' '):'',r.status,r.dueDate?.toISOString().slice(0,10)??'',...fields.map(k=>d[k]??''),actions]})
 const cell=(v:unknown)=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
 const body='\uFEFF'+[header,...rows].map(row=>row.map(cell).join(',')).join('\r\n')
 return new NextResponse(body,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="safety-incidents-${from}-${to}.csv"`,'Cache-Control':'private, no-store'}})
}
