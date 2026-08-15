'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Briefcase, Building2, MapPin, Search, Wallet } from 'lucide-react'
import { parseCareerHeroContent } from '@/lib/career-page'
import { AppSpinner } from '@/components/ui/AppSpinner'

type Job = { id: string; title: string; department: string | null; location: string | null; employmentType: string | null; workSetup: string | null; salaryMin: number | null; salaryMax: number | null; publicApplyToken: string }
type Company = { id: string; name: string; logoUrl: string | null; industry: string | null; website: string | null; careerBannerUrl: string | null; careerTagline: string | null; careerDescription: string | null }

function money(value: number) { return `₱${value.toLocaleString('en-PH')}` }
function salary(job: Job) { return job.salaryMin != null && job.salaryMax != null ? `${money(job.salaryMin)} – ${money(job.salaryMax)}/mo` : job.salaryMin != null ? `${money(job.salaryMin)}+/mo` : job.salaryMax != null ? `Up to ${money(job.salaryMax)}/mo` : 'Salary upon application' }

export default function CompanyCareerPage() {
  const { companyId } = useParams<{ companyId: string }>()
  const [company, setCompany] = useState<Company | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('ALL')
  const [type, setType] = useState('ALL')
  const [setup, setSetup] = useState('ALL')

  useEffect(() => { if (!companyId) return; fetch(`/api/public/careers/${companyId}`).then(response => response.json().then(data => ({ response, data }))).then(({ response, data }) => { if (!response.ok) throw new Error(); setCompany(data.company); setJobs(data.jobs ?? []) }).catch(() => setCompany(null)).finally(() => setLoading(false)) }, [companyId])
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><AppSpinner size="lg" message="Loading career page…" /></div>
  if (!company) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Career page not found.</div>

  const hero = parseCareerHeroContent(company.careerDescription)
  const departments = Array.from(new Set(jobs.map(job => job.department).filter((value): value is string => Boolean(value))))
  const types = Array.from(new Set(jobs.map(job => job.employmentType).filter((value): value is string => Boolean(value))))
  const setups = Array.from(new Set(jobs.map(job => job.workSetup).filter((value): value is string => Boolean(value))))
  const visible = jobs.filter(job => (!search.trim() || `${job.title} ${job.location ?? ''} ${job.department ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())) && (department === 'ALL' || job.department === department) && (type === 'ALL' || job.employmentType === type) && (setup === 'ALL' || job.workSetup === setup))

  return <main className="min-h-screen bg-slate-50">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4">{company.logoUrl ? <img src={company.logoUrl} alt={company.name} className="h-10 w-10 rounded-xl object-contain" /> : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Building2 className="h-5 w-5" /></span>}<div><p className="font-black text-slate-900">{company.name}</p><p className="text-xs text-slate-400">Careers</p></div></div></header>
    <section className="relative isolate min-h-[480px] overflow-hidden bg-[#071d3b] text-white">{company.careerBannerUrl && <img src={company.careerBannerUrl} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />}<div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(7,29,59,0.82)_0%,rgba(7,91,212,0.58)_48%,rgba(11,111,251,0.34)_100%)]" /><div className="mx-auto flex min-h-[480px] max-w-7xl items-center px-5 py-16"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.22em] text-white">Careers at {company.name}</p><h1 className="mt-5 text-4xl font-black leading-tight sm:text-6xl">{company.careerTagline || `Do your best work at ${company.name}.`}</h1>{hero.subtext && <p className="mt-5 max-w-2xl text-lg leading-7 text-blue-50">{hero.subtext}</p>}<a href="#open-positions" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#075bd4] shadow-sm hover:bg-blue-50">{hero.ctaLabel || 'View open positions'}<ArrowRight className="h-4 w-4" /></a></div></div></section>
    <section id="open-positions" className="mx-auto max-w-7xl px-5 py-14"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#2563eb]">Join our team</p><h2 className="mt-2 text-3xl font-black text-[#12345b]">Open Positions</h2><div className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(140px,auto))]"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search jobs or locations" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#2563eb]" /></label><Filter label="departments" value={department} values={departments} onChange={setDepartment} /><Filter label="employment types" value={type} values={types} onChange={setType} /><Filter label="work setups" value={setup} values={setups} onChange={setSetup} /></div>
      {visible.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visible.map(job => <Link key={job.id} href={`/apply/${job.publicApplyToken}`} className="group flex min-h-80 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg"><div className="flex items-start justify-between gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#2563eb]"><Briefcase className="h-6 w-6" /></span>{job.employmentType && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">{job.employmentType}</span>}</div><div className="mt-6 min-w-0"><h3 className="text-xl font-black leading-snug text-[#12345b] group-hover:text-[#2563eb]">{job.title}</h3><div className="mt-4 space-y-2 text-xs text-slate-500">{job.department && <p className="flex items-center gap-2"><Briefcase className="h-3.5 w-3.5 text-slate-400" />{job.department}</p>}<p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-slate-400" />{job.location || 'Location to be discussed'}</p>{job.workSetup && <p className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-slate-400" />{job.workSetup}</p>}</div></div><div className="mt-auto border-t border-slate-100 pt-5"><p className="flex items-start gap-2 text-xs font-bold leading-5 text-slate-800"><Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />{salary(job)}</p><span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#2563eb]">View job<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></div></Link>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 py-14 text-center text-sm text-slate-500">No open positions match those filters.</div>}
    </section>
  </main>
}

function Filter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) { return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600"><option value="ALL">All {label}</option>{values.map(item => <option key={item} value={item}>{item}</option>)}</select> }
