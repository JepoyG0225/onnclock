import {prisma} from '@/lib/prisma'
import {phToday} from './policy'
import {jsonData} from './service'
/** Deterministic keys prevent repeat tracker creation by concurrent cron runs. */
export async function syncExpiryRecords(companyId?:string){
 const until=new Date(phToday()+'T00:00:00Z');until.setUTCDate(until.getUTCDate()+30)
 const [documents,certifications]=await Promise.all([
 prisma.employeeDocument.findMany({where:{expiresAt:{lte:until},employee:{isActive:true,...(companyId?{companyId}:{})}},include:{employee:{select:{companyId:true}}}}),
 prisma.employeeCertification.findMany({where:{expiryDate:{lte:until},employee:{isActive:true,...(companyId?{companyId}:{})}},include:{employee:{select:{companyId:true}}}})])
 const sources=[...documents.map(d=>({type:'DOCUMENT',id:d.id,employeeId:d.employeeId,companyId:d.employee.companyId,title:d.documentType,date:d.expiresAt!})),...certifications.map(d=>({type:'CERTIFICATION',id:d.id,employeeId:d.employeeId,companyId:d.employee.companyId,title:d.name,date:d.expiryDate!}))]
 let created=0
 for(const s of sources){const date=s.date.toISOString().slice(0,10),requestKey=`expiry:${s.type}:${s.id}:${date}`
 const result=await prisma.hrOperation.createMany({skipDuplicates:true,data:[{companyId:s.companyId,employeeId:s.employeeId,requestKey,kind:'EXPIRY',title:`${s.title} expiry`.slice(0,200),status:'OPEN',dueDate:s.date,createdBy:'system-expiry-monitor',data:jsonData({documentType:s.title,expiryDate:date,reference:'',renewedDate:null,notes:'Update or renew the source record after review.',sourceType:s.type,sourceId:s.id})}]});created+=result.count
 }
 // Close automatic alerts when the source was removed, renewed or the employee deactivated.
 const existing=await prisma.hrOperation.findMany({where:{...(companyId?{companyId}:{}),kind:'EXPIRY',status:{in:['OPEN','IN_REVIEW']},createdBy:'system-expiry-monitor'}})
 for(const r of existing){const d=r.data as {sourceType:string;sourceId:string;expiryDate:string};if(sources.some(s=>s.id===d.sourceId&&s.type===d.sourceType&&s.date.toISOString().slice(0,10)===d.expiryDate))continue
 await prisma.hrOperation.updateMany({where:{id:r.id,version:r.version,status:{in:['OPEN','IN_REVIEW']}},data:{status:'CANCELLED',version:{increment:1},data:jsonData({...d,notes:'Source expiry changed, source removed, or employee is inactive. This automatic alert is closed.'})}})
 }
 return created
}
