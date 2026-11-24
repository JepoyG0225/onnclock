'use client'
import { AppSpinner } from '@/components/ui/AppSpinner'

import { KpiCard } from '@/components/ui/kpi-card'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, BarChart3, BookOpen, Clock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CertificateTemplateManager } from './CertificateTemplateManager'
import { CourseCover } from './CourseCover'
import { EmployeeProgressSection, type LearningProgress } from './EmployeeProgressSection'

type Employee = { id:string; firstName:string; lastName:string; employeeNo:string }
type Enrollment = { id:string; status:string; dueDate:string|null; completedAt:string|null; score:number|null; employee:Employee; learningProgress:LearningProgress }
type Course = { certificateTemplateId?:string|null; id:string; title:string; thumbnailUrl:string|null; provider:string|null; category:string|null; durationHours:number|null; status:string; enrollments:Enrollment[] }
type Certification = { hasTemplate:boolean; id:string; name:string; issuingBody:string|null; credentialId:string|null; issuedDate:string|null; expiryDate:string|null; certificateUrl:string|null; employee:Employee }
const renderedAt = Date.now()
const certificateWarningCutoff = renderedAt + 90 * 86400000

export function LearningClient({ portal=false }:{ portal?:boolean }) {
  const [courses,setCourses]=useState<Course[]>([]), [certifications,setCertifications]=useState<Certification[]>([]), [employees,setEmployees]=useState<Employee[]>([]), [canManage,setCanManage]=useState(false), [loading,setLoading]=useState(true), [mode,setMode]=useState<'course'|'enroll'|'cert'|null>(null)
  const [templates,setTemplates]=useState<Array<{id:string;name:string}>>([])
  const [tab,setTab]=useState('courses')
  const [refreshing,setRefreshing]=useState(false)
  const [loadError,setLoadError]=useState<string|null>(null)
  const [course,setCourse]=useState({action:'course',title:'',provider:'',category:'',description:'',durationHours:'',validityMonths:''})
  const [enroll,setEnroll]=useState({action:'enroll',courseId:'',employeeId:'',dueDate:''})
  const [cert,setCert]=useState({action:'certification',templateId:'',employeeId:'',name:'',issuingBody:'',credentialId:'',issuedDate:'',expiryDate:'',certificateUrl:'',notes:''})
  async function load(){
    setRefreshing(true)
    try { const r=await fetch('/api/learning'); if(!r.ok) throw new Error('Unable to load learning records. Please retry.'); const d=await r.json();setCourses(d.courses??[]);setCertifications(d.certifications??[]);setEmployees(d.employees??[]);setCanManage(Boolean(d.canManage));setTemplates(d.templates??[]);setLoadError(null) }
    catch(err){setLoadError(err instanceof Error?err.message:'Unable to load learning records.')}
    finally{setRefreshing(false);setLoading(false)}
  }
  useEffect(()=>{
    let active=true
    fetch('/api/learning').then(async r=>{if(!r.ok)throw new Error('Unable to load learning records. Please retry.');return r.json()}).then(d=>{if(active){setCourses(d.courses??[]);setCertifications(d.certifications??[]);setEmployees(d.employees??[]);setCanManage(Boolean(d.canManage));setTemplates(d.templates??[])}}).catch(()=>{if(active)setLoadError('Unable to load learning records. Please retry.')}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[])
  async function save(body:unknown){const r=await fetch('/api/learning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)return toast.error(d.error??'Could not save record');toast.success('Learning record saved');setMode(null);void load()}
  async function complete(id:string){const score=window.prompt('Completion score (0-100), optional')||undefined;const r=await fetch(`/api/learning/enrollments/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'COMPLETED',score})});if(!r.ok)return toast.error('Could not complete course');toast.success('Course marked complete');void load()}
  const expired=(date:string|null)=>Boolean(date&&new Date(date).getTime()<renderedAt)
  const soon=(date:string|null)=>Boolean(date&&!expired(date)&&new Date(date).getTime()<=certificateWarningCutoff)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{portal?'My Learning & Certifications':'Learning & Certifications'}</h1><p className="text-sm text-gray-500">Training assignments, completion records, credentials, and expiry tracking.</p></div>{canManage&&tab!=='reports'&&<div className="flex flex-wrap gap-2">{tab==='courses'&&<><Button variant="outline" onClick={()=>setMode('enroll')}><Plus className="mr-1 h-4 w-4"/>Assign course</Button></>}{tab==='certifications'&&<Button variant="outline" onClick={()=>setMode('cert')}><Award className="mr-1 h-4 w-4"/>Add certification</Button>}{tab==='courses'&&<Button onClick={()=>setMode('course')}><Plus className="mr-1 h-4 w-4"/>New course</Button>}</div>}</div>
    <Tabs value={tab} onValueChange={value=>{setTab(value);setMode(null)}}>
      <TabsList aria-label="Learning sections" className="mb-4 max-w-full">
        <TabsTrigger value="courses"><BookOpen className="mr-2 h-4 w-4"/>Courses</TabsTrigger>
        <TabsTrigger value="certifications"><Award className="mr-2 h-4 w-4"/>Certifications</TabsTrigger>
        {canManage&&!portal&&<TabsTrigger value="reports"><BarChart3 className="mr-2 h-4 w-4"/>Reports</TabsTrigger>}
      </TabsList>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><KpiCard icon={<BookOpen/>} label="Courses" value={loading?'...':courses.length}/><KpiCard icon={<Award/>} label="Certifications" tone="accent" value={loading?'...':certifications.length}/><KpiCard icon={<Clock/>} label="Course assignments" value={loading?'...':courses.reduce((sum,c)=>sum+c.enrollments.length,0)}/></div>
    {mode==='course'&&<Card><CardHeader><CardTitle>Create course</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><Input placeholder="Course title" value={course.title} onChange={e=>setCourse({...course,title:e.target.value})}/><Input placeholder="Provider" value={course.provider} onChange={e=>setCourse({...course,provider:e.target.value})}/><Input placeholder="Category" value={course.category} onChange={e=>setCourse({...course,category:e.target.value})}/><Input type="number" min="0" placeholder="Duration hours" value={course.durationHours} onChange={e=>setCourse({...course,durationHours:e.target.value})}/><Input type="number" min="1" placeholder="Certificate validity months" value={course.validityMonths} onChange={e=>setCourse({...course,validityMonths:e.target.value})}/><Input placeholder="Description" value={course.description} onChange={e=>setCourse({...course,description:e.target.value})}/><div className="flex gap-2 md:col-span-3"><Button disabled={!course.title} onClick={()=>save({...course,durationHours:course.durationHours?+course.durationHours:undefined,validityMonths:course.validityMonths?+course.validityMonths:undefined})}>Save course</Button><Button variant="outline" onClick={()=>setMode(null)}>Cancel</Button></div></CardContent></Card>}
    {mode==='enroll'&&<Card><CardHeader><CardTitle>Assign course</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><select className="h-9 rounded-md border px-3 text-sm" value={enroll.employeeId} onChange={e=>setEnroll({...enroll,employeeId:e.target.value})}><option value="">Select employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.lastName}, {e.firstName} · {e.employeeNo}</option>)}</select><select className="h-9 rounded-md border px-3 text-sm" value={enroll.courseId} onChange={e=>setEnroll({...enroll,courseId:e.target.value})}><option value="">Select course</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><Input type="date" value={enroll.dueDate} onChange={e=>setEnroll({...enroll,dueDate:e.target.value})}/><div className="flex gap-2 md:col-span-3"><Button disabled={!enroll.employeeId||!enroll.courseId} onClick={()=>save(enroll)}>Assign</Button><Button variant="outline" onClick={()=>setMode(null)}>Cancel</Button></div></CardContent></Card>}
    {mode==='cert'&&<Card><CardHeader><CardTitle>Add certification</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><select className="h-9 rounded-md border px-3 text-sm" value={cert.employeeId} onChange={e=>setCert({...cert,employeeId:e.target.value})}><option value="">Select employee</option>{employees.map(e=><option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}</select><select aria-label="Certificate template" className="h-9 rounded-md border px-3 text-sm" value={cert.templateId} onChange={e=>setCert({...cert,templateId:e.target.value})}><option value="">No certificate template</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><Input placeholder="Certification name" value={cert.name} onChange={e=>setCert({...cert,name:e.target.value})}/><Input placeholder="Issuing body" value={cert.issuingBody} onChange={e=>setCert({...cert,issuingBody:e.target.value})}/><Input placeholder="Credential ID" value={cert.credentialId} onChange={e=>setCert({...cert,credentialId:e.target.value})}/><label className="text-xs">Date issued (optional override)<Input type="date" value={cert.issuedDate} onChange={e=>setCert({...cert,issuedDate:e.target.value})}/><span className="text-gray-500">Leave blank to use the date issued automatically.</span></label><Input type="date" value={cert.expiryDate} onChange={e=>setCert({...cert,expiryDate:e.target.value})}/><Input className="md:col-span-2" placeholder="Certificate URL" value={cert.certificateUrl} onChange={e=>setCert({...cert,certificateUrl:e.target.value})}/><Input placeholder="Notes" value={cert.notes} onChange={e=>setCert({...cert,notes:e.target.value})}/><div className="flex gap-2 md:col-span-3"><Button disabled={!cert.employeeId||!cert.name} onClick={()=>save({...cert,templateId:cert.templateId||undefined})}>Save certification</Button><Button variant="outline" onClick={()=>setMode(null)}>Cancel</Button></div></CardContent></Card>}
    {loadError&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">{loadError} <button className="underline" disabled={refreshing} onClick={()=>void load()}>Retry</button></div>}
    {loading?<AppSpinner size="md" message="Loading learning records…" className="py-8" />:<><TabsContent value="courses"><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{courses.map(c=>{
        const enrollment = c.enrollments[0]
        const progress = enrollment?.learningProgress
        const destination = canManage&&!portal ? `/learning/${c.id}/builder` : `/portal/learning/${c.id}`
        return <Card key={c.id} className="flex flex-col gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
          <Link href={destination} aria-label={`${canManage&&!portal?'Manage':'Open'} ${c.title}`}><CourseCover src={c.thumbnailUrl} title={c.title}/></Link>
          <CardContent className="flex flex-1 flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">{c.category||'Training'}</span>{!portal&&<span className="text-[10px] font-medium text-gray-500">{c.status}</span>}</div>
            <Link href={destination} className="line-clamp-2 text-base font-semibold leading-snug hover:text-blue-600">{c.title}</Link>
            {portal&&<div className="mt-auto space-y-1.5 pt-1">{progress?.percent!=null ? <><div className="flex justify-between gap-2 text-xs text-gray-500"><span>{progress.completedLessons}/{progress.totalLessons} lessons</span><span>{progress.percent}%</span></div><div role="progressbar" aria-label={`${c.title} lesson progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-emerald-500" style={{width:`${progress.percent}%`}}/></div></> : <p className="text-xs text-gray-500">{enrollment?'No lessons configured':'Not assigned'}</p>}{enrollment&&<p className="text-xs text-gray-500">{(progress?.status||enrollment.status).replaceAll('_',' ')}{enrollment.dueDate?` ? Due ${new Date(enrollment.dueDate).toLocaleDateString('en-PH')}`:''}</p>}</div>}
            <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-gray-500"><span className="flex min-w-0 items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600"><BookOpen className="h-3.5 w-3.5"/></span><span className="truncate">{c.provider||'Internal training'}</span></span>{c.durationHours&&<span className="flex shrink-0 items-center gap-1"><Clock className="h-3 w-3"/>{c.durationHours}h</span>}</div>
            {canManage&&!portal&&<details className="border-t pt-2 text-xs"><summary className="cursor-pointer text-gray-500">{c.enrollments.length} employee{c.enrollments.length===1?'':'s'} assigned</summary>{c.enrollments.map(e=><div key={e.id} className="flex items-center justify-between gap-2 py-2"><span>{e.employee.firstName} {e.employee.lastName}</span>{e.status==='COMPLETED'?<span className="text-emerald-700">Completed</span>:<button className="text-blue-600 underline" onClick={()=>complete(e.id)}>Complete</button>}</div>)}</details>}
            <Button asChild size="sm" variant="outline" className="w-full"><Link href={destination}>{canManage&&!portal?'Open builder':enrollment?.status==='COMPLETED'?'Review course':progress?.status==='IN_PROGRESS'?'Continue course':'Start course'}</Link></Button>
          </CardContent>
        </Card>
      })}</div>{!courses.length&&<p className="py-12 text-center text-sm text-gray-500">No courses available yet.</p>}</TabsContent><TabsContent value="certifications" forceMount className="data-[state=inactive]:hidden">{canManage&&!portal&&<CertificateTemplateManager courses={courses} onSaved={()=>void load()}/>}<Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4"/>Certifications</CardTitle></CardHeader><CardContent>{certifications.length===0?<p className="text-sm text-gray-400">No certifications recorded.</p>:certifications.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-3 text-sm"><span><b>{c.name}</b><small className="block text-gray-500">{c.employee.firstName} {c.employee.lastName}{c.issuingBody?` · ${c.issuingBody}`:''}</small></span><span className={`text-xs font-medium ${expired(c.expiryDate)?'text-red-600':soon(c.expiryDate)?'text-amber-600':'text-emerald-600'}`}>{c.expiryDate?(expired(c.expiryDate)?'Expired ':soon(c.expiryDate)?'Expires soon ':'Expires ')+new Date(c.expiryDate).toLocaleDateString('en-PH'):'No expiry'}</span>{c.hasTemplate?<Button asChild size="sm" variant="outline"><a href={`/api/learning/certifications/${c.id}/download`}>Download PDF</a></Button>:c.certificateUrl&&/^https?:\/\//i.test(c.certificateUrl)?<Button asChild size="sm" variant="outline"><a href={c.certificateUrl} target="_blank" rel="noreferrer">View certificate</a></Button>:null}</div>)}</CardContent></Card></TabsContent>{canManage&&!portal&&<TabsContent value="reports" forceMount className="data-[state=inactive]:hidden"><EmployeeProgressSection courses={courses} onRefresh={()=>void load()} refreshing={refreshing}/></TabsContent>}</>}
    </Tabs>
  </div>
}
