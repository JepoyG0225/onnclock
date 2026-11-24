import { readPaperSize } from './document-paper'
import { cleanDocumentHtml, escapeDocumentText } from './document-body'
import { readDocumentHeader } from './document-header'
import sharp from 'sharp'
import { getEffectivePermissions } from '@/lib/auth/effective-permissions'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { payloadSchemas, renderTemplate, phToday, validateState, type Kind } from './policy'
export const jsonData=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue
export class HrError extends Error {constructor(message:string,public status=422){super(message)}}
export async function prepareData(companyId:string,kind:Exclude<Kind,'PROFILE_CHANGE'>,data:unknown,employeeId:string|null,ownerId:string|null,status:string,dueDate:string|null) {
 const parsed=payloadSchemas[kind].safeParse(data)
 if(!parsed.success)throw new HrError(parsed.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; '))
 const payload=parsed.data as Record<string,unknown>
 const violation=validateState(kind,status,payload,dueDate);if(violation)throw new HrError(violation)
 if(ownerId&&!await prisma.userCompany.findFirst({where:{companyId,userId:ownerId,isActive:true,user:{isActive:true}},select:{userId:true}}))throw new HrError('Choose an active owner from this company.')
 if(['CONTRACT','DOCUMENT','SSS_CASE','SALARY_CHANGE'].includes(kind)&&!employeeId)throw new HrError('Select an employee.')
 const employee=employeeId?await prisma.employee.findFirst({where:{id:employeeId,companyId},include:{position:{select:{title:true}},department:{select:{name:true}}}}):null
 if(employeeId&&!employee)throw new HrError('Employee not found in this company.')
 if(kind==='CONTRACT'&&status==='REGULARIZED'&&(!employee?.isActive||employee.employmentStatus!=='PROBATIONARY'))throw new HrError('Only an active probationary employee can be regularized from this tracker.')
 if(kind==='SALARY_CHANGE'&&!employee?.isActive)throw new HrError('Select an active employee.')
 if(kind==='SAFETY_INCIDENT') {
  const owners=[...new Set((payload.correctiveActions as {ownerId:string}[]).map(a=>a.ownerId))]
  const members=owners.length?await prisma.userCompany.findMany({where:{companyId,userId:{in:owners},isActive:true,user:{isActive:true}},select:{userId:true,role:true}}):[]
  if(members.length!==owners.length)throw new HrError('Corrective action owners must be active company users.')
  for(const member of members)if(!(await getEffectivePermissions(member.role,companyId,member.userId)).includes('safety:manage'))throw new HrError('Corrective action owners need Workplace safety permission to access the incident.')
 }
 if(kind==='WAGE_ORDER') {
  const ids=[...new Set(payload.employeeIds as string[])]
  if(await prisma.employee.count({where:{companyId,id:{in:ids}}})!==ids.length)throw new HrError('All assigned employees must belong to this company.')
  payload.employeeIds=ids
 }
 if(kind==='TEMPLATE'){
  if(payload.bodyFormat==='HTML'){payload.body=cleanDocumentHtml(String(payload.body));if(String(payload.body).replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim().length<10)throw new HrError('Enter at least 10 characters of document content.')} 
  for(const position of ['header','footer'] as const){
  const header=readDocumentHeader(payload[position])
  if(header.enabled&&!header.text&&!header.image)throw new HrError(`Add company details or a ${position} image.`)
  if(header.image){try{const image=await sharp(Buffer.from(header.image.split(',')[1],'base64'),{limitInputPixels:20_000_000}).rotate().resize({width:1600,height:600,fit:'inside',withoutEnlargement:true}).png().toBuffer();header.image='data:image/png;base64,'+image.toString('base64');if(header.image.length>1_000_000)throw new Error('Too large')}catch{throw new HrError(`Choose a smaller valid PNG or JPEG ${position} image.`)}}
  payload[position]=header
  }
  try{renderTemplate(String(payload.body),{})}catch(e){throw new HrError(e instanceof Error?e.message:'Invalid template variables.')}}
 if(kind==='DOCUMENT') {
  const template=await prisma.hrOperation.findFirst({where:{id:String(payload.templateId),companyId,kind:'TEMPLATE',status:'ACTIVE'}})
  if(!template||!employee)throw new HrError('Choose an active document template and employee.')
  const company=await prisma.company.findUniqueOrThrow({where:{id:companyId},select:{name:true}})
  const variables={employee_name:[employee.firstName,employee.middleName,employee.lastName,employee.suffix].filter(Boolean).join(' '),employee_number:employee.employeeNo,company_name:company.name,position:employee.position?.title??'',department:employee.department?.name??'',hire_date:employee.hireDate.toISOString().slice(0,10),employment_status:employee.employmentStatus.replaceAll('_',' '),date_issued:phToday(),purpose:String(payload.purpose),signatory:String(payload.signatory)}
  payload.paperSize=readPaperSize((template.data as Record<string,unknown>).paperSize)
  payload.bodyFormat=(template.data as Record<string,unknown>).bodyFormat==='HTML'?'HTML':'PLAIN'
  payload.body=payload.bodyFormat==='HTML'?cleanDocumentHtml(renderTemplate(cleanDocumentHtml(String((template.data as Record<string,unknown>).body)),Object.fromEntries(Object.entries(variables).map(([key,value])=>[key,escapeDocumentText(value)])))):renderTemplate(String((template.data as Record<string,unknown>).body),variables)
  payload.header=readDocumentHeader((template.data as Record<string,unknown>).header)
  payload.footer=readDocumentHeader((template.data as Record<string,unknown>).footer)
  payload.variables=variables;payload.templateVersion=template.version;payload.templateTitle=template.title
 }
 return {payload,employee}
}
export async function addEvent(tx:Prisma.TransactionClient,id:string,userId:string,action:string,detail:unknown) {await tx.hrOperationEvent.create({data:{operationId:id,actorId:userId,action,detail:jsonData(detail)}})}
export async function notifyEmployee(tx:Prisma.TransactionClient,employeeId:string|null,companyId:string,title:string,body:string) {
 if(!employeeId)return
 const employee=await tx.employee.findFirst({where:{id:employeeId,companyId,isActive:true},select:{userId:true}})
 if(employee?.userId)await tx.notification.create({data:{companyId,userId:employee.userId,type:'GENERIC',title,body,link:'/portal/hr-documents'}})
}
