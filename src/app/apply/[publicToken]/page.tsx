'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Facebook,
  Gift,
  Globe,
  Instagram,
  Linkedin,
  MapPin,
  Monitor,
  PartyPopper,
  Twitter,
  Upload,
  Wallet,
  X,
} from 'lucide-react'

type JobListItem = {
  id: string
  title: string
  department: string | null
  location: string | null
  employmentType: string | null
  workSetup: string | null
  salaryMin: number | null
  salaryMax: number | null
  publicApplyToken: string
}

type JobData = {
  id: string
  title: string
  description: string
  department: string | null
  employmentType: string | null
  workSetup: string | null
  location: string | null
  requirements: string[]
  benefits: string[]
  salaryMin: number | null
  salaryMax: number | null
  isOpen: boolean
  company: {
    name: string
    logoUrl: string | null
    industry: string | null
    website: string | null
    careerBannerUrl: string | null
    careerTagline: string | null
    careerDescription: string | null
    careerSocialFacebook: string | null
    careerSocialLinkedin: string | null
    careerSocialTwitter: string | null
    careerSocialInstagram: string | null
  }
}

function money(n: number) {
  return `\u20b1${Number(n).toLocaleString('en-PH')}`
}

function salaryRange(min: number | null, max: number | null) {
  if (min != null && max != null) return `${money(min)} \u2013 ${money(max)}/mo`
  if (min != null) return `${money(min)}+/mo`
  if (max != null) return `Up to ${money(max)}/mo`
  return null
}

const TYPE_COLORS: Record<string, string> = {
  'Full-time': 'bg-blue-50 text-blue-700',
  'Part-time': 'bg-purple-50 text-purple-700',
  'Contractual': 'bg-orange-50 text-orange-700',
  'Contract': 'bg-orange-50 text-orange-700',
  'Internship': 'bg-pink-50 text-pink-700',
}

const SETUP_COLORS: Record<string, string> = {
  'Remote': 'bg-emerald-50 text-emerald-700',
  'Hybrid': 'bg-teal-50 text-teal-700',
  'On-site': 'bg-slate-100 text-slate-700',
}

export default function PublicApplyPage() {
  const params = useParams<{ publicToken: string }>()
  const token = params?.publicToken

  const [job, setJob] = useState<JobData | null>(null)
  const [otherJobs, setOtherJobs] = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    currentAddress: '',
    expectedSalary: '',
    coverLetter: '',
    resumeFile: null as File | null,
  })

  useEffect(() => {
    if (!token) return
    setLoading(true)
    fetch(`/api/public/jobs/${token}`)
      .then(r => r.json())
      .then(data => {
        setJob(data.job ?? null)
        setOtherJobs(data.otherJobs ?? [])
      })
      .catch(() => toast.error('Unable to load job'))
      .finally(() => setLoading(false))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setSubmitting(true)
    try {
      const payload = new FormData()
      payload.set('firstName', form.firstName)
      payload.set('lastName', form.lastName)
      payload.set('email', form.email)
      payload.set('phone', form.phone)
      payload.set('currentAddress', form.currentAddress)
      payload.set('expectedSalary', form.expectedSalary)
      payload.set('coverLetter', form.coverLetter)
      if (form.resumeFile) payload.set('resumeFile', form.resumeFile)
      const res = await fetch(`/api/public/jobs/${token}/apply`, { method: 'POST', body: payload })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Application failed')
      setSubmitted(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Application failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400 animate-pulse">Loading job posting...</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-lg font-bold text-slate-700">Job not found</p>
        <p className="text-sm text-slate-400">This posting may have been removed or the link is invalid.</p>
      </div>
    )
  }

  const salary = salaryRange(job.salaryMin, job.salaryMax)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
              {job.company.logoUrl ? (
                <img src={job.company.logoUrl} alt={job.company.name} className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-4 h-4 text-slate-500" />
              )}
            </div>
            <span className="text-sm font-semibold text-slate-700">{job.company.name}</span>
          </div>
          <span className="text-xs text-slate-400 hidden sm:block">Careers at {job.company.name}</span>
        </div>
      </header>

      {/* Career banner */}
      {job.company.careerBannerUrl && (
        <div className="max-w-7xl mx-auto px-4 pt-5">
          <div className="rounded-2xl overflow-hidden bg-slate-200" style={{ maxHeight: '240px' }}>
            <img
              src={job.company.careerBannerUrl}
              alt={`${job.company.name} careers`}
              className="w-full object-cover"
              style={{ maxHeight: '240px' }}
            />
          </div>
        </div>
      )}

      {/* Company hero (shown when no banner but tagline/description exists) */}
      {!job.company.careerBannerUrl && (job.company.careerTagline || job.company.careerDescription) && (
        <div className="bg-gradient-to-r from-[#1A2D42] to-[#2a4a6b] text-white">
          <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center shrink-0">
                {job.company.logoUrl
                  ? <img src={job.company.logoUrl} alt={job.company.name} className="w-full h-full object-contain" />
                  : <Building2 className="w-7 h-7 text-white/60" />}
              </div>
              <div>
                <p className="text-xs text-white/60 uppercase tracking-widest font-semibold">{job.company.industry ?? 'Company'}</p>
                <h2 className="text-xl font-black text-white">{job.company.name}</h2>
              </div>
            </div>
            {job.company.careerTagline && (
              <p className="text-lg font-semibold text-white/90 max-w-2xl">{job.company.careerTagline}</p>
            )}
          </div>
        </div>
      )}

      {/* Job header card — full width, same container as banner */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
              {job.company.logoUrl ? (
                <img src={job.company.logoUrl} alt={job.company.name} className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-7 h-7 text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{job.company.name}</p>
              <h1 className="text-2xl font-black text-slate-900 mt-1 leading-tight">{job.title}</h1>
              <div className="flex flex-wrap gap-2 mt-3">
                {job.department && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-600">
                    <Briefcase className="w-3 h-3" /> {job.department}
                  </span>
                )}
                {job.location && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-600">
                    <MapPin className="w-3 h-3" /> {job.location}
                  </span>
                )}
                {job.employmentType && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[job.employmentType] ?? 'bg-slate-100 text-slate-600'}`}>
                    <Clock3 className="w-3 h-3" /> {job.employmentType}
                  </span>
                )}
                {job.workSetup && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${SETUP_COLORS[job.workSetup] ?? 'bg-slate-100 text-slate-600'}`}>
                    <Monitor className="w-3 h-3" /> {job.workSetup}
                  </span>
                )}
                {salary && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                    <Wallet className="w-3 h-3" /> {salary}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Apply Now row */}
          <div className="mt-5 pt-5 border-t border-slate-100 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              {job.isOpen ? "We're actively hiring for this role." : 'This position is no longer accepting applications.'}
            </p>
            {job.isOpen ? (
              <button
                onClick={() => setDrawerOpen(true)}
                className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90 transition-colors flex items-center gap-2"
              >
                Apply Now <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <span className="shrink-0 text-xs font-bold text-red-500">Closed</span>
            )}
          </div>
        </div>
      </div>

      {/* Description card — full width */}
      <div className="max-w-7xl mx-auto px-4 pt-4 pb-2">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-7">
          <div>
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-blue-500 inline-block" />
              About this role
            </h2>
            <div className="text-sm text-slate-600 leading-7 whitespace-pre-wrap">{job.description}</div>
          </div>

          {job.requirements?.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-amber-500 inline-block" />
                What we&apos;re looking for
              </h2>
              <ul className="space-y-2.5">
                {job.requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {job.benefits?.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-purple-500 inline-block" />
                Perks &amp; benefits
              </h2>
              <ul className="space-y-2.5">
                {job.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <Gift className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!job.isOpen && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-600">
              This position is no longer accepting applications.
            </div>
          )}
        </div>
      </div>

      {/* Bottom row — Other Jobs + Company Info */}
      {(otherJobs.length > 0 || job.company.careerDescription || job.company.careerTagline || job.company.careerSocialLinkedin || job.company.careerSocialFacebook || job.company.careerSocialTwitter || job.company.careerSocialInstagram || job.company.website) && (
        <div className="max-w-7xl mx-auto px-4 pb-10 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">

          {/* Other jobs */}
          {otherJobs.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-4">More at {job.company.name}</h3>
              <div className="grid grid-cols-1 gap-3">
                {otherJobs.map(item => (
                  <Link
                    key={item.id}
                    href={`/apply/${item.publicApplyToken}`}
                    className="block rounded-xl border border-slate-200 p-3 hover:border-slate-300 hover:bg-slate-50/70 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-[#1A2D42] leading-snug">{item.title}</p>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    </div>
                    {item.department && <p className="text-xs text-slate-500 mt-1">{item.department}</p>}
                    {item.location && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-slate-400 mt-0.5">
                        <MapPin className="w-2.5 h-2.5" /> {item.location}
                      </span>
                    )}
                    {salaryRange(item.salaryMin, item.salaryMax) && (
                      <p className="text-xs text-emerald-700 font-semibold mt-1">{salaryRange(item.salaryMin, item.salaryMax)}</p>
                    )}
                    {item.employmentType && (
                      <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[item.employmentType] ?? 'bg-slate-100 text-slate-600'}`}>
                        {item.employmentType}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Company info */}
          {(job.company.careerDescription || job.company.careerTagline || job.company.careerSocialLinkedin || job.company.careerSocialFacebook || job.company.careerSocialTwitter || job.company.careerSocialInstagram || job.company.website) && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                  {job.company.logoUrl
                    ? <img src={job.company.logoUrl} alt={job.company.name} className="w-full h-full object-contain" />
                    : <Building2 className="w-5 h-5 text-slate-400" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{job.company.name}</p>
                  {job.company.industry && <p className="text-xs text-slate-500">{job.company.industry}</p>}
                </div>
              </div>
              {job.company.careerTagline && (
                <p className="text-xs font-semibold text-slate-700 italic">&ldquo;{job.company.careerTagline}&rdquo;</p>
              )}
              {job.company.careerDescription && (
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-5">{job.company.careerDescription}</p>
              )}
              {(job.company.careerSocialLinkedin || job.company.careerSocialFacebook || job.company.careerSocialTwitter || job.company.careerSocialInstagram || job.company.website) && (
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {job.company.careerSocialLinkedin && (
                    <a href={job.company.careerSocialLinkedin} target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center hover:bg-blue-100 transition-colors">
                      <Linkedin className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {job.company.careerSocialFacebook && (
                    <a href={job.company.careerSocialFacebook} target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors">
                      <Facebook className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {job.company.careerSocialTwitter && (
                    <a href={job.company.careerSocialTwitter} target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 rounded-lg bg-sky-50 text-sky-500 flex items-center justify-center hover:bg-sky-100 transition-colors">
                      <Twitter className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {job.company.careerSocialInstagram && (
                    <a href={job.company.careerSocialInstagram} target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center hover:bg-pink-100 transition-colors">
                      <Instagram className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {job.company.website && (
                    <a href={job.company.website} target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors">
                      <Globe className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Application slide-in drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => !submitting && setDrawerOpen(false)} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">
            {/* Drawer header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
              <div>
                <p className="text-xs text-slate-500">{job.company.name}</p>
                <h2 className="text-base font-black text-slate-900">Apply: {job.title}</h2>
              </div>
              <button
                onClick={() => !submitting && setDrawerOpen(false)}
                className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitted ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
                  <PartyPopper className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-black text-slate-900">Application Submitted!</h3>
                <p className="text-sm text-slate-500 max-w-sm leading-6">
                  Thank you for applying to <strong>{job.title}</strong> at {job.company.name}. We&apos;ll review your application and be in touch if there&apos;s a match.
                </p>
                <button
                  onClick={() => { setDrawerOpen(false); setSubmitted(false) }}
                  className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">First Name *</label>
                    <input
                      required
                      value={form.firstName}
                      onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
                      placeholder="Juan"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last Name *</label>
                    <input
                      required
                      value={form.lastName}
                      onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
                      placeholder="Dela Cruz"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email Address *</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="juan@email.com"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone Number</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+63 9XX XXX XXXX"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Current Address</label>
                  <input
                    value={form.currentAddress}
                    onChange={e => setForm(p => ({ ...p, currentAddress: e.target.value }))}
                    placeholder="City, Province"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Expected Monthly Salary (\u20b1)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.expectedSalary}
                    onChange={e => setForm(p => ({ ...p, expectedSalary: e.target.value }))}
                    placeholder="e.g. 30000"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Resume / CV</label>
                  <label className={`flex items-center gap-3 w-full rounded-xl border-2 border-dashed px-4 py-3 cursor-pointer transition-colors ${form.resumeFile ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'}`}>
                    <Upload className={`w-4 h-4 shrink-0 ${form.resumeFile ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                      {form.resumeFile ? (
                        <p className="text-sm font-medium text-emerald-700 truncate">{form.resumeFile.name}</p>
                      ) : (
                        <>
                          <p className="text-sm text-slate-600">Click to upload resume</p>
                          <p className="text-xs text-slate-400">PDF, DOC, DOCX (max 10MB)</p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={e => setForm(p => ({ ...p, resumeFile: e.target.files?.[0] ?? null }))}
                      className="sr-only"
                    />
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cover Letter</label>
                  <textarea
                    value={form.coverLetter}
                    onChange={e => setForm(p => ({ ...p, coverLetter: e.target.value }))}
                    placeholder="Tell us why you're a great fit for this role..."
                    rows={4}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
                  />
                </div>
                <div className="pt-2 pb-6">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                  >
                    {submitting ? 'Submitting...' : (
                      <>Submit Application <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
