'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, Facebook, Globe, ImageIcon, Instagram, Linkedin, Save, Twitter, X } from 'lucide-react'
import { toast } from 'sonner'

interface CareerSettings {
  name: string
  logoUrl: string | null
  careerBannerUrl: string | null
  careerTagline: string | null
  careerDescription: string | null
  careerSocialFacebook: string | null
  careerSocialLinkedin: string | null
  careerSocialTwitter: string | null
  careerSocialInstagram: string | null
  website: string | null
}

type TemplateType = 'INTERVIEW' | 'REJECTION' | 'OFFER'

type EmailTemplate = {
  type: TemplateType
  subject: string
  body: string
  isActive: boolean
}

export default function RecruitmentSettingsPage() {
  const [settings, setSettings] = useState<CareerSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)
  const [form, setForm] = useState({
    careerBannerUrl: null as string | null,
    careerTagline: '',
    careerDescription: '',
    careerSocialFacebook: '',
    careerSocialLinkedin: '',
    careerSocialTwitter: '',
    careerSocialInstagram: '',
  })
  const [smtp, setSmtp] = useState({
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    smtpPass: '',
    smtpFromEmail: '',
    smtpFromName: '',
    hasSmtpPass: false,
  })
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const bannerInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(data)
        setForm({
          careerBannerUrl: data.careerBannerUrl ?? null,
          careerTagline: data.careerTagline ?? '',
          careerDescription: data.careerDescription ?? '',
          careerSocialFacebook: data.careerSocialFacebook ?? '',
          careerSocialLinkedin: data.careerSocialLinkedin ?? '',
          careerSocialTwitter: data.careerSocialTwitter ?? '',
          careerSocialInstagram: data.careerSocialInstagram ?? '',
        })
      })
      .catch(() => toast.error('Failed to load settings'))
  }, [])

  useEffect(() => {
    fetch('/api/recruitment/email-settings')
      .then(r => r.json())
      .then(data => {
        if (data?.smtp) {
          setSmtp({
            smtpHost: data.smtp.smtpHost ?? '',
            smtpPort: Number(data.smtp.smtpPort ?? 465),
            smtpSecure: Boolean(data.smtp.smtpSecure ?? true),
            smtpUser: data.smtp.smtpUser ?? '',
            smtpPass: '',
            smtpFromEmail: data.smtp.smtpFromEmail ?? '',
            smtpFromName: data.smtp.smtpFromName ?? '',
            hasSmtpPass: Boolean(data.smtp.hasSmtpPass),
          })
        }
        setTemplates(Array.isArray(data?.templates) ? data.templates : [])
      })
      .catch(() => toast.error('Failed to load recruitment email settings'))
  }, [])

  function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Banner image must be under 4MB')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      setForm(p => ({ ...p, careerBannerUrl: ev.target?.result as string }))
    }
    reader.readAsDataURL(file)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          careerBannerUrl: form.careerBannerUrl,
          careerTagline: form.careerTagline || null,
          careerDescription: form.careerDescription || null,
          careerSocialFacebook: form.careerSocialFacebook || null,
          careerSocialLinkedin: form.careerSocialLinkedin || null,
          careerSocialTwitter: form.careerSocialTwitter || null,
          careerSocialInstagram: form.careerSocialInstagram || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Save failed')
      toast.success('Career page saved')
      setSettings(s => s ? { ...s, ...data } : s)
      // Sync form with stored URLs returned from server (base64 → storage URL)
      setForm(p => ({
        ...p,
        careerBannerUrl: data.careerBannerUrl ?? p.careerBannerUrl,
        careerTagline: data.careerTagline ?? p.careerTagline,
        careerDescription: data.careerDescription ?? p.careerDescription,
        careerSocialFacebook: data.careerSocialFacebook ?? p.careerSocialFacebook,
        careerSocialLinkedin: data.careerSocialLinkedin ?? p.careerSocialLinkedin,
        careerSocialTwitter: data.careerSocialTwitter ?? p.careerSocialTwitter,
        careerSocialInstagram: data.careerSocialInstagram ?? p.careerSocialInstagram,
      }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveEmailSettings() {
    setSavingEmail(true)
    try {
      const res = await fetch('/api/recruitment/email-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: smtp.smtpHost || null,
          smtpPort: Number(smtp.smtpPort || 465),
          smtpSecure: smtp.smtpSecure,
          smtpUser: smtp.smtpUser || null,
          smtpPass: smtp.smtpPass || undefined,
          smtpFromEmail: smtp.smtpFromEmail || null,
          smtpFromName: smtp.smtpFromName || null,
          templates,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save email settings')
      setSmtp(prev => ({ ...prev, smtpPass: '', hasSmtpPass: Boolean(prev.smtpPass || prev.hasSmtpPass) }))
      toast.success('Recruitment email settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save email settings')
    } finally {
      setSavingEmail(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <Link href="/recruitment" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3 font-medium">
          <ArrowLeft className="w-3 h-3" /> Back to Recruitment
        </Link>
        <h1 className="text-2xl font-black text-slate-900">Career Page Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Customize what applicants see on your public job postings page.</p>
      </div>

      {/* Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">Banner Image</h2>
        <p className="text-xs text-slate-500">Displayed at the top of your public careers page. Recommended size: 1200 &times; 400px (JPG/PNG, max 4MB).</p>

        <div className="relative rounded-xl overflow-hidden bg-slate-100 border border-slate-200" style={{ height: '180px' }}>
          {form.careerBannerUrl ? (
            <>
              <img src={form.careerBannerUrl} alt="Career banner" className="w-full h-full object-cover" />
              <button
                onClick={() => { setForm(p => ({ ...p, careerBannerUrl: null })); if (bannerInputRef.current) bannerInputRef.current.value = '' }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => bannerInputRef.current?.click()}
              className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ImageIcon className="w-8 h-8" />
              <span className="text-sm font-medium">Click to upload banner</span>
              <span className="text-xs">JPG, PNG &bull; Max 4MB</span>
            </button>
          )}
        </div>

        {form.careerBannerUrl && (
          <button
            onClick={() => bannerInputRef.current?.click()}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium underline underline-offset-2"
          >
            Replace image
          </button>
        )}

        <input
          ref={bannerInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleBannerFile}
          className="sr-only"
        />
      </div>

      {/* Company blurb */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">Company Branding</h2>

        {/* Preview of logo + name */}
        {settings && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt={settings.name} className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{settings.name}</p>
              <p className="text-xs text-slate-500">Logo & company name come from Company Settings</p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tagline <span className="text-slate-400 font-normal">(max 200 chars)</span></label>
          <input
            value={form.careerTagline}
            onChange={e => setForm(p => ({ ...p, careerTagline: e.target.value }))}
            maxLength={200}
            placeholder="e.g. Building the future of Filipino workplaces"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <p className="text-xs text-slate-400 mt-1 text-right">{form.careerTagline.length}/200</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">About the Company <span className="text-slate-400 font-normal">(shown on every job posting)</span></label>
          <textarea
            value={form.careerDescription}
            onChange={e => setForm(p => ({ ...p, careerDescription: e.target.value }))}
            maxLength={2000}
            rows={5}
            placeholder="Tell applicants about your mission, culture, and what makes your company a great place to work..."
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
          />
          <p className="text-xs text-slate-400 mt-1 text-right">{form.careerDescription.length}/2000</p>
        </div>
      </div>

      {/* Social links */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">Social Media &amp; Website</h2>
        <p className="text-xs text-slate-500">Links will appear on your public job postings so applicants can learn more about you.</p>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Linkedin className="w-4 h-4 text-blue-700" />
            </div>
            <input
              value={form.careerSocialLinkedin}
              onChange={e => setForm(p => ({ ...p, careerSocialLinkedin: e.target.value }))}
              placeholder="https://linkedin.com/company/your-company"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Facebook className="w-4 h-4 text-blue-600" />
            </div>
            <input
              value={form.careerSocialFacebook}
              onChange={e => setForm(p => ({ ...p, careerSocialFacebook: e.target.value }))}
              placeholder="https://facebook.com/yourcompany"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
              <Twitter className="w-4 h-4 text-sky-500" />
            </div>
            <input
              value={form.careerSocialTwitter}
              onChange={e => setForm(p => ({ ...p, careerSocialTwitter: e.target.value }))}
              placeholder="https://twitter.com/yourcompany"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center shrink-0">
              <Instagram className="w-4 h-4 text-pink-600" />
            </div>
            <input
              value={form.careerSocialInstagram}
              onChange={e => setForm(p => ({ ...p, careerSocialInstagram: e.target.value }))}
              placeholder="https://instagram.com/yourcompany"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          {settings?.website && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-slate-600" />
              </div>
              <p className="text-sm text-slate-500 flex-1">
                Website: <a href={settings.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{settings.website}</a>
                <span className="ml-1 text-xs text-slate-400">(edit in Company Settings)</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">Company SMTP for Recruitment Emails</h2>
        <p className="text-xs text-slate-500">Used when sending interview, rejection, and offer emails to applicants.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={smtp.smtpHost} onChange={e => setSmtp(p => ({ ...p, smtpHost: e.target.value }))} placeholder="SMTP Host (e.g. smtp.gmail.com)" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input type="number" value={smtp.smtpPort} onChange={e => setSmtp(p => ({ ...p, smtpPort: Number(e.target.value || 465) }))} placeholder="SMTP Port" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={smtp.smtpUser} onChange={e => setSmtp(p => ({ ...p, smtpUser: e.target.value }))} placeholder="SMTP Username" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input type="password" value={smtp.smtpPass} onChange={e => setSmtp(p => ({ ...p, smtpPass: e.target.value }))} placeholder={smtp.hasSmtpPass ? 'SMTP Password (leave blank to keep current)' : 'SMTP Password'} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={smtp.smtpFromName} onChange={e => setSmtp(p => ({ ...p, smtpFromName: e.target.value }))} placeholder="From Name (e.g. ACME HR)" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input type="email" value={smtp.smtpFromEmail} onChange={e => setSmtp(p => ({ ...p, smtpFromEmail: e.target.value }))} placeholder="From Email" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={smtp.smtpSecure} onChange={e => setSmtp(p => ({ ...p, smtpSecure: e.target.checked }))} />
          Use secure connection (SSL/TLS)
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-800">Recruitment Email Templates</h2>
        <p className="text-xs text-slate-500">Available variables: {'{{firstName}}'}, {'{{lastName}}'}, {'{{jobTitle}}'}, {'{{companyName}}'}.</p>
        <div className="space-y-4">
          {templates.map((tpl, idx) => (
            <div key={tpl.type} className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700">{tpl.type}</p>
                <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" checked={tpl.isActive} onChange={e => setTemplates(prev => prev.map((item, i) => i === idx ? { ...item, isActive: e.target.checked } : item))} />
                  Active
                </label>
              </div>
              <input value={tpl.subject} onChange={e => setTemplates(prev => prev.map((item, i) => i === idx ? { ...item, subject: e.target.value } : item))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Subject" />
              <textarea value={tpl.body} onChange={e => setTemplates(prev => prev.map((item, i) => i === idx ? { ...item, body: e.target.value } : item))} rows={5} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none" placeholder="Email body" />
            </div>
          ))}
        </div>
        <button
          onClick={saveEmailSettings}
          disabled={savingEmail}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {savingEmail ? 'Saving...' : 'Save Email Settings'}
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1A2D42] hover:bg-[#1A2D42]/90 disabled:opacity-60 transition-colors inline-flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Career Page'}
        </button>
      </div>
    </div>
  )
}
